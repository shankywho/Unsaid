import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db';
import { bootstrapQdrant, collections } from '../src/adapters/qdrant/collections';
import { qdrant } from '../src/adapters/qdrant/client';
import { runAssistPipeline } from '../src/orchestrator/assistPipeline';
import { answerConfirmation } from '../src/confirmations/service';
import { runLearnPipeline } from '../src/orchestrator/learnPipeline';
import { runAgent } from '../src/agents/runAgent';
import { EvalJudgeOutputSchema, type HypothesisItem } from '../src/agents/schemas';

interface LearningCase {
  name: string;
  trainingFragment: string;
  confirmedSentence: string;
  testFragment: string; // DIFFERENT phrasing of the same underlying intent
  goldIntent: string;
  goldKeywords: string[];
}

const CASES: LearningCase[] = [
  {
    name: 'Semantic Paraphasia ("car" -> "walk")',
    trainingFragment: 'car… park… six',
    confirmedSentence: 'It is time for our evening walk in the park.',
    testFragment: 'car… today… garden',
    goldIntent: 'Go for a walk today in the garden',
    goldKeywords: ['walk', 'garden'],
  },
  {
    name: 'Name Alias ("Pri" -> "Priya")',
    trainingFragment: 'Pri… beti… come',
    confirmedSentence: 'My daughter Priya is coming to visit.',
    testFragment: 'Pri… Sunday… what time?',
    goldIntent: 'Ask what time Priya will arrive on Sunday',
    goldKeywords: ['Priya', 'Sunday', 'time'],
  },
  {
    name: 'Anomic Circumlocution ("the thing… eyes" -> "reading glasses")',
    trainingFragment: 'the… the thing… eyes… broken',
    confirmedSentence: 'My reading glasses are broken and need repair.',
    testFragment: 'thing… eyes… table',
    goldIntent: 'Ask for reading glasses on the table',
    goldKeywords: ['glasses', 'table'],
  },
  {
    name: 'Phonemic Paraphasia ("bap" -> "bat")',
    trainingFragment: 'Aarav… bap… broken',
    confirmedSentence: "Aarav's cricket bat grip is broken.",
    testFragment: 'Aarav… new… bap',
    goldIntent: 'Ask about getting a new cricket bat for Aarav',
    goldKeywords: ['Aarav', 'bat', 'cricket'],
  },
  {
    name: 'Semantic Paraphasia ("tea" -> "coffee")',
    trainingFragment: 'tea… morning… cup',
    confirmedSentence: 'I would like a cup of hot black coffee this morning.',
    testFragment: 'hot… tea… please',
    goldIntent: 'Request hot coffee',
    goldKeywords: ['coffee'],
  },
  {
    name: 'Semantic Paraphasia ("radio" -> "newspaper")',
    trainingFragment: 'read… radio… morning',
    confirmedSentence: 'I want to read the morning newspaper.',
    testFragment: 'radio… table… where?',
    goldIntent: 'Ask where the newspaper is on the table',
    goldKeywords: ['newspaper', 'table'],
  },
  {
    name: 'Name Alias ("Ram" -> "Ramesh")',
    trainingFragment: 'Ram… office… bill',
    confirmedSentence: 'Ramesh paid the water bill from the office.',
    testFragment: 'Ram… home… when?',
    goldIntent: 'Ask when Ramesh is coming home',
    goldKeywords: ['Ramesh', 'home'],
  },
  {
    name: 'Anomic Circumlocution ("the loud box" -> "vintage radio")',
    trainingFragment: 'loud box… songs… on',
    confirmedSentence: 'Please turn on the vintage radio for old songs.',
    testFragment: 'loud box… battery',
    goldIntent: 'Check the battery in the vintage radio',
    goldKeywords: ['radio', 'battery'],
  },
  {
    name: 'Semantic Paraphasia ("doctor" -> "physio")',
    trainingFragment: 'doctor… shoulder… Thursday',
    confirmedSentence: 'The physiotherapist is coming on Thursday for exercises.',
    testFragment: 'doctor… exercises… today?',
    goldIntent: 'Ask if the physiotherapist is coming today for exercises',
    goldKeywords: ['physio', 'exercises'],
  },
  {
    name: 'Semantic Paraphasia ("apple" -> "medicine")',
    trainingFragment: 'give… apple… after lunch',
    confirmedSentence: 'Please give me my prescribed diabetes medicine after lunch.',
    testFragment: 'morning… apple… water',
    goldIntent: 'Request morning medicine with water',
    goldKeywords: ['medicine', 'morning'],
  },
];

