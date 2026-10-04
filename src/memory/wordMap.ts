import { qdrant } from '../adapters/qdrant/client';
import { collections } from '../adapters/qdrant/collections';
import { adapters } from '../adapters';
import { prisma } from '../db';
import { newId } from '../lib/ids';
import { logger } from '../lib/logger';

export type WordMapPayloadKind = 'resolved_utterance' | 'substitution' | 'name_alias';

export interface WordMapPayload {
  userId: string;
  kind: WordMapPayloadKind;
  fragment: string;
  resolvedSentence?: string;
  said?: string;
  meant?: string;
  hits: number;
  lastSeenAt: string;
}

export interface ScoredWordMapHit {
  id: string;
  score: number;
  kind: WordMapPayloadKind;
  fragment: string;
  resolvedSentence?: string;
  said?: string;
  meant?: string;
  hits: number;
  payload: WordMapPayload;
}

export async function searchWordMap(
  userId: string,
  fragment: string,
  limit = 5,
): Promise<ScoredWordMapHit[]> {
  if (!userId) throw new Error('userId is required for searchWordMap');
  if (!fragment.trim()) return [];

  const embedder = adapters().embedder;
  const [vector] = await embedder.embed([fragment]);

  const filter = {
    must: [{ key: 'userId', match: { value: userId } }],
  };

  const response = await qdrant.query(collections.wordmap, {
    query: vector,
    filter,
    limit,
    with_payload: true,
  });

  return response.points.map((r) => {
    const payload = (r.payload ?? {}) as unknown as WordMapPayload;
    return {
      id: String(r.id),
      score: r.score,
      kind: payload.kind,
      fragment: payload.fragment,
      resolvedSentence: payload.resolvedSentence,
      said: payload.said,
      meant: payload.meant,
      hits: payload.hits ?? 1,
      payload,
    };
  });
}

export async function upsertResolvedUtterance(
  userId: string,
  fragment: string,
  resolvedSentence: string,
): Promise<{ id: string }> {
  if (!userId) throw new Error('userId is required for upsertResolvedUtterance');
  const embedder = adapters().embedder;
  const [vector] = await embedder.embed([fragment]);
  const nowIso = new Date().toISOString();

  // Search if exact or very similar fragment exists in wordmap
  const filter = {
    must: [
      { key: 'userId', match: { value: userId } },
      { key: 'kind', match: { value: 'resolved_utterance' } },
    ],
  };

  const response = await qdrant.query(collections.wordmap, {
    query: vector,
    filter,
    limit: 1,
    with_payload: true,
  });

  const existing = response.points[0];
  if (existing && existing.score >= 0.95 && existing.payload) {
    const p = existing.payload as unknown as WordMapPayload;
    const pointId = String(existing.id);
    const updated: WordMapPayload = {
      ...p,
      resolvedSentence,
      hits: (p.hits ?? 1) + 1,
      lastSeenAt: nowIso,
    };

    await qdrant.upsert(collections.wordmap, {
      wait: true,
      points: [{ id: pointId, vector, payload: updated as unknown as Record<string, unknown> }],
    });

    return { id: pointId };
  }

  const pointId = newId();
  const payload: WordMapPayload = {
    userId,
    kind: 'resolved_utterance',
    fragment,
    resolvedSentence,
    hits: 1,
    lastSeenAt: nowIso,
  };

  await qdrant.upsert(collections.wordmap, {
    wait: true,
    points: [{ id: pointId, vector, payload: payload as unknown as Record<string, unknown> }],
  });

  return { id: pointId };
}

