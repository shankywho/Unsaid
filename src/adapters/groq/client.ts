import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';
import { fetchRetry } from '../../lib/http';
import { logger } from '../../lib/logger';
import type { AgentName } from '../../agents/names';
import type { LyzrChatRequest, LyzrClient } from '../lyzr/types';

export class GroqClient implements LyzrClient {
  private prompts: Map<AgentName, string> = new Map();

  constructor(
    private readonly apiKey: string = env.GROQ_API_KEY,
    private readonly model: string = env.GROQ_MODEL || 'qwen/qwen3.8-27b',
  ) {}

  agentId(agent: AgentName): string | undefined {
    return `groq_${agent}`;
  }

  private loadPrompt(agent: AgentName): string {
    const cached = this.prompts.get(agent);
    if (cached) return cached;
    const candidates = [
      path.resolve(__dirname, `../../agents/prompts/${agent}.md`),
      path.resolve(__dirname, `../../../../src/agents/prompts/${agent}.md`),
      path.resolve(process.cwd(), `src/agents/prompts/${agent}.md`),
      path.resolve(process.cwd(), `dist/src/agents/prompts/${agent}.md`),
    ];
    for (const promptPath of candidates) {
      if (fs.existsSync(promptPath)) {
        const content = fs.readFileSync(promptPath, 'utf8');
        this.prompts.set(agent, content);
        return content;
      }
    }
    throw new Error(`Agent prompt markdown file not found for agent: ${agent}`);
  }

  async chat(req: LyzrChatRequest): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not set');
    }

    const systemPrompt = this.loadPrompt(req.agent);

    const res = await fetchRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      timeoutMs: 25_000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: req.message },
        ],
        temperature: req.agent === 'intent_hypothesizer' ? 0.3 : 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error({ status: res.status, errText, agent: req.agent }, 'Groq inference failed');
      throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Groq response missing content');
    }
    return content;
  }
}
