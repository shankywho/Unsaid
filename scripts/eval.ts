import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db';
import { bootstrapQdrant, collections } from '../src/adapters/qdrant/collections';
import { qdrant } from '../src/adapters/qdrant/client';
import { runIngestPipeline } from '../src/orchestrator/ingestPipeline';
import { runAssistPipeline } from '../src/orchestrator/assistPipeline';
import { runAgent } from '../src/agents/runAgent';
import { EvalJudgeOutputSchema, type HypothesisItem } from '../src/agents/schemas';
import { upsertSubstitution } from '../src/memory/wordMap';

interface EvalItem {
  fragment: string;
  goldIntent: string;
  goldKeywords: string[];
  requiresContext: boolean;
}

export interface StepLatencyStats {
  node: string;
  count: number;
  p50Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface ModeResult {
  mode: string;
  top1: number;
  top3: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  total: number;
  top1Hits: number;
  top3Hits: number;
  stepStats: Record<string, StepLatencyStats>;
}

function computeStats(arr: number[]): { p50: number; avg: number; min: number; max: number } {
  if (arr.length === 0) return { p50: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const p50 = sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { p50, avg, min, max };
}

async function resetUserWordMap(userId: string): Promise<void> {
  // Clear any existing word map points in Qdrant for this user
  try {
    await qdrant.delete(collections.wordmap, {
      filter: { must: [{ key: 'userId', match: { value: userId } }] },
    });
  } catch (err: unknown) {
    void err; // collection may not exist yet or have zero points
  }
  await prisma.wordMapEntry.deleteMany({ where: { userId } });
  // Word map starts completely empty per leakage audit
}

export async function runEval(): Promise<{ on: ModeResult; off: ModeResult }> {
  console.log('=====================================================');
  console.log('  UNSAID — Ablation Evaluation (Context ON vs OFF)   ');
  console.log('=====================================================\n');

  await bootstrapQdrant();

  const evalPath = path.resolve(__dirname, '../fixtures/fragments-eval.json');
  const ambientPath = path.resolve(__dirname, '../fixtures/ambient-week.json');

  const fragments: EvalItem[] = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  const ambientSegments = JSON.parse(fs.readFileSync(ambientPath, 'utf8'));

  // Setup users for both modes
  const userOn = await prisma.user.create({
    data: {
      displayName: `Eval User (Context ON) ${Date.now()}`,
      contextEnabled: true,
      assistMode: 'AUTO',
    },
  });

  const userOff = await prisma.user.create({
    data: {
      displayName: `Eval User (Context OFF) ${Date.now()}`,
      contextEnabled: false,
      assistMode: 'AUTO',
    },
  });

  console.log('Setting up ambient memory for userOn...');
  const demoUser = await prisma.user.findFirst({
    where: { displayName: 'Mohan Lal Sharma' },
  });

  let clonedFromDemo = false;
  if (demoUser) {
    const scrollRes = await qdrant.scroll(collections.memory, {
      filter: {
        must: [{ key: 'userId', match: { value: demoUser.id } }],
      },
      limit: 100,
      with_payload: true,
      with_vector: true,
    });
    if (scrollRes.points.length > 0) {
      const pointsToInsert = scrollRes.points.map((pt) => ({
        id: randomUUID(),
        vector: pt.vector as number[],
        payload: {
          ...(pt.payload as any),
          userId: userOn.id,
        },
      }));
      await qdrant.upsert(collections.memory, { points: pointsToInsert });
      console.log(`✓ Cloned ${pointsToInsert.length} memory facts from demo persona into eval userOn.`);
      clonedFromDemo = true;
    }
  }

  if (!clonedFromDemo) {
    for (let i = 0; i < ambientSegments.length; i += 6) {
      const chunk = ambientSegments.slice(i, i + 6);
      await runIngestPipeline({
        userId: userOn.id,
        sessionId: `seed_eval_${userOn.id}`,
        segments: chunk.map((s: any, idx: number) => ({
          id: `eval_seed_${userOn.id}_${i + idx}`,
          text: s.text,
          speaker: s.speaker,
        })),
      });
    }
  }

  console.log('✓ Seeding complete. Evaluating test set of', fragments.length, 'fragments...\n');

  async function evaluateMode(user: any, modeName: string): Promise<ModeResult> {
    console.log(`\nEvaluating: [${modeName}] ...`);
    let top1Hits = 0;
    let top3Hits = 0;
    const pipelineLatencies: number[] = [];
    const stepRecords: Record<string, number[]> = {
      classify: [],
      fragment_analyze: [],
      retrieve_memory: [],
      retrieve_wordmap: [],
      hypothesize: [],
      compose_question: [],
      eval_judge: [],
    };

    for (let i = 0; i < fragments.length; i++) {
      const item = fragments[i];

      // Leakage guard: reset word map strictly from fixed fixture before each fragment
      await resetUserWordMap(user.id);

      await prisma.confirmation.updateMany({
        where: { userId: user.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      const t0 = Date.now();
      const assistRes = await runAssistPipeline({
        userId: user.id,
        text: item.fragment,
        source: 'SIMULATED',
      });
      const latency = Date.now() - t0;
      pipelineLatencies.push(latency);

      // Collect per-step latency from DB steps
      if (assistRes.runId) {
        const steps = await prisma.step.findMany({
          where: { runId: assistRes.runId },
        });
        for (const s of steps) {
          if (s.latencyMs !== null && s.latencyMs !== undefined) {
            if (!stepRecords[s.node]) stepRecords[s.node] = [];
            stepRecords[s.node].push(s.latencyMs);
          }
        }
      }

      let hypotheses: HypothesisItem[] = [];
      if (assistRes.confirmationId) {
        const conf = await prisma.confirmation.findUnique({
          where: { id: assistRes.confirmationId },
        });
        hypotheses = (conf?.hypotheses as unknown as HypothesisItem[]) || [];
      }

      let top1Match = false;
      let top3Match = false;

      if (hypotheses.length > 0) {
        // Judge top 1
        const top1 = hypotheses[0];
        const tJudge0 = Date.now();
        const judgeTop1 = await runAgent(
          'eval_judge',
          EvalJudgeOutputSchema,
          {
            fragment: item.fragment,
            hypothesisSentence: top1.sentence,
            hypothesisIntent: top1.intent,
            goldIntent: item.goldIntent,
            goldKeywords: item.goldKeywords,
          },
          { userId: user.id },
        );
        stepRecords.eval_judge.push(Date.now() - tJudge0);

        if (judgeTop1.match) {
          top1Hits++;
          top3Hits++;
          top1Match = true;
          top3Match = true;
        } else {
          // Check top 2 and 3
          for (const hyp of hypotheses.slice(1, 3)) {
            const tJudgeNext0 = Date.now();
            const judge = await runAgent(
              'eval_judge',
              EvalJudgeOutputSchema,
              {
                fragment: item.fragment,
                hypothesisSentence: hyp.sentence,
                hypothesisIntent: hyp.intent,
                goldIntent: item.goldIntent,
                goldKeywords: item.goldKeywords,
              },
              { userId: user.id },
            );
            stepRecords.eval_judge.push(Date.now() - tJudgeNext0);
            if (judge.match) {
              top3Hits++;
              top3Match = true;
              break;
            }
          }
        }
      }

      const matchLabel = top1Match ? 'Top-1 ✓' : top3Match ? 'Top-3 ✓' : '✗';
      console.log(
        `  [${i + 1}/${fragments.length}] "${item.fragment}" -> ${matchLabel} (assist: ${latency}ms)`,
      );
    }

    const total = fragments.length;
    const pipeStats = computeStats(pipelineLatencies);
    const stepStats: Record<string, StepLatencyStats> = {};

    for (const [node, times] of Object.entries(stepRecords)) {
      const stats = computeStats(times);
      stepStats[node] = {
        node,
        count: times.length,
        p50Ms: stats.p50,
        avgMs: stats.avg,
        minMs: stats.min,
        maxMs: stats.max,
      };
    }

    return {
      mode: modeName,
      top1: Number((top1Hits / total).toFixed(2)),
      top3: Number((top3Hits / total).toFixed(2)),
      avgLatencyMs: pipeStats.avg,
      p50LatencyMs: pipeStats.p50,
      total,
      top1Hits,
      top3Hits,
      stepStats,
    };
  }

  const resultOn = await evaluateMode(userOn, 'context ON');
  const resultOff = await evaluateMode(userOff, 'context OFF');

  // Format accuracy summary table
  const accuracyTable = [
    'mode         top1   top3   p50_latency_ms   avg_latency_ms',
    `context ON   ${resultOn.top1.toFixed(2)}   ${resultOn.top3.toFixed(2)}   ${resultOn.p50LatencyMs.toString().padEnd(16)} ${resultOn.avgLatencyMs}`,
    `context OFF  ${resultOff.top1.toFixed(2)}   ${resultOff.top3.toFixed(2)}   ${resultOff.p50LatencyMs.toString().padEnd(16)} ${resultOff.avgLatencyMs}`,
  ].join('\n');

  // Format per-step latency table for context ON
  const stepRows = Object.values(resultOn.stepStats).map((s) => {
    const nodeCol = s.node.padEnd(25);
    const p50Col = `${s.p50Ms}ms`.padEnd(12);
    const avgCol = `${s.avgMs}ms`.padEnd(12);
    const minCol = `${s.minMs}ms`.padEnd(10);
    const maxCol = `${s.maxMs}ms`.padEnd(10);
    const countCol = `${s.count}`;
    return `${nodeCol} ${p50Col} ${avgCol} ${minCol} ${maxCol} ${countCol}`;
  });

  const stepTable = [
    'Step / Node               p50          Avg          Min        Max        Count',
    '------------------------- ------------ ------------ ---------- ---------- -----',
    ...stepRows,
    '------------------------- ------------ ------------ ---------- ---------- -----',
    `TOTAL ASSIST PIPELINE     ${resultOn.p50LatencyMs}ms`.padEnd(38) +
      `${resultOn.avgLatencyMs}ms`.padEnd(13) +
      `p50 < 6s target: ${resultOn.p50LatencyMs < 6000 ? 'MET ✓' : 'EXCEEDED'}`,
  ].join('\n');

  console.log('\n=====================================================');
  console.log('  EVALUATION ACCURACY BENCHMARK                      ');
  console.log('=====================================================\n');
  console.log(accuracyTable);
  console.log('\n=====================================================');
  console.log('  PER-STEP LATENCY BREAKDOWN (Context ON)            ');
  console.log('=====================================================\n');
  console.log(stepTable);
  console.log('\n=====================================================\n');

  // Save report to eval-results/
  const outDir = path.resolve(__dirname, '../eval-results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `${timestamp}.json`);
  const mdPath = path.join(outDir, `${timestamp}.md`);

  const reportData = {
    timestamp: new Date().toISOString(),
    totalFragments: fragments.length,
    results: [resultOn, resultOff],
  };

  fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf8');

  const mdReport = `# Unsaid Evaluation Report (${new Date().toLocaleDateString()})

Ablation evaluation of personal context vector retrieval on fragmented speech reconstruction for expressive aphasia.

## Accuracy Benchmark

\`\`\`
${accuracyTable}
\`\`\`

## Per-Step Latency Breakdown (Context ON)

\`\`\`
${stepTable}
\`\`\`

- **Total Test Fragments:** ${fragments.length}
- **Context Dependent:** ~70%
- **Inference Engine:** Lyzr Studio v3 (OpenAI gpt-4o-mini backend)
- **Evaluation Agent:** \`eval_judge\` via Lyzr
`;
  fs.writeFileSync(mdPath, mdReport, 'utf8');

  console.log(`Results saved to:\n  • ${jsonPath}\n  • ${mdPath}\n`);

  return { on: resultOn, off: resultOff };
}

if (require.main === module) {
  runEval()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Eval error:', err);
      process.exit(1);
    });
}
