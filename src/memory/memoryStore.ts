import { qdrant } from '../adapters/qdrant/client';
import { collections } from '../adapters/qdrant/collections';
import { adapters } from '../adapters';
import { newId } from '../lib/ids';
import { logger } from '../lib/logger';

export type FactType =
  | 'person'
  | 'relationship'
  | 'event'
  | 'routine'
  | 'preference'
  | 'place'
  | 'object'
  | 'health_instruction';

export interface MemoryPayload {
  userId: string;
  type: FactType;
  text: string;
  entities: string[];
  aliases: string[];
  eventTime?: string;
  validUntil?: string;
  sourceSegmentIds: string[];
  speaker?: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  mentions: number;
}

export interface MemoryFactInput {
  type: FactType;
  text: string;
  entities: string[];
  aliases?: string[];
  eventTime?: string;
  validUntil?: string;
  sourceSegmentIds?: string[];
  speaker?: string;
  confidence: number;
}

export interface ScoredMemoryHit {
  id: string;
  score: number;
  semanticScore: number;
  type: FactType;
  text: string;
  entities: string[];
  aliases: string[];
  payload: MemoryPayload;
}

export function computeRecencyScore(createdAtIso: string, halfLifeDays = 7): number {
  const createdAtMs = new Date(createdAtIso).getTime();
  const nowMs = Date.now();
  const ageDays = Math.max(0, (nowMs - createdAtMs) / (1000 * 60 * 60 * 24));
  return Math.exp((-ageDays * Math.LN2) / halfLifeDays);
}

export function rerankMemoryHit(semanticScore: number, createdAtIso: string, mentions: number): number {
  const recency = computeRecencyScore(createdAtIso);
  const mentionScore = Math.log(1 + Math.max(1, mentions));
  return 0.7 * semanticScore + 0.2 * recency + 0.1 * mentionScore;
}

export async function upsertMemoryFact(
  userId: string,
  fact: MemoryFactInput,
): Promise<{ id: string; merged: boolean; payload: MemoryPayload }> {
  if (!userId) throw new Error('userId is required for upsertMemoryFact');
  const embedder = adapters().embedder;
  const [vector] = await embedder.embed([fact.text]);

  // Search for near-duplicate in same userId + type
  const searchFilter = {
    must: [
      { key: 'userId', match: { value: userId } },
      { key: 'type', match: { value: fact.type } },
    ],
  };

  const response = await qdrant.query(collections.memory, {
    query: vector,
    filter: searchFilter,
    limit: 1,
    with_payload: true,
  });

  const existingHits = response.points;
  const nowIso = new Date().toISOString();
  const topMatch = existingHits[0];

  if (topMatch && topMatch.score >= 0.92 && topMatch.payload) {
    const existing = topMatch.payload as unknown as MemoryPayload;
    const mergedEntities = Array.from(new Set([...(existing.entities || []), ...(fact.entities || [])]));
    const mergedAliases = Array.from(new Set([...(existing.aliases || []), ...(fact.aliases || [])]));
    const mergedSourceSegmentIds = Array.from(
      new Set([...(existing.sourceSegmentIds || []), ...(fact.sourceSegmentIds || [])]),
    );

    const mergedPayload: MemoryPayload = {
      userId,
      type: fact.type,
      text: existing.text, // keep canonical text
      entities: mergedEntities,
      aliases: mergedAliases,
      eventTime: fact.eventTime ?? existing.eventTime,
      validUntil: fact.validUntil ?? existing.validUntil,
      sourceSegmentIds: mergedSourceSegmentIds,
      speaker: fact.speaker ?? existing.speaker,
      confidence: Math.max(existing.confidence ?? 0, fact.confidence),
      createdAt: existing.createdAt ?? nowIso,
      updatedAt: nowIso,
      mentions: (existing.mentions ?? 1) + 1,
    };

    const pointId = String(topMatch.id);
    await qdrant.upsert(collections.memory, {
      wait: true,
      points: [
        {
          id: pointId,
          vector,
          payload: mergedPayload as unknown as Record<string, unknown>,
        },
      ],
    });

    logger.info({ userId, pointId, text: mergedPayload.text }, 'Merged existing memory fact');
    return { id: pointId, merged: true, payload: mergedPayload };
  }

  // Insert new fact
  const pointId = newId();
  const newPayload: MemoryPayload = {
    userId,
    type: fact.type,
    text: fact.text,
    entities: fact.entities || [],
    aliases: fact.aliases || [],
    eventTime: fact.eventTime,
    validUntil: fact.validUntil,
    sourceSegmentIds: fact.sourceSegmentIds || [],
    speaker: fact.speaker,
    confidence: fact.confidence,
    createdAt: nowIso,
    updatedAt: nowIso,
    mentions: 1,
  };

  await qdrant.upsert(collections.memory, {
    wait: true,
    points: [
      {
        id: pointId,
        vector,
        payload: newPayload as unknown as Record<string, unknown>,
      },
    ],
  });

  logger.info({ userId, pointId, text: newPayload.text }, 'Inserted new memory fact');
  return { id: pointId, merged: false, payload: newPayload };
}

export async function searchMemory(
  userId: string,
  queries: string[],
  limitPerQuery = 8,
): Promise<ScoredMemoryHit[]> {
  if (!userId) throw new Error('userId is required for searchMemory');
  const embedder = adapters().embedder;
  const filter = {
    must: [{ key: 'userId', match: { value: userId } }],
  };

  const hitMap = new Map<string, { hit: any; bestSemantic: number }>();

  for (const query of queries) {
    if (!query.trim()) continue;
    const [vector] = await embedder.embed([query]);
    const response = await qdrant.query(collections.memory, {
      query: vector,
      filter,
      limit: limitPerQuery,
      with_payload: true,
    });

    for (const r of response.points) {
      const id = String(r.id);
      const existing = hitMap.get(id);
      if (!existing || r.score > existing.bestSemantic) {
        hitMap.set(id, { hit: r, bestSemantic: r.score });
      }
    }
  }

  const nowMs = Date.now();
  const reranked: ScoredMemoryHit[] = [];

  for (const [id, { hit, bestSemantic }] of hitMap.entries()) {
    const payload = hit.payload as unknown as MemoryPayload;
    if (!payload) continue;

    // Filter expired facts
    if (payload.validUntil) {
      const validUntilMs = new Date(payload.validUntil).getTime();
      if (!isNaN(validUntilMs) && validUntilMs < nowMs) {
        continue;
      }
    }

    const finalScore = rerankMemoryHit(bestSemantic, payload.createdAt, payload.mentions ?? 1);
    reranked.push({
      id,
      score: finalScore,
      semanticScore: bestSemantic,
      type: payload.type,
      text: payload.text,
      entities: payload.entities || [],
      aliases: payload.aliases || [],
      payload,
    });
  }

  // Sort descending by reranked score
  reranked.sort((a, b) => b.score - a.score);
  return reranked.slice(0, 10);
}

export async function deleteMemoryFact(userId: string, pointId: string): Promise<void> {
  if (!userId) throw new Error('userId is required for deleteMemoryFact');
  await qdrant.delete(collections.memory, {
    wait: true,
    filter: {
      must: [
        { key: 'userId', match: { value: userId } },
        { has_id: [pointId] },
      ],
    },
  });
}

export async function purgeUserMemory(userId: string): Promise<void> {
  if (!userId) throw new Error('userId is required for purgeUserMemory');
  const filter = { must: [{ key: 'userId', match: { value: userId } }] };
  await qdrant.delete(collections.memory, { wait: true, filter });
  await qdrant.delete(collections.wordmap, { wait: true, filter });
}
