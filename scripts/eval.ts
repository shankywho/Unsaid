import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/db';
import { bootstrapQdrant } from '../src/adapters/qdrant/collections';
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

interface ModeResult {
  mode: string;
  top1: number;
  top3: number;
  avgLatencyMs: number;
  total: number;
  top1Hits: number;
  top3Hits: number;
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

  console.log('Seeding ambient knowledge for both users...');
  for (const u of [userOn, userOff]) {
    for (let i = 0; i < ambientSegments.length; i += 6) {
      const chunk = ambientSegments.slice(i, i + 6);
      await runIngestPipeline({
        userId: u.id,
        sessionId: `seed_eval_${u.id}`,
        segments: chunk.map((s: any, idx: number) => ({
          id: `eval_seed_${u.id}_${i + idx}`,
          text: s.text,
          speaker: s.speaker,
        })),
      });
    }
    // Baseline substitution
    await upsertSubstitution(u.id, 'car', 'walk');
  }
  console.log('✓ Seeding complete. Evaluating test set of', fragments.length, 'fragments...\n');

  async function evaluateMode(user: any, modeName: string): Promise<ModeResult> {
    console.log(`Evaluating: [${modeName}] ...`);
    let top1Hits = 0;
    let top3Hits = 0;
    let totalLatency = 0;

    for (let i = 0; i < fragments.length; i++) {
      const item = fragments[i];
      const t0 = Date.now();

      const assistRes = await runAssistPipeline({
        userId: user.id,
        text: item.fragment,
        source: 'SIMULATED',
      });

      const latency = Date.now() - t0;
      totalLatency += latency;

      let hypotheses: HypothesisItem[] = [];
      if (assistRes.confirmationId) {
        const conf = await prisma.confirmation.findUnique({
          where: { id: assistRes.confirmationId },
        });
        hypotheses = (conf?.hypotheses as unknown as HypothesisItem[]) || [];
      }

      if (hypotheses.length > 0) {
        // Judge top 1
        const top1 = hypotheses[0];
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

        if (judgeTop1.match) {
          top1Hits++;
          top3Hits++;
        } else {
          // Check if top 2 or 3 match
          let matchedTop3 = false;
          for (const hyp of hypotheses.slice(1, 3)) {
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
            if (judge.match) {
              matchedTop3 = true;
              break;
            }
          }
          if (matchedTop3) top3Hits++;
        }
      }
      process.stdout.write('.');
    }
    console.log(` Done.`);

    const total = fragments.length;
    return {
      mode: modeName,
      top1: Number((top1Hits / total).toFixed(2)),
      top3: Number((top3Hits / total).toFixed(2)),
      avgLatencyMs: Math.round(totalLatency / total),
      total,
      top1Hits,
      top3Hits,
    };
  }

  const resultOn = await evaluateMode(userOn, 'context ON');
  const resultOff = await evaluateMode(userOff, 'context OFF');

  // Format and print report
  const table = [
    'mode         top1   top3   avg_latency_ms',
    `context ON   ${resultOn.top1.toFixed(2)}   ${resultOn.top3.toFixed(2)}   ${resultOn.avgLatencyMs}`,
    `context OFF  ${resultOff.top1.toFixed(2)}   ${resultOff.top3.toFixed(2)}   ${resultOff.avgLatencyMs}`,
  ].join('\n');

  console.log('\n=====================================================');
  console.log('  EVALUATION RESULTS                                 ');
  console.log('=====================================================\n');
  console.log(table);
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

\`\`\`
${table}
\`\`\`

- **Total Test Fragments:** ${fragments.length}
- **Context Dependent:** ~70%
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
