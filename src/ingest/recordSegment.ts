import { Prisma, type SegmentSource } from '@prisma/client';
import { prisma } from '../db';
import { sha1 } from '../lib/ids';

export interface RecordSegmentInput {
  userId: string;
  sessionId: string;
  text: string;
  speaker?: string | null;
  isUser: boolean;
  start?: number | null;
  end?: number | null;
  source: SegmentSource;
}

export const segmentDedupeKey = (sessionId: string, start: number | null | undefined, text: string): string =>
  sha1(`${sessionId}|${start ?? ''}|${text}`);

/**
 * Idempotently stores a transcript segment. Omi may resend segments (and may send the same one
 * concurrently), so the unique (userId, dedupeKey) index is the arbiter: only the request that wins the
 * insert reports `created: true`, and only that request may trigger downstream work (assist/ingest).
 */
export async function recordSegment(
  input: RecordSegmentInput,
): Promise<{ created: boolean; dedupeKey: string }> {
  const text = input.text.trim();
  const dedupeKey = segmentDedupeKey(input.sessionId, input.start, text);
  try {
    await prisma.transcriptSegment.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        text,
        speaker: input.speaker ?? (input.isUser ? 'PATIENT' : 'OTHER'),
        isUser: input.isUser,
        startSec: input.start ?? null,
        endSec: input.end ?? null,
        source: input.source,
        kind: input.isUser ? 'FRAGMENT' : 'AMBIENT',
        dedupeKey,
      },
    });
    return { created: true, dedupeKey };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { created: false, dedupeKey };
    }
    throw err;
  }
}
