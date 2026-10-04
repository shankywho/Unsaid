import { Router } from 'express';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { newId } from '../../lib/ids';
import { unauthorized } from '../../lib/errors';
import { bus } from '../../tracing/events';
import { parseTranscriptBody, parseMemoryBody } from '../../adapters/omi/schemas';
import { bufferSegment } from '../../queues/ingestQueue';
import { runIngestPipeline } from '../../orchestrator/ingestPipeline';
import { runAssistPipeline } from '../../orchestrator/assistPipeline';
import { recordSegment } from '../../ingest/recordSegment';
import { safeEqual } from '../auth/session';
import { WebhookQuery } from '../schemas';

export const webhooksRouter = Router();

/**
 * Webhooks authenticate with their own secret (OMI_WEBHOOK_SECRET), separate from API_KEY. Accepted as
 * `?secret=`, `x-omi-secret` header, or a trailing path segment (`/webhooks/omi/transcript/<secret>`) for
 * clients that cannot control the query string. The secret is never logged.
 */
function verifyWebhookSecret(req: Request): boolean {
  if (!env.OMI_WEBHOOK_SECRET) return true;
  const supplied =
    (typeof req.query.secret === 'string' && req.query.secret) ||
    req.header('x-omi-secret') ||
    (typeof req.params.secret === 'string' && req.params.secret) ||
    '';
  return Boolean(supplied) && safeEqual(supplied, env.OMI_WEBHOOK_SECRET);
}

async function resolveUser(uid: string | undefined): Promise<User> {
  let user = uid ? await prisma.user.findUnique({ where: { omiUid: uid } }) : null;
  if (!user && uid) {
    user = await prisma.user.create({
      data: { omiUid: uid, displayName: `Omi Patient (${uid.slice(0, 6)})` },
    });
  }
  return (
    user ??
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })) ??
    (await prisma.user.create({ data: { displayName: 'Default Patient' } }))
  );
}

const storeRaw = (route: string, req: Request, parsedOk: boolean) =>
  prisma.rawWebhook.create({
    data: {
      route,
      // the secret must never be persisted
      query: Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== 'secret')) as object,
      body: (req.body ?? {}) as object,
      parsedOk,
    },
  });

webhooksRouter.post(['/omi/transcript', '/omi/transcript/:secret'], async (req, res, next) => {
  try {
    if (!verifyWebhookSecret(req)) {
      logger.warn({ requestId: req.requestId }, 'Omi transcript webhook secret mismatch');
      return next(unauthorized('invalid webhook secret'));
    }

    const query = WebhookQuery.parse(req.query);
    const parsed = parseTranscriptBody(req.body);
    await storeRaw('/webhooks/omi/transcript', req, parsed !== null);

    if (!parsed) {
      logger.warn({ requestId: req.requestId }, 'Unparseable Omi transcript payload (raw body stored)');
      // Never 500 on unexpected payloads
      return res.status(200).json({ ok: true, ignored: true, reason: 'unparseable_payload' });
    }

    const user = await resolveUser(query.uid);
    const sessionId = parsed.sessionId || query.session_id || newId();
    let duplicates = 0;

    for (const seg of parsed.segments) {
      const text = (seg.text || '').trim();
      if (!text) continue;
      const isUser = Boolean(seg.is_user);

      const { created, dedupeKey } = await recordSegment({
        userId: user.id,
        sessionId,
        text,
        speaker: seg.speaker,
        isUser,
        start: seg.start,
        end: seg.end,
        source: 'OMI_REALTIME',
      });
      if (!created) {
        duplicates++;
        continue; // already processed: no event, no second assist run, no double-buffering
      }

      bus.publish('segment.received', user.id, {
        segmentId: dedupeKey,
        isUser,
        sessionId,
        source: 'OMI_REALTIME',
        textLength: text.length,
        text,
      });

      if (isUser) {
        await runAssistPipeline({ userId: user.id, text, sessionId, source: 'OMI_REALTIME' });
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

    return res.status(200).json({ ok: true, received: parsed.segments.length, duplicates });
  } catch (err) {
    return next(err);
  }
});

webhooksRouter.post(['/omi/memory', '/omi/memory/:secret'], async (req, res, next) => {
  try {
    if (!verifyWebhookSecret(req)) return next(unauthorized('invalid webhook secret'));

    const query = WebhookQuery.parse(req.query);
    const parsed = parseMemoryBody(req.body);
    await storeRaw('/webhooks/omi/memory', req, parsed !== null);

    if (!parsed) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'unparseable_payload' });
    }

    const user = await resolveUser(query.uid);
    const sessionId = parsed.id || newId();
    const rawSegments = parsed.transcript_segments || [];
    const segmentsForIngest: Array<{ text: string; speaker?: string | null; id?: string }> = [];
    let duplicates = 0;

    for (const seg of rawSegments) {
      const text = (seg.text || '').trim();
      if (!text) continue;
      const { created, dedupeKey } = await recordSegment({
        userId: user.id,
        sessionId,
        text,
        speaker: seg.speaker,
        isUser: Boolean(seg.is_user),
        start: seg.start,
        end: seg.end,
        source: 'OMI_MEMORY',
      });
      if (!created) {
        duplicates++;
        continue;
      }
      segmentsForIngest.push({ text, speaker: seg.speaker, id: dedupeKey });
    }

    if (segmentsForIngest.length > 0) {
      await runIngestPipeline({ userId: user.id, sessionId, segments: segmentsForIngest });
    }

    return res.status(200).json({ ok: true, received: rawSegments.length, duplicates });
  } catch (err) {
    return next(err);
  }
});
