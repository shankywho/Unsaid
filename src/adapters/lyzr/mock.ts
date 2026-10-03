import type { LyzrChatRequest, LyzrClient } from './types';
import type { AgentName } from '../../agents/names';

/** Placeholder; deterministic context-sensitive handlers are added in Phase 3. */
export class MockLyzrClient implements LyzrClient {
  agentId(_agent: AgentName): string | undefined {
    return undefined;
  }
  async chat(_req: LyzrChatRequest): Promise<string> {
    return '{}';
  }
}
