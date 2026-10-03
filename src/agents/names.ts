export const AGENT_NAMES = [
  'utterance_classifier',
  'fragment_analyst',
  'context_extractor',
  'intent_hypothesizer',
  'confirmation_composer',
  'learner',
  'eval_judge',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];
