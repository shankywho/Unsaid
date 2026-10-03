import { env } from '../../config/env';
import { fetchRetry } from '../../lib/http';
import type { AgentName } from '../../agents/names';
import type { LyzrChatRequest, LyzrClient } from './types';

const ID_ENV: Record<AgentName, () => string> = {
  utterance_classifier: () => env.LYZR_AGENT_UTTERANCE_CLASSIFIER_ID,
  fragment_analyst: () => env.LYZR_AGENT_FRAGMENT_ID,
  context_extractor: () => env.LYZR_AGENT_CONTEXT_EXTRACTOR_ID,
  intent_hypothesizer: () => env.LYZR_AGENT_HYPOTHESIS_ID,
  confirmation_composer: () => env.LYZR_AGENT_CONFIRM_ID,
  learner: () => env.LYZR_AGENT_LEARNER_ID,
  eval_judge: () => env.LYZR_AGENT_EVAL_JUDGE_ID,
};

/** Assumed contract: reply text lives in `response`, else `message`, else `output`. */
export function extractReply(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    for (const k of ['response', 'message', 'output']) {
      const v = o[k];
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') return JSON.stringify(v);
    }
  }
  throw new Error('Lyzr reply had no response/message/output field');
}

export class HttpLyzrClient implements LyzrClient {
  agentId(agent: AgentName): string | undefined {
    return ID_ENV[agent]() || undefined;
  }

  async chat(req: LyzrChatRequest): Promise<string> {
    const agentId = this.agentId(req.agent);
    if (!agentId) throw new Error(`Lyzr agent id for ${req.agent} is not configured`);
    if (!env.LYZR_API_KEY) throw new Error('LYZR_API_KEY is not set');
    const res = await fetchRetry(env.LYZR_INFERENCE_URL, {
      method: 'POST',
      timeoutMs: 20_000,
      headers: { 'content-type': 'application/json', 'x-api-key': env.LYZR_API_KEY },
      body: JSON.stringify({
        user_id: req.userId,
        agent_id: agentId,
        session_id: req.sessionId,
        message: req.message,
      }),
    });
    if (!res.ok) throw new Error(`Lyzr HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    try {
      return extractReply(JSON.parse(text));
    } catch (e) {
      if (e instanceof SyntaxError) return text; // plain-text reply
      throw e;
    }
  }
}
