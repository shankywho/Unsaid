import { Router } from 'express';
import { prisma } from '../../db';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { sha1, newId } from '../../lib/ids';
import { bus } from '../../tracing/events';
import { parseTranscriptBody, parseMemoryBody } from '../../adapters/omi/schemas';
import { bufferSegment } from '../../queues/ingestQueue';
import { runIngestPipeline } from '../../orchestrator/ingestPipeline';
import { runAssistPipeline } from '../../orchestrator/assistPipeline';

export const webhooksRouter = Router();

function verifyWebhookSecret(req: any): boolean {
  if (!env.OMI_WEBHOOK_SECRET) return true;
  const secret = req.query.secret || req.headers['x-omi-secret'];
  return secret === env.OMI_WEBHOOK_SECRET;
}

webhooksRouter.post('/webhooks/omi/transcript', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    logger.warn({ query: req.query }, 'Omi transcript webhook secret mismatch');
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } });
  }

  const uid = typeof req.query.uid === 'string' ? req.query.uid : undefined;
  const parsed = parseTranscriptBody(req.body);

  // Store raw webhook payload unconditionally
  await prisma.rawWebhook.create({
    data: {
      route: '/webhooks/omi/transcript',
      query: (req.query as any) ?? {},
      body: (req.body as any) ?? {},
      parsedOk: parsed !== null,
    },
  });

  if (!parsed) {
    logger.warn(
      { bodySnippet: JSON.stringify(req.body).slice(0, 150) },
      'Unparseable Omi transcript payload',
    );
    // Never 500 on unexpected payloads
    return res.status(200).json({ ok: true, ignored: true, reason: 'unparseable_payload' });
  }

  let user = uid ? await prisma.user.findUnique({ where: { omiUid: uid } }) : null;
  if (!user && uid) {
    user = await prisma.user.create({
      data: { omiUid: uid, displayName: `Omi Patient (${uid.slice(0, 6)})` },
    });
  }
  if (!user) {
    user =
      (await prisma.user.findFirst()) ||
      (await prisma.user.create({ data: { displayName: 'Default Patient' } }));
  }

  const querySessionId = typeof req.query.session_id === 'string' ? req.query.session_id : undefined;
  const sessionId = parsed.sessionId || querySessionId || newId();
  const segments = parsed.segments;

  for (const seg of segments) {
    const text = (seg.text || '').trim();
    if (!text) continue;

    const dedupeKey = sha1(`${sessionId}|${seg.start ?? ''}|${text}`);
    const isUser = Boolean(seg.is_user);

    await prisma.transcriptSegment.upsert({
      where: { userId_dedupeKey: { userId: user.id, dedupeKey } },
      create: {
        userId: user.id,
        sessionId,
        text,
        speaker: seg.speaker ?? (isUser ? 'PATIENT' : 'OTHER'),
        isUser,
        startSec: seg.start ?? null,
        endSec: seg.end ?? null,
        source: 'OMI_REALTIME',
        kind: isUser ? 'FRAGMENT' : 'AMBIENT',
        dedupeKey,
      },
      update: {},
    });

    bus.publish('segment.received', user.id, { text, isUser, sessionId, dedupeKey });

    if (isUser) {
      await runAssistPipeline({
        userId: user.id,
        text,
        sessionId,
        source: 'OMI_REALTIME',
      });
    } else {
      await bufferSegment(user.id, sessionId, {
        text,
        speaker: seg.speaker,
        id: dedupeKey,
        startSec: seg.start,
        endSec: seg.end,
      });
    }
  }

  return res.status(200).json({ ok: true, received: segments.length });
});

webhooksRouter.post('/webhooks/omi/memory', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } });
  }

  const uid = typeof req.query.uid === 'string' ? req.query.uid : undefined;
  const parsed = parseMemoryBody(req.body);

  await prisma.rawWebhook.create({
    data: {
      route: '/webhooks/omi/memory',
      query: (req.query as any) ?? {},
      body: (req.body as any) ?? {},
      parsedOk: parsed !== null,
    },
  });

  if (!parsed) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'unparseable_payload' });
  }

  let user = uid ? await prisma.user.findUnique({ where: { omiUid: uid } }) : null;
  if (!user && uid) {
    user = await prisma.user.create({
      data: { omiUid: uid, displayName: `Omi Patient (${uid.slice(0, 6)})` },
    });
  }
  if (!user) {
    user =
      (await prisma.user.findFirst()) ||
      (await prisma.user.create({ data: { displayName: 'Default Patient' } }));
  }

  const sessionId = parsed.id || newId();
  const rawSegments = parsed.transcript_segments || [];
  const segmentsForIngest: Array<{ text: string; speaker?: string | null; id?: string }> = [];

  for (const seg of rawSegments) {
    const text = (seg.text || '').trim();
    if (!text) continue;
    const dedupeKey = sha1(`${sessionId}|${seg.start ?? ''}|${text}`);
    const isUser = Boolean(seg.is_user);

    await prisma.transcriptSegment.upsert({
      where: { userId_dedupeKey: { userId: user.id, dedupeKey } },
      create: {
        userId: user.id,
        sessionId,
        text,
        speaker: seg.speaker ?? (isUser ? 'PATIENT' : 'OTHER'),
        isUser,
        startSec: seg.start ?? null,
        endSec: seg.end ?? null,
        source: 'OMI_MEMORY',
        kind: isUser ? 'FRAGMENT' : 'AMBIENT',
        dedupeKey,
      },
      update: {},
    });

    segmentsForIngest.push({ text, speaker: seg.speaker, id: dedupeKey });
  }

  if (segmentsForIngest.length > 0) {
    await runIngestPipeline({
      userId: user.id,
      sessionId,
      segments: segmentsForIngest,
    });
  }

  return res.status(200).json({ ok: true, received: rawSegments.length });
});