export async function upsertSubstitution(
  userId: string,
  saidToken: string,
  meantToken: string,
  kind: 'SUBSTITUTION' | 'NAME_ALIAS' = 'SUBSTITUTION',
): Promise<void> {
  const said = saidToken.trim().toLowerCase();
  const meant = meantToken.trim();
  if (!said || !meant) return;

  const embedder = adapters().embedder;
  const [vector] = await embedder.embed([said]);
  const now = new Date();

  // Mirror in Postgres WordMapEntry table
  const entry = await prisma.wordMapEntry.findUnique({
    where: { userId_saidToken_meantToken: { userId, saidToken: said, meantToken: meant } },
  });

  let qdrantId = entry?.qdrantId;

  if (entry) {
    await prisma.wordMapEntry.update({
      where: { id: entry.id },
      data: { hits: { increment: 1 }, lastSeenAt: now },
    });
  } else {
    qdrantId = newId();
    await prisma.wordMapEntry.create({
      data: {
        userId,
        saidToken: said,
        meantToken: meant,
        kind,
        hits: 1,
        lastSeenAt: now,
        qdrantId,
      },
    });
  }

  // Update Qdrant
  const payload: WordMapPayload = {
    userId,
    kind: kind === 'NAME_ALIAS' ? 'name_alias' : 'substitution',
    fragment: said,
    said,
    meant,
    hits: (entry?.hits ?? 0) + 1,
    lastSeenAt: now.toISOString(),
  };

  await qdrant.upsert(collections.wordmap, {
    wait: true,
    points: [{ id: qdrantId!, vector, payload: payload as unknown as Record<string, unknown> }],
  });

  logger.info({ userId, said, meant, kind }, 'Upserted word map substitution');
}

const COMMON_TRANSLATIONS: Record<string, string[]> = {
  beti: ['daughter', 'girl'],
  beta: ['son', 'boy'],
  chai: ['tea'],
  pani: ['water'],
  nahi: ['no', 'not', 'never'],
  kaha: ['where'],
  kya: ['what'],
  dadu: ['grandfather', 'grandpa'],
  mana: ['forbidden', 'refuse', 'not allowed', 'denied'],
};

/**
 * Validates whether a candidate pair is a TRUE aphasic substitution (patient said X, meant a different word Y)
 * vs a language translation (beti -> daughter) or time/number formatting expansion (six -> 6 PM).
 */
export function isTrueSubstitution(said: string, meant: string): boolean {
  const s = said.trim().toLowerCase();
  const m = meant.trim().toLowerCase();

  // 1. Identity or empty
  if (!s || !m || s === m) return false;

  // 2. Time/number formatting expansions (e.g. "six" -> "6 PM", "6" -> "6 PM", "twice" -> "2 times")
  const timeRegex = /^\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i;
  const numWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  if (numWords.includes(s) && (timeRegex.test(m) || m.includes('pm') || m.includes('am'))) {
    return false;
  }
  if (/^\d+$/.test(s) && (timeRegex.test(m) || m.includes('pm') || m.includes('am'))) {
    return false;
  }
  if ((s === 'twice' || s === '2') && (m.includes('2') || m.includes('twice'))) {
    return false;
  }

  // 3. Known Hindi/English translations
  if (COMMON_TRANSLATIONS[s] && COMMON_TRANSLATIONS[s].some((trans) => m.includes(trans))) {
    return false;
  }

  // 4. Meant phrase simply contains said token (e.g., "park" -> "park at 6 PM")
  const meantTokens = m.split(/[\s,.;:!?…]+/).filter(Boolean);
  if (meantTokens.includes(s)) {
    return false;
  }

  return true;
}

/**
 * Applies word map substitutions by REPLACING the said word with the meant word.
 * It NEVER combines both words together.
 */
export function applySubstitutions(
  fragment: string,
  substitutions: Array<{ said?: string; meant?: string }>,
): string {
  let result = fragment;
  for (const sub of substitutions) {
    if (!sub.said || !sub.meant) continue;
    const s = sub.said.trim();
    const m = sub.meant.trim();
    if (!s || !m) continue;

    // Use word-boundary regex if possible, handling ellipsis and punctuation
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<=^|[\\s….,?!])${escaped}(?=[\\s….,?!]|$)`, 'gi');
    result = result.replace(regex, m);
  }
  return result;
}
