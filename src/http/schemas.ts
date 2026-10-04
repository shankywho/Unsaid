import { z } from 'zod';
import { HypothesisItemSchema } from '../agents/schemas';
import { EVENT_TYPES } from '../tracing/events';

/**
 * Single source of truth for HTTP input validation AND the generated OpenAPI spec (docs/openapi.yaml).
 * Routes parse with these schemas; src/http/openapi.ts documents them.
 */

const id = z.string().min(1).max(128);
const iso = z.iso.datetime();

// ---------- shared ----------
export const IdParams = z.object({ id });
export const UserIdQuery = z.object({ userId: id });
export const PointIdParams = z.object({ pointId: id });

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'validation_error' }),
      message: z.string(),
      requestId: z.string().optional(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorEnvelope' });

export const okData = <T extends z.ZodType>(data: T) => z.object({ ok: z.literal(true), data });

// ---------- entities ----------
export const AssistModeSchema = z.enum(['AUTO', 'ON', 'OFF']);

export const UserSchema = z
  .object({
    id,
    omiUid: z.string().nullable(),
    displayName: z.string(),
    role: z.literal('PATIENT'),
    contextEnabled: z.boolean(),
    assistMode: AssistModeSchema,
    caregiverName: z.string().nullable(),
    createdAt: iso,
  })
  .meta({ id: 'User' });

export const UserDetailSchema = UserSchema.extend({
  _count: z.object({
    segments: z.number().int(),
    runs: z.number().int(),
    confirmations: z.number().int(),
    wordMapEntries: z.number().int(),
  }),
}).meta({ id: 'UserDetail' });

export const HypothesisSchema = HypothesisItemSchema.meta({ id: 'Hypothesis' });

export const ConfirmationSchema = z
  .object({
    id,
    userId: id,
    runId: id,
    fragment: z.string(),
    hypotheses: z.array(HypothesisSchema),
    currentIndex: z.number().int(),
    question: z.string(),
    questionAudio: z.string().nullable(),
    status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED_ALL', 'EXPIRED']),
    confirmedIdx: z.number().int().nullable(),
    finalSentence: z.string().nullable(),
    finalAudio: z.string().nullable(),
    resolution: z.string().nullable(),
    createdAt: iso,
    resolvedAt: iso.nullable(),
  })
  .meta({ id: 'Confirmation' });

export const StepSchema = z
  .object({
    id,
    runId: id,
    node: z.string().meta({ example: 'retrieve_memory' }),
    agentId: z.string().nullable(),
    status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED']),
    input: z.unknown(),
    output: z.unknown().nullable(),
    error: z.string().nullable(),
    retrieval: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .meta({ description: 'Qdrant hits (id, type, text, score) for retrieval nodes' }),
    latencyMs: z.number().int().nullable(),
    attempt: z.number().int(),
    startedAt: iso,
    endedAt: iso.nullable(),
  })
  .meta({ id: 'Step' });

export const RunSchema = z
  .object({
    id,
    userId: id,
    pipeline: z.enum(['ASSIST', 'INGEST', 'LEARN']),
    status: z.enum(['RUNNING', 'AWAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED']),
    input: z.unknown(),
    output: z.unknown().nullable(),
    contextUsed: z.boolean(),
    startedAt: iso,
    endedAt: iso.nullable(),
  })
  .meta({ id: 'Run' });

export const WordMapEntrySchema = z
  .object({
    id,
    userId: id,
    saidToken: z.string(),
    meantToken: z.string(),
    kind: z.enum(['SUBSTITUTION', 'PHRASE', 'NAME_ALIAS']),
    hits: z.number().int(),
    lastSeenAt: iso,
    qdrantId: z.string(),
  })
  .meta({ id: 'WordMapEntry' });

export const MemoryFactSchema = z
  .object({
    id,
    userId: id.optional(),
    type: z.string().optional(),
    text: z.string().optional(),
    entities: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    score: z.number().optional(),
  })
  .loose()
  .meta({ id: 'MemoryFact' });

// ---------- auth ----------
export const LoginBody = z.object({
  email: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
});
export const MeSchema = z
  .object({
    principal: z.discriminatedUnion('type', [
      z.object({ type: z.literal('api_key') }),
      z.object({ type: z.literal('session'), email: z.string(), expiresAt: iso }),
    ]),
    patients: z.array(
      UserSchema.pick({ id: true, displayName: true, contextEnabled: true, assistMode: true }),
    ),
  })
  .meta({ id: 'Me' });

// ---------- users ----------
export const CreateUserBody = z.object({
  displayName: z.string().min(1).max(200),
  omiUid: z.string().min(1).max(200).optional(),
  caregiverName: z.string().max(200).optional(),
  contextEnabled: z.boolean().optional(),
  assistMode: AssistModeSchema.optional(),
});
export const UpdateUserBody = z
  .object({
    displayName: z.string().min(1).max(200).optional(),
    caregiverName: z.string().max(200).optional(),
    contextEnabled: z.boolean().optional(),
    assistMode: AssistModeSchema.optional(),
  })
  .strict();

export const WordMapSchema = z
  .object({
    substitutions: z.array(WordMapEntrySchema),
    resolvedUtterances: z.array(
      z
        .object({
          id: z.union([z.string(), z.number()]),
          fragment: z.string(),
          resolvedSentence: z.string(),
          hits: z.number(),
        })
        .loose(),
    ),
  })
  .meta({ id: 'WordMap' });

export const InsightsSchema = z
  .object({
    userId: id,
    displayName: z.string(),
    stats: z.object({
      fragmentsCount: z.number().int(),
      totalConfirmations: z.number().int(),
      confirmedCount: z.number().int(),
      firstTryCount: z.number().int(),
      firstTryResolutionRate: z.number(),
      overallResolutionRate: z.number(),
    }),
    topSubstitutions: z.array(WordMapEntrySchema),
  })
  .meta({ id: 'Insights' });

// ---------- confirmations ----------
export const AnswerBody = z.object({ answer: z.enum(['yes', 'no']) });
export const AnswerResultSchema = z
  .object({
    confirmation: ConfirmationSchema,
    resolved: z.boolean(),
    finalSentence: z.string().optional(),
    finalAudio: z.string().optional(),
    nextQuestion: z.string().optional(),
    fallbackQuestion: z.string().optional(),
  })
  .meta({ id: 'AnswerResult' });

// ---------- simulate ----------
export const SimulateFragmentBody = z.object({ userId: id, text: z.string().min(1).max(2000) });
export const SimulateFragmentResultSchema = z
  .object({
    runId: id.optional(),
    confirmationId: id.optional(),
    resolved: z.boolean().optional(),
    handledAsReply: z.boolean().optional(),
  })
  .meta({ id: 'AssistResult' });

export const SimulateSegmentsBody = z.object({
  userId: id,
  sessionId: id.optional(),
  segments: z
    .array(
      z.object({
        text: z.string().max(4000),
        isUser: z.boolean().default(false),
        speaker: z.string().max(200).nullish(),
        start: z.number().nullish(),
        end: z.number().nullish(),
      }),
    )
    .min(1)
    .max(200),
});

// ---------- runs ----------
export const RunsQuery = z.object({
  userId: id.optional(),
  pipeline: z.enum(['ASSIST', 'INGEST', 'LEARN']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const RunWithCountSchema = RunSchema.extend({ _count: z.object({ steps: z.number().int() }) });
export const RunDetailSchema = RunSchema.extend({
  steps: z.array(StepSchema),
  user: UserSchema.pick({ id: true, displayName: true, contextEnabled: true, assistMode: true }),
}).meta({ id: 'RunDetail' });

// ---------- memory ----------
export const MemoryListQuery = z.object({
  userId: id,
  q: z.string().max(500).optional(),
  type: z.string().max(64).optional(),
});
export const MemoryDeleteQuery = UserIdQuery;
export const PurgeBody = z.object({ userId: id });

// ---------- stream ----------
export const StreamQuery = UserIdQuery;
export const EventTypeSchema = z.enum(EVENT_TYPES).meta({ id: 'EventType' });
export const EventEnvelopeSchema = z
  .object({
    type: EventTypeSchema,
    userId: id,
    runId: id.optional(),
    ts: iso,
    data: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'EventEnvelope' });

// ---------- webhooks / omi ----------
export const WebhookQuery = z
  .object({
    uid: z.string().max(200).optional(),
    session_id: z.string().max(200).optional(),
    secret: z.string().max(500).optional(),
  })
  .loose();
export const WebhookAckSchema = z
  .object({
    ok: z.literal(true),
    received: z.number().int().optional(),
    duplicates: z.number().int().optional(),
    ignored: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .meta({ id: 'WebhookAck' });

export const OmiStatusSchema = z
  .object({
    lastSegmentAt: iso.nullable(),
    lastSegmentSource: z.enum(['OMI_REALTIME', 'OMI_MEMORY', 'SIMULATED']).nullable(),
    segmentsLast5Min: z.object({
      OMI_REALTIME: z.number().int(),
      OMI_MEMORY: z.number().int(),
      SIMULATED: z.number().int(),
    }),
    lastRawWebhookAt: iso.nullable(),
    rawWebhooksLast5Min: z.number().int(),
    webhookSecretConfigured: z.boolean(),
  })
  .meta({ id: 'OmiStatus' });
export const OmiStatusQuery = z.object({ userId: id.optional() });

// ---------- health ----------
export const HealthSchema = z.object({ status: z.literal('ok') }).meta({ id: 'Liveness' });
export const ReadinessSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    mockExternals: z.boolean(),
    db: z.enum(['ok', 'down']),
    redis: z.enum(['ok', 'down']),
    qdrant: z.enum(['ok', 'down']),
    lyzr: z.string().meta({ example: 'configured' }),
  })
  .meta({ id: 'Readiness' });
