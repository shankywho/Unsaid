import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env';

const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${env.PORT || 8080}`;
const DELAY_MS = Number(process.env.REPLAY_DELAY_MS) || 150;
const OMI_UID = process.env.REPLAY_OMI_UID || 'omi_mohan_demo';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function replay(): Promise<void> {
  console.log('========================================================');
  console.log(`  UNSAID — Omi Webhook Replay Tool (${BASE_URL})        `);
  console.log('========================================================\n');

  const ambientPath = path.resolve(__dirname, '../fixtures/ambient-week.json');
  const segments = JSON.parse(fs.readFileSync(ambientPath, 'utf8'));

  const sessionId = `replay_session_${Date.now()}`;
  console.log(`1. Replaying ${segments.length} ambient segments across the household...`);

  // Batch in pairs/triples
  for (let i = 0; i < segments.length; i += 3) {
    const chunk = segments.slice(i, i + 3);
    const body = {
      session_id: sessionId,
      segments: chunk.map((c: any) => ({
        text: c.text,
        speaker: c.speaker,
        is_user: false,
        start: c.start,
        end: c.end,
      })),
    };

    const res = await fetch(`${BASE_URL}/webhooks/omi/transcript?uid=${OMI_UID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[!] Webhook call returned status ${res.status}`);
    } else {
      process.stdout.write('.');
    }
    await sleep(DELAY_MS);
  }
  console.log('\n✓ Ambient background world replayed successfully!\n');

  console.log('2. Simulating live patient aphasic fragment in assist mode:');
  console.log('   Patient speaks: "Sunday… Priya… cake… no"');

  const fragmentRes = await fetch(`${BASE_URL}/webhooks/omi/transcript?uid=${OMI_UID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      segments: [
        {
          text: 'Sunday… Priya… cake… no',
          speaker: 'Mohan',
          is_user: true,
          start: 300,
          end: 304,
        },
      ],
    }),
  });

  console.log(`   Webhook accepted (status ${fragmentRes.status}).`);
  console.log('   Waiting 2 seconds for assistant hypothesis & question composing...');
  await sleep(2000);

  console.log('\n3. Simulating patient confirmation response:');
  console.log('   Patient responds: "haan yes"');

  const confirmRes = await fetch(`${BASE_URL}/webhooks/omi/transcript?uid=${OMI_UID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      segments: [
        {
          text: 'haan yes',
          speaker: 'Mohan',
          is_user: true,
          start: 306,
          end: 308,
        },
      ],
    }),
  });

  console.log(`   Confirmation processed (status ${confirmRes.status}).`);
  console.log('\n🎉 Demo replay complete! Check the console or /debug page for trace.');
}

if (require.main === module) {
  replay()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Replay error:', err);
      process.exit(1);
    });
}
