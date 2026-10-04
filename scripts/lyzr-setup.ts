import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env';
import { AGENT_NAMES, type AgentName } from '../src/agents/names';
import { fetchRetry } from '../src/lib/http';

interface AgentSpec {
  name: AgentName;
  envVar: string;
  temperature: number;
  description: string;
}

const AGENT_SPECS: Record<AgentName, AgentSpec> = {
  utterance_classifier: {
    name: 'utterance_classifier',
    envVar: 'LYZR_AGENT_UTTERANCE_CLASSIFIER_ID',
    temperature: 0.2,
    description: 'Classifies patient speech into FRAGMENT, FLUENT, CONFIRMATION_REPLY, or NOISE',
  },
  fragment_analyst: {
    name: 'fragment_analyst',
    envVar: 'LYZR_AGENT_FRAGMENT_ID',
    temperature: 0.2,
    description: 'Extracts keywords, entities, speech acts, and generates memory search queries',
  },
  context_extractor: {
    name: 'context_extractor',
    envVar: 'LYZR_AGENT_CONTEXT_EXTRACTOR_ID',
    temperature: 0.2,
    description: 'Extracts structured personal facts from ambient conversation windows',
  },
  intent_hypothesizer: {
    name: 'intent_hypothesizer',
    envVar: 'LYZR_AGENT_HYPOTHESIS_ID',
    temperature: 0.5,
    description: 'Generates 3 ranked hypotheses explaining the fragment using retrieved facts',
  },
  confirmation_composer: {
    name: 'confirmation_composer',
    envVar: 'LYZR_AGENT_CONFIRM_ID',
    temperature: 0.2,
    description: 'Composes warm, concise Yes/No questions and final spoken sentences',
  },
  learner: {
    name: 'learner',
    envVar: 'LYZR_AGENT_LEARNER_ID',
    temperature: 0.2,
    description: 'Extracts personal vocabulary substitutions and word-map patterns from confirmed intent',
  },
  eval_judge: {
    name: 'eval_judge',
    envVar: 'LYZR_AGENT_EVAL_JUDGE_ID',
    temperature: 0.1,
    description: 'Evaluates hypothesis correctness against gold-standard intent in eval suite',
  },
};

function agentBody(spec: AgentSpec, prompt: string): string {
  return JSON.stringify({
    name: `Unsaid - ${spec.name}`,
    description: spec.description,
    agent_instructions: prompt,
    response_format: { type: 'json_object' },
    provider_id: 'openai',
    model: 'gpt-4o-mini',
    top_p: 1,
    temperature: spec.temperature,
  });
}

/** Re-sync the prompt of an already-provisioned agent (keeps its id). */
async function tryUpdateLyzrAgent(
  spec: AgentSpec,
  agentId: string,
  prompt: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchRetry(`https://agent-prod.studio.lyzr.ai/v3/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-api-key': env.LYZR_API_KEY },
      body: agentBody(spec, prompt),
      timeoutMs: 25_000,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `API status ${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function tryCreateLyzrAgent(
  spec: AgentSpec,
  prompt: string,
): Promise<{ ok: boolean; agentId?: string; error?: string }> {
  if (!env.LYZR_API_KEY) {
    return { ok: false, error: 'LYZR_API_KEY is not set' };
  }

  try {
    const res = await fetchRetry('https://agent-prod.studio.lyzr.ai/v3/agents/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.LYZR_API_KEY,
      },
      body: agentBody(spec, prompt),
      timeoutMs: 25_000,
    });

    if (res.ok) {
      const data: any = await res.json();
      const id = data.agent_id || data.id || data.data?.agent_id;
      if (id) return { ok: true, agentId: id };
    }
    const text = await res.text();
    return { ok: false, error: `API status ${res.status}: ${text.slice(0, 200)}` };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function main(): Promise<void> {
  console.log('=====================================================');
  console.log('  UNSAID — Lyzr Agent Provisioning & Configuration   ');
  console.log('=====================================================\n');

  const promptsDir = path.resolve(__dirname, '../src/agents/prompts');
  const results: Record<string, string> = {};

  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  for (const name of AGENT_NAMES) {
    if (only && name !== only) continue;
    const spec = AGENT_SPECS[name];
    const promptPath = path.join(promptsDir, `${name}.md`);
    let prompt = '';
    if (fs.existsSync(promptPath)) {
      prompt = fs.readFileSync(promptPath, 'utf8');
    } else {
      console.warn(`Warning: prompt file missing at ${promptPath}`);
    }

    console.log(`\n• Agent: ${spec.name}`);
    console.log(`  Target Env Var: ${spec.envVar}`);
    console.log(`  Recommended Temp: ${spec.temperature}`);
    console.log(`  Description: ${spec.description}`);

    const existingId = (process.env[spec.envVar] ?? '').trim();
    if (env.LYZR_API_KEY && existingId) {
      const upd = await tryUpdateLyzrAgent(spec, existingId, prompt);
      if (upd.ok) {
        console.log(
          `  ✓ Existing agent ${existingId} updated with the current prompt (no new agent created).`,
        );
        results[spec.envVar] = existingId;
        continue;
      }
      console.log(`  ⚠ Update of ${existingId} failed: ${upd.error}`);
      console.log(
        '  -> Paste src/agents/prompts/' + name + '.md into the agent instructions in Lyzr Studio manually.',
      );
      results[spec.envVar] = existingId;
      continue;
    }

    if (env.LYZR_API_KEY) {
      console.log('  Attempting automated creation via Lyzr Studio API...');
      const outcome = await tryCreateLyzrAgent(spec, prompt);
      if (outcome.ok && outcome.agentId) {
        console.log(`  ✓ Successfully created! Agent ID: ${outcome.agentId}`);
        results[spec.envVar] = outcome.agentId;
        continue;
      } else {
        console.log(`  ⚠ Automated creation failed: ${outcome.error}`);
        console.log('  -> Fallback to manual setup in Lyzr Studio (see below).');
      }
    } else {
      console.log('  (LYZR_API_KEY empty: skipping API call, use Lyzr Studio for manual setup)');
    }

    results[spec.envVar] = `<paste_${spec.name}_agent_id_here>`;
  }

  console.log('\n=====================================================');
  console.log('  Setup Summary & .env configuration                 ');
  console.log('=====================================================\n');
  console.log('Configured Agent IDs:\n');
  for (const [envVar, val] of Object.entries(results)) {
    console.log(`${envVar}=${val}`);
  }

  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    for (const [envVar, val] of Object.entries(results)) {
      if (val && !val.startsWith('<')) {
        const regex = new RegExp(`^${envVar}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${envVar}=${val}`);
        } else {
          envContent += `\n${envVar}=${val}`;
        }
      }
    }
    if (/^LLM_PROVIDER=.*$/m.test(envContent)) {
      envContent = envContent.replace(/^LLM_PROVIDER=.*$/m, 'LLM_PROVIDER=lyzr');
    } else {
      envContent += '\nLLM_PROVIDER=lyzr';
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('\n✓ Automatically synchronized all Lyzr Agent IDs to .env');
  }

  console.log('\nPrompt source files reside in: src/agents/prompts/*.md\n');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Error during Lyzr setup:', e);
    process.exit(1);
  });
}
