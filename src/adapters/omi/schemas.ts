import { z } from 'zod';

// Tolerant by design: Omi payloads vary, and we must never 500 on an unexpected shape.
export const omiSegmentSchema = z
  .object({
    id: z.string().optional(),
    text: z.string().optional().default(''),
    speaker: z.string().nullish(),
    speaker_id: z.number().nullish(),
    is_user: z.boolean().optional().default(false),
    start: z.number().nullish(),
    end: z.number().nullish(),
  })
  .passthrough();
export type OmiSegment = z.infer<typeof omiSegmentSchema>;

export const omiTranscriptBodySchema = z.union([
  z.array(omiSegmentSchema),
  z
    .object({
      session_id: z.string().optional(),
      segments: z.array(omiSegmentSchema).optional().default([]),
    })
    .passthrough(),
]);

export const omiMemoryBodySchema = z
  .object({
    id: z.string().optional(),
    created_at: z.string().nullish(),
    started_at: z.string().nullish(),
    transcript_segments: z.array(omiSegmentSchema).optional().default([]),
    structured: z
      .object({
        title: z.string().nullish(),
        overview: z.string().nullish(),
        category: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();
export type OmiMemoryBody = z.infer<typeof omiMemoryBodySchema>;

export interface ParsedTranscript {
  sessionId?: string;
  segments: OmiSegment[];
}

export function parseTranscriptBody(body: unknown): ParsedTranscript | null {
  const r = omiTranscriptBodySchema.safeParse(body);
  if (!r.success) return null;
  if (Array.isArray(r.data)) return { segments: r.data };
  return { sessionId: r.data.session_id, segments: r.data.segments };
}

export function parseMemoryBody(body: unknown): OmiMemoryBody | null {
  const r = omiMemoryBodySchema.safeParse(body);
  return r.success ? r.data : null;
}
