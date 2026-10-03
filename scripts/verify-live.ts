import { env } from '../src/config/env';
import { HttpLyzrClient } from '../src/adapters/lyzr/httpClient';
import { OpenAIEmbedder } from '../src/adapters/embeddings/openai';
import { qdrant } from '../src/adapters/qdrant/client';
import { collections, resetQdrantCollections } from '../src/adapters/qdrant/collections';
import { seed } from './seed';
import { runAssistPipeline } from '../src/orchestrator/assistPipeline';
import { prisma } from '../src/db';
import { AGENT_NAMES } from '../src/agents/names';
import { fetchRetry } from '../src/lib/http';

async function main() {
  console.log('=====================================================');
  console.log('  UNSAID — Live Integration Verification Harness     ');
  console.log('=====================================================\n');

  if (!env.LYZR_API_KEY) {
    console.error('❌ LYZR_API_KEY is missing from environment / .env');
  } else {
    console.log('✓ LYZR_API_KEY is present.');
  }

  if (!env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is missing from environment / .env');
  } else {
    console.log('✓ OPENAI_API_KEY is present.');
  }

  if (!env.LYZR_API_KEY || !env.OPENAI_API_KEY) {
    console.log('\nTo run live verification:');
    console.log('1. Add your LYZR_API_KEY and OPENAI_API_KEY to .env');
    console.log('2. Set MOCK_EXTERNALS=false in .env');
    console.log('3. Run: tsx scripts/verify-live.ts\n');
    process.exit(1);
  }

  // 1. Verify OpenAI Embeddings & Dimension
  console.log('\n--- 1. Testing OpenAI Embeddings ---');
  const embedder = new OpenAIEmbedder();
  const sampleVectors = await embedder.embed(['Test ambient memory fact: Mohan Lal Sharma']);
  const actualDim = sampleVectors[0]?.length || 0;
  console.log(`✓ OpenAI Embeddings active. Model: ${env.EMBEDDING_MODEL}, Vector Dim: ${actualDim}`);

  if (actualDim !== env.EMBEDDING_DIM) {
    console.warn(
      `⚠️ Note: Actual embedding dimension (${actualDim}) differs from EMBEDDING_DIM (${env.EMBEDDING_DIM}). Updating collections...`,
    );
  }

  // 2. Reset Qdrant & Seed
  console.log('\n--- 2. Resetting Qdrant Collections & Seeding ---');
  await resetQdrantCollections(actualDim);
  console.log('✓ Qdrant collections reset to dimension', actualDim);

  const seededUserId = await seed();
  console.log('✓ Seed completed for user:', seededUserId);

  // 3. Inspect 10 Sample Facts in Qdrant
  console.log('\n--- 3. Sampling 10 Facts from Qdrant unsaid_memory ---');
  const scrollRes = await qdrant.scroll(collections.memory, {
    limit: 10,
    with_payload: true,
    with_vector: false,
  });

  scrollRes.points.forEach((pt, idx) => {
    const payload = pt.payload as any;
    console.log(`[${idx + 1}] ID: ${pt.id}`);
    console.log(`    Text: "${payload?.text}"`);
    console.log(`    Entities: [${(payload?.entities || []).join(', ')}] | Type: ${payload?.type}\n`);
  });

  // 4. Test Single Real Call per Lyzr Agent
  console.log('\n--- 4. Testing Live Lyzr Agents ---');
  const lyzr = new HttpLyzrClient();

  for (const agent of AGENT_NAMES) {
    const agentId = lyzr.agentId(agent);
    if (!agentId) {
      console.warn(`⚠️ Skipping agent ${agent}: ID not configured in env`);
      continue;
    }
    console.log(`Calling Lyzr Agent: ${agent} (ID: ${agentId})...`);
    try {
      const res = await fetchRetry(env.LYZR_INFERENCE_URL, {
        method: 'POST',
        timeoutMs: 25_000,
        headers: { 'content-type': 'application/json', 'x-api-key': env.LYZR_API_KEY },
        body: JSON.stringify({
          user_id: seededUserId,
          agent_id: agentId,
          message: JSON.stringify({ ping: true, test: 'contract_check' }),
        }),
      });

      const raw = await res.json();
      console.log(`✓ Agent ${agent} responded (${res.status}):`);
      console.log(JSON.stringify(raw, null, 2));
    } catch (err: any) {
      console.error(`❌ Agent ${agent} failed:`, err.message);
    }
  }

  // 5. Test 5 Fragments live through assist pipeline
  console.log('\n--- 5. Running 5 Live Test Fragments ---');
  const testFragments = [
    'Sunday… Priya… cake… no',
    'water… Ramesh… bill',
    'the… the thing… eyes… broken',
    'car… park… six',
    'chai… nahi… sugar',
  ];

  for (const fragment of testFragments) {
    console.log(`\n=====================================================`);
    console.log(`Fragment: "${fragment}"`);
    console.log(`=====================================================`);
    const t0 = Date.now();
    const result = await runAssistPipeline({
      userId: seededUserId,
      text: fragment,
      source: 'SIMULATED',
    });
    const totalLatency = Date.now() - t0;

    const run = await prisma.run.findUnique({
      where: { id: result.runId },
      include: { steps: true },
    });

    console.log(`Run ID: ${result.runId} (Total Latency: ${totalLatency}ms)`);
    console.log('Step Latencies:');
    run?.steps.forEach((s) => {
      console.log(`  • [${s.node}] status: ${s.status}, latency: ${s.latencyMs}ms`);
    });

    if (result.confirmationId) {
      const conf = await prisma.confirmation.findUnique({
        where: { id: result.confirmationId },
      });
      console.log(`Confirmation Question: "${conf?.question}"`);
      console.log('Hypotheses:');
      (conf?.hypotheses as any[])?.forEach((h, idx) => {
        console.log(
          `  [${idx + 1}] Intent: "${h.intent}" (conf: ${h.confidence}, evidenceIds: [${(h.evidenceIds || []).join(', ')}])`,
        );
        console.log(`      Sentence: "${h.sentence}"`);
      });
    }
  }

  console.log('\n✓ Live verification run complete.');
}

main().catch((err) => {
  console.error('Fatal error during live verification:', err);
  process.exit(1);
});
