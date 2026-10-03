import type { AgentName } from '../../agents/names';

export interface LyzrChatRequest {
  agent: AgentName;
  userId: string;
  sessionId: string;
  /** Agents receive a JSON document as their message and answer with JSON only. */
  message: string;
}

export interface LyzrClient {
  /** Returns the agent's raw text reply. */
  chat(req: LyzrChatRequest): Promise<string>;
  /** Lyzr agent id used for this logical agent (undefined for mocks). */
  agentId(agent: AgentName): string | undefined;
}
