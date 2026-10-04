import { collections } from '../adapters/qdrant/collections';

/** Which sponsor/service a pipeline step runs on. Shown as a tag on each trace row. */
export interface StepService {
  provider: 'lyzr' | 'qdrant' | 'openai' | 'tts' | 'redis' | 'local';
  /** Agent name (lyzr), collection (qdrant) or model/queue name. */
  name: string;
}

const LYZR_NODES: Record<string, string> = {
  classify: 'utterance_classifier',
  fragment_analyze: 'fragment_analyst',
  hypothesize: 'intent_hypothesizer',
  extract_facts: 'context_extractor',
  learner: 'learner',
};

export function stepService(node: string, agentId?: string | null): StepService {
  if (node === 'classify' && agentId === 'mode_override') return { provider: 'local', name: 'mode_override' };
  const agent = LYZR_NODES[node];
  if (agent) return { provider: 'lyzr', name: agent };
  switch (node) {
    case 'retrieve_raw_memory':
    case 'retrieve_memory':
    case 'upsert_memory':
      return { provider: 'qdrant', name: collections.memory };
    case 'retrieve_wordmap':
    case 'upsert_wordmap':
      return { provider: 'qdrant', name: collections.wordmap };
    case 'embed':
      return { provider: 'openai', name: 'embeddings' };
    case 'tts_question':
      return { provider: 'tts', name: 'speech' };
    case 'await_confirmation':
      return { provider: 'redis', name: 'pending-confirmation' };
    default:
      return { provider: 'local', name: node };
  }
}