export async function runLearningLoopEval() {
  console.log('=====================================================');
  console.log('  UNSAID — Learning Loop Evaluation                  ');
  console.log('  Testing adaptation to patient-specific phrasing    ');
  console.log('=====================================================\n');

  await bootstrapQdrant();

  // Create isolated user for learning evaluation
  const user = await prisma.user.create({
    data: {
      displayName: `Learn Eval User ${Date.now()}`,
      contextEnabled: true,
      assistMode: 'AUTO',
    },
  });

  // Clone memory from demo user
  const demoUser = await prisma.user.findFirst({
    where: { displayName: 'Mohan Lal Sharma' },
  });
  if (demoUser) {
    const scrollRes = await qdrant.scroll(collections.memory, {
      filter: { must: [{ key: 'userId', match: { value: demoUser.id } }] },
      limit: 100,
      with_payload: true,
      with_vector: true,
    });
    if (scrollRes.points.length > 0) {
      const pointsToInsert = scrollRes.points.map((pt) => ({
        id: randomUUID(),
        vector: pt.vector as number[],
        payload: { ...(pt.payload as any), userId: user.id },
      }));
      await qdrant.upsert(collections.memory, { points: pointsToInsert });
    }
  }

  // Ensure word map starts 100% EMPTY
  try {
    await qdrant.delete(collections.wordmap, {
      filter: { must: [{ key: 'userId', match: { value: user.id } }] },
    });
  } catch (err: unknown) {
    void err;
  }
  await prisma.wordMapEntry.deleteMany({ where: { userId: user.id } });

  console.log(`Initialized user ${user.id} with empty word map.\n`);

  interface CaseResult {
    name: string;
    testFragment: string;
    beforeMatch: boolean;
    beforeConfidence: number;
    beforeIntent: string;
    afterMatch: boolean;
    afterConfidence: number;
    afterIntent: string;
    learnedSubstitutions: string;
  }

  const results: CaseResult[] = [];

  for (let idx = 0; idx < CASES.length; idx++) {
    const c = CASES[idx];
    console.log(`-----------------------------------------------------`);
    console.log(`[Case ${idx + 1}/${CASES.length}] ${c.name}`);
    console.log(`Training fragment: "${c.trainingFragment}" -> Confirmed: "${c.confirmedSentence}"`);
    console.log(`Testing different phrasing: "${c.testFragment}"`);
    console.log(`-----------------------------------------------------`);

    // 1. BEFORE LEARNING: Test different phrasing
    await prisma.confirmation.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    const assistBefore = await runAssistPipeline({
      userId: user.id,
      text: c.testFragment,
      source: 'SIMULATED',
    });

    let beforeHypotheses: HypothesisItem[] = [];
    if (assistBefore.confirmationId) {
      const conf = await prisma.confirmation.findUnique({
        where: { id: assistBefore.confirmationId },
      });
      beforeHypotheses = (conf?.hypotheses as unknown as HypothesisItem[]) || [];
    }

    const topBefore = beforeHypotheses[0] || {
      intent: 'None',
      sentence: '',
      confidence: 0,
    };
    const judgeBefore = await runAgent(
      'eval_judge',
      EvalJudgeOutputSchema,
      {
        fragment: c.testFragment,
        hypothesisSentence: topBefore.sentence,
        hypothesisIntent: topBefore.intent,
        goldIntent: c.goldIntent,
        goldKeywords: c.goldKeywords,
      },
      { userId: user.id },
    );

    console.log(`Before Learning Top-1: "${topBefore.intent}" (conf: ${topBefore.confidence.toFixed(2)})`);
    console.log(`  Judge verdict: ${judgeBefore.match ? 'MATCH ✓' : 'NO MATCH ✗'} (${judgeBefore.reason})`);

    // 2. LEARNING STEP: Patient utters training fragment, confirmed affirmatively
    await prisma.confirmation.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    const assistTrain = await runAssistPipeline({
      userId: user.id,
      text: c.trainingFragment,
      source: 'SIMULATED',
    });

    if (assistTrain.confirmationId) {
      await answerConfirmation(assistTrain.confirmationId, 'yes');
    }

    // Direct synchronous run of learn pipeline to ensure complete indexing
    await runLearnPipeline({
      userId: user.id,
      fragment: c.trainingFragment,
      confirmedSentence: c.confirmedSentence,
      rejectedHypotheses: [],
    });

    // Check learned entries in database
    const entries = await prisma.wordMapEntry.findMany({ where: { userId: user.id } });
    const learnedSummary = entries.map((e) => `"${e.saidToken}"->"${e.meantToken || ''}"`).join(', ');
    console.log(`\n✓ Learned into word map: ${learnedSummary || 'recorded utterance pattern'}`);

    // 3. AFTER LEARNING: Test the DIFFERENT phrasing again
    await prisma.confirmation.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    const assistAfter = await runAssistPipeline({
      userId: user.id,
      text: c.testFragment,
      source: 'SIMULATED',
    });

    let afterHypotheses: HypothesisItem[] = [];
    if (assistAfter.confirmationId) {
      const conf = await prisma.confirmation.findUnique({
        where: { id: assistAfter.confirmationId },
      });
      afterHypotheses = (conf?.hypotheses as unknown as HypothesisItem[]) || [];
    }

    const topAfter = afterHypotheses[0] || {
      intent: 'None',
      sentence: '',
      confidence: 0,
    };
    const judgeAfter = await runAgent(
      'eval_judge',
      EvalJudgeOutputSchema,
      {
        fragment: c.testFragment,
        hypothesisSentence: topAfter.sentence,
        hypothesisIntent: topAfter.intent,
        goldIntent: c.goldIntent,
        goldKeywords: c.goldKeywords,
      },
      { userId: user.id },
    );

    console.log(`After Learning Top-1:  "${topAfter.intent}" (conf: ${topAfter.confidence.toFixed(2)})`);
    console.log(`  Judge verdict: ${judgeAfter.match ? 'MATCH ✓' : 'NO MATCH ✗'} (${judgeAfter.reason})\n`);

    results.push({
      name: c.name,
      testFragment: c.testFragment,
      beforeMatch: judgeBefore.match,
      beforeConfidence: topBefore.confidence,
      beforeIntent: topBefore.intent,
      afterMatch: judgeAfter.match,
      afterConfidence: topAfter.confidence,
      afterIntent: topAfter.intent,
      learnedSubstitutions: learnedSummary,
    });
  }

  // Summary Report Table
  const beforeMatches = results.filter((r) => r.beforeMatch).length;
  const afterMatches = results.filter((r) => r.afterMatch).length;
  const beforeAcc = Number(((beforeMatches / results.length) * 100).toFixed(1));
  const afterAcc = Number(((afterMatches / results.length) * 100).toFixed(1));

  console.log('=============================================================================');
  console.log('  LEARNING LOOP EVALUATION RESULTS (Before vs After Adaptation)              ');
  console.log('=============================================================================');
  console.log('Test Scenario               Different Phrasing       Before Learn   After Learn   Delta');
  console.log('--------------------------- ------------------------ -------------- ------------- -----');
  for (const r of results) {
    const scCol = r.name.slice(0, 27).padEnd(27);
    const phCol = `"${r.testFragment}"`.padEnd(24);
    const bCol = `${r.beforeMatch ? 'Match ✓' : 'Miss  ✗'} (${r.beforeConfidence.toFixed(2)})`.padEnd(14);
    const aCol = `${r.afterMatch ? 'Match ✓' : 'Miss  ✗'} (${r.afterConfidence.toFixed(2)})`.padEnd(13);
    const delta = r.afterMatch && !r.beforeMatch ? '+GAIN' : r.afterMatch ? 'HELD' : 'MISS';
    console.log(`${scCol} ${phCol} ${bCol} ${aCol} ${delta}`);
  }
  console.log('--------------------------- ------------------------ -------------- ------------- -----');
  console.log(`FIRST-TRY ACCURACY:         Before: ${beforeAcc}% (${beforeMatches}/${results.length})     After: ${afterAcc}% (${afterMatches}/${results.length})     +${afterAcc - beforeAcc}% Gain`);
  console.log('=============================================================================\n');

  return {
    results,
    beforeAcc,
    afterAcc,
  };
}

if (require.main === module) {
  runLearningLoopEval()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Learning loop eval error:', err);
      process.exit(1);
    });
}
