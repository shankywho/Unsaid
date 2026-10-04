import { z } from 'zod';

export const UtteranceClassifierOutputSchema = z.object({
  kind: z.enum(['FRAGMENT', 'FLUENT', 'CONFIRMATION_REPLY', 'NOISE']),
  confirmationAnswer: z.enum(['yes', 'no']).nullable().optional().default(null),
  reason: z.string(),
});
export type UtteranceClassifierOutput = z.infer<typeof UtteranceClassifierOutputSchema>;

export const FragmentAnalystOutputSchema = z.object({
  keywords: z.array(z.string()).default([]),
  entities: z
    .array(
      z.union([
        z.object({
          text: z.string(),
          type: z.string(),
        }),
        z.string().transform((s) => ({ text: s, type: 'entity' })),
      ]),
    )
    .default([]),
  speechActGuess: z
    .enum(['request', 'question', 'statement', 'refusal', 'need', 'emotion'])
    .or(z.string())
    .default('statement'),
  negation: z.boolean().default(false),
  possibleSubstitutions: z
    .array(
      z.object({
        said: z.string(),
        maybe: z.array(z.string()),
      }),
    )
    .default([]),
  retrievalQueries: z.array(z.string()).default([]),
});
export type FragmentAnalystOutput = z.infer<typeof FragmentAnalystOutputSchema>;

export const ContextFactSchema = z.object({
  type: z.enum([
    'person',
    'relationship',
    'event',
    'routine',
    'preference',
    'place',
    'object',
    'health_instruction',
  ]),
  text: z.string(),
  entities: z.array(z.string()),
  aliases: z.array(z.string()).default([]),
  eventTime: z.string().optional(),
  validUntil: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
export type ContextFact = z.infer<typeof ContextFactSchema>;

export const ContextExtractorOutputSchema = z.object({
  facts: z.array(ContextFactSchema),
});
export type ContextExtractorOutput = z.infer<typeof ContextExtractorOutputSchema>;

export const HypothesisItemSchema = z.object({
  intent: z.string(),
  sentence: z.string(),
  speaker_perspective_question: z.string(),
  confidence: z.number(),
  evidenceIds: z.array(z.string()).default([]),
  reasoning: z.string(),
});
export type HypothesisItem = z.infer<typeof HypothesisItemSchema>;

export const IntentHypothesizerOutputSchema = z.object({
  hypotheses: z.array(HypothesisItemSchema),
});
export type IntentHypothesizerOutput = z.infer<typeof IntentHypothesizerOutputSchema>;

export const ConfirmationComposerOutputSchema = z.object({
  question: z.string(),
  finalSentence: z.string(),
});
export type ConfirmationComposerOutput = z.infer<typeof ConfirmationComposerOutputSchema>;

export const LearnerOutputSchema = z.object({
  substitutions: z
    .array(
      z.object({
        said: z.string(),
        meant: z.string(),
      }),
    )
    .default([]),
  nameAliases: z
    .array(
      z.object({
        said: z.string(),
        meant: z.string(),
      }),
    )
    .default([]),
  summary: z.string(),
});
export type LearnerOutput = z.infer<typeof LearnerOutputSchema>;

export const EvalJudgeOutputSchema = z.object({
  match: z.boolean(),
  reason: z.string(),
});
export type EvalJudgeOutput = z.infer<typeof EvalJudgeOutputSchema>;

export const AGENT_SCHEMAS = {
  utterance_classifier: UtteranceClassifierOutputSchema,
  fragment_analyst: FragmentAnalystOutputSchema,
  context_extractor: ContextExtractorOutputSchema,
  intent_hypothesizer: IntentHypothesizerOutputSchema,
  confirmation_composer: ConfirmationComposerOutputSchema,
  learner: LearnerOutputSchema,
  eval_judge: EvalJudgeOutputSchema,
} as const;
