import type { ZodType } from 'zod';
import type { AgentName } from './names';
import { adapters } from '../adapters';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export interface RunAgentContext {
  userId: string;
  sessionId?: string;
  runId?: string;
  stepId?: string;
  node?: string;
}

function cleanJsonString(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '');
    s = s.replace(/\s*```$/, '');
  }
  return s.trim();
}

export async function runAgent<T>(
  agent: AgentName,
  schema: ZodType<T>,
  input: unknown,
  ctx: RunAgentContext,
  client = adapters().lyzr,
): Promise<T> {
  const sessionId = ctx.sessionId ?? 'session_default';
  const initialMessage = typeof input === 'string' ? input : JSON.stringify(input);

  const raw = await client.chat({
    agent,
    userId: ctx.userId,
    sessionId,
    message: initialMessage,
  });

  try {
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    return schema.parse(parsed);
  } catch (err: any) {
    logger.warn(
      { agent, error: err.message },
      'Agent response failed JSON/schema validation. Retrying with repair prompt.',
    );
    logger.debug({ agent, rawSnippet: raw.slice(0, 150) }, 'Invalid agent response snippet');

    const repairMessage =
      `Your previous response was not valid JSON or failed the schema: ${err.message}.\n` +
      `You MUST return raw JSON ONLY matching the required format. No explanation, no markdown backticks.`;

    const repairedRaw = await client.chat({
      agent,
      userId: ctx.userId,
      sessionId,
      message: repairMessage,
    });

    try {
      const cleanedRepaired = cleanJsonString(repairedRaw);
      const parsedRepaired = JSON.parse(cleanedRepaired);
      return schema.parse(parsedRepaired);
    } catch (secondErr: any) {
      logger.error({ agent, error: secondErr.message }, 'Agent repair retry failed.');
      logger.debug(
        { agent, repairedRawSnippet: repairedRaw.slice(0, 150) },
        'Invalid repaired agent response snippet',
      );
      throw new AppError(
        502,
        'agent_parse_error',
        `Agent ${agent} failed to return valid schema JSON after repair retry: ${secondErr.message}`,
      );
    }
  }
}
