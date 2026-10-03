import type { LyzrChatRequest, LyzrClient } from './types';
import type { AgentName } from '../../agents/names';

export class MockLyzrClient implements LyzrClient {
  agentId(_agent: AgentName): string | undefined {
    return undefined;
  }

  async chat(req: LyzrChatRequest): Promise<string> {
    let input: any = {};
    try {
      input = JSON.parse(req.message);
    } catch {
      input = { raw: req.message };
    }

    switch (req.agent) {
      case 'utterance_classifier': {
        const text = (input.text || '').trim();
        const hasPending = Boolean(input.hasPendingConfirmation);

        if (hasPending) {
          if (/\b(yes|yeah|yep|haan|ha|correct|hmm yes|mm-hm|sahi|true)\b/i.test(text)) {
            return JSON.stringify({
              kind: 'CONFIRMATION_REPLY',
              confirmationAnswer: 'yes',
              reason: 'Affirmative confirmation reply detected',
            });
          }
          if (/\b(no|nope|nahi|na|galat|stop|false)\b/i.test(text)) {
            return JSON.stringify({
              kind: 'CONFIRMATION_REPLY',
              confirmationAnswer: 'no',
              reason: 'Negative confirmation reply detected',
            });
          }
        }

        if (!text || text === '...') {
          return JSON.stringify({
            kind: 'NOISE',
            confirmationAnswer: null,
            reason: 'Empty or ambient noise',
          });
        }

        if (
          text.includes('…') ||
          text.includes('...') ||
          text.split(/\s+/).length <= 4 ||
          /\b(cake|sugar|water|walk|glasses|tea|priya|ramesh|car)\b/i.test(text)
        ) {
          return JSON.stringify({
            kind: 'FRAGMENT',
            confirmationAnswer: null,
            reason: 'Fragmented telegraphic aphasic speech',
          });
        }

        return JSON.stringify({
          kind: 'FLUENT',
          confirmationAnswer: null,
          reason: 'Complete fluent grammatical sentence',
        });
      }

      case 'fragment_analyst': {
        const text = (input.text || input.fragment || '').trim();
        const tokens = text
          .toLowerCase()
          .replace(/[….,?!]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 0 && !['the', 'a', 'an', 'is', 'at', 'in'].includes(w));

        const entities: Array<{ text: string; type: string }> = [];
        if (/sunday/i.test(text)) entities.push({ text: 'Sunday', type: 'time' });
        if (/priya/i.test(text)) entities.push({ text: 'Priya', type: 'person' });
        if (/ramesh/i.test(text)) entities.push({ text: 'Ramesh', type: 'person' });
        if (/aarav/i.test(text)) entities.push({ text: 'Aarav', type: 'person' });
        if (/mehta/i.test(text)) entities.push({ text: 'Dr. Mehta', type: 'person' });

        const isNegation = /\b(no|nahi|not|stop|na)\b/i.test(text);
        const queries: string[] = [];
        if (/priya|cake|sugar|sunday/i.test(text)) {
          queries.push('Priya visiting Sunday', 'cake sugar restriction Dr. Mehta');
        } else if (/water|bill|ramesh/i.test(text)) {
          queries.push('water bill Ramesh', 'utilities payment');
        } else if (/glasses|broken|repair/i.test(text)) {
          queries.push('reading glasses repair', 'optical store');
        } else if (/car|park|six|walk/i.test(text)) {
          queries.push('evening walk park 6 PM', 'routine exercise');
        } else {
          queries.push(text, tokens.slice(0, 3).join(' '));
        }

        const possibleSubstitutions: Array<{ said: string; maybe: string[] }> = [];
        if (/\bcar\b/i.test(text)) {
          possibleSubstitutions.push({ said: 'car', maybe: ['walk', 'bus', 'park'] });
        }
        if (/\bpri\b/i.test(text)) {
          possibleSubstitutions.push({ said: 'Pri', maybe: ['Priya'] });
        }

        return JSON.stringify({
          keywords: Array.from(new Set(tokens)),
          entities,
          speechActGuess: isNegation ? 'refusal' : 'request',
          negation: isNegation,
          possibleSubstitutions,
          retrievalQueries: queries.filter((q) => q.length > 0),
        });
      }

      case 'context_extractor': {
        const segments: any[] = Array.isArray(input.segments) ? input.segments : [];
        const fullText = segments.map((s) => (typeof s === 'string' ? s : s.text || '')).join(' ');

        const facts: any[] = [];
        if (/priya/i.test(fullText) && /sunday/i.test(fullText)) {
          facts.push({
            type: 'event',
            text: 'Priya (daughter) is visiting on Sunday',
            entities: ['Priya', 'Sunday'],
            aliases: ['beti'],
            eventTime: '2026-10-11T10:00:00+05:30',
            validUntil: '2026-10-12T23:59:00+05:30',
            confidence: 0.95,
          });
        }
        if (/sugar|sweet|cake/i.test(fullText) || /dr\.?\s*mehta/i.test(fullText)) {
          facts.push({
            type: 'health_instruction',
            text: 'Dr. Mehta said Papa should avoid sugar and sweets',
            entities: ['Dr. Mehta', 'Papa', 'sugar'],
            aliases: [],
            confidence: 0.95,
          });
        }
        if (/water\s*bill/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Water bill is due for payment this week',
            entities: ['water bill'],
            aliases: [],
            validUntil: '2026-10-15T23:59:00+05:30',
            confidence: 0.9,
          });
        }
        if (/glasses|chashma/i.test(fullText)) {
          facts.push({
            type: 'object',
            text: 'Reading glasses are broken and being repaired',
            entities: ['glasses'],
            aliases: ['chashma'],
            confidence: 0.9,
          });
        }
        if (/walk|park|6\s*pm/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Daily walk to the park at 6 PM',
            entities: ['park', '6 PM'],
            aliases: [],
            confidence: 0.9,
          });
        }

        // If no specific fixture pattern matched, extract from non-empty segments
        if (facts.length === 0 && segments.length > 0) {
          const first = segments.find((s) => (typeof s === 'string' ? s : s.text || '').trim().length > 0);
          if (first) {
            const txt = typeof first === 'string' ? first : first.text;
            facts.push({
              type: 'routine',
              text: txt,
              entities: ['ambient'],
              aliases: [],
              confidence: 0.8,
            });
          }
        }

        return JSON.stringify({ facts });
      }

      case 'intent_hypothesizer': {
        const fragment = (input.fragment || '').trim();
        const memoryFacts: any[] = Array.isArray(input.memoryFacts) ? input.memoryFacts : [];
        const wordMapHits: any[] = Array.isArray(input.wordMapHits) ? input.wordMapHits : [];

        // Check if word-map has a learned resolved_utterance
        const resolvedHit = wordMapHits.find((h) => h.resolvedSentence || (h.payload && h.payload.resolvedSentence));
        if (resolvedHit) {
          const sent = resolvedHit.resolvedSentence || resolvedHit.payload?.resolvedSentence;
          return JSON.stringify({
            hypotheses: [
              {
                intent: sent,
                sentence: sent,
                speaker_perspective_question: `Do you mean: ${sent}?`,
                confidence: 0.92,
                evidenceIds: [],
                reasoning: 'Matched previously learned patient-specific utterance from word map',
              },
              {
                intent: `Alternative: ${sent}`,
                sentence: `Please note: ${sent}`,
                speaker_perspective_question: `Did you mean: ${sent}?`,
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Secondary variation of learned pattern',
              },
              {
                intent: `General query regarding: ${fragment}`,
                sentence: `Can we discuss ${fragment}?`,
                speaker_perspective_question: `Are you asking about ${fragment}?`,
                confidence: 0.03,
                evidenceIds: [],
                reasoning: 'Fallback query',
              },
            ],
          });
        }

        // If memory facts exist (Context ON)
        if (memoryFacts.length > 0) {
          const evidenceIds = memoryFacts.map((m) => m.id || m.payload?.id || 'mem_fact').filter(Boolean);

          // Check for Priya / cake / no scenario
          if (/priya/i.test(fragment) && /cake/i.test(fragment)) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Tell Priya not to bring cake on Sunday',
                  sentence: 'Please tell Priya not to bring cake on Sunday.',
                  speaker_perspective_question: "Do you mean Priya shouldn't bring cake on Sunday?",
                  confidence: 0.82,
                  evidenceIds: evidenceIds.slice(0, 2),
                  reasoning: 'Priya visiting on Sunday + sugar restriction + negation "no"',
                },
                {
                  intent: 'Ask Priya to bring sugar-free cake on Sunday',
                  sentence: 'Can Priya bring a sugar-free cake on Sunday?',
                  speaker_perspective_question: 'Do you mean Priya can bring a sugar-free cake?',
                  confidence: 0.12,
                  evidenceIds: [evidenceIds[0]],
                  reasoning: 'Alternative interpretation regarding diet-friendly cake',
                },
                {
                  intent: 'Ask if Priya is coming on Sunday',
                  sentence: 'Is Priya coming on Sunday?',
                  speaker_perspective_question: 'Are you asking if Priya is coming on Sunday?',
                  confidence: 0.06,
                  evidenceIds: [evidenceIds[0]],
                  reasoning: 'Inquiring about visit schedule',
                },
              ],
            });
          }

          // Check for water / bill / Ramesh scenario
          if (/water|bill|ramesh/i.test(fragment)) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask Ramesh if the water bill was paid',
                  sentence: 'Did Ramesh pay the water bill?',
                  speaker_perspective_question: 'Are you asking if Ramesh paid the water bill?',
                  confidence: 0.85,
                  evidenceIds: evidenceIds.slice(0, 1),
                  reasoning: 'Water bill due + Ramesh handles bills',
                },
                {
                  intent: 'Remind Ramesh to pay the water bill',
                  sentence: 'Please remind Ramesh to pay the water bill today.',
                  speaker_perspective_question: 'Should we remind Ramesh to pay the bill?',
                  confidence: 0.1,
                  evidenceIds: evidenceIds.slice(0, 1),
                  reasoning: 'Reminder interpretation',
                },
                {
                  intent: 'Ask when Ramesh is coming home',
                  sentence: 'When is Ramesh coming home?',
                  speaker_perspective_question: 'Are you asking when Ramesh will be back?',
                  confidence: 0.05,
                  evidenceIds: [],
                  reasoning: 'General family inquiry',
                },
              ],
            });
          }

          // Check for glasses scenario
          if (/glasses|thing|eyes|chashma/i.test(fragment)) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask when reading glasses will be repaired',
                  sentence: 'When will my reading glasses be back from repair?',
                  speaker_perspective_question: 'Are you asking about your reading glasses?',
                  confidence: 0.88,
                  evidenceIds: evidenceIds.slice(0, 1),
                  reasoning: 'Reading glasses broken and under repair',
                },
                {
                  intent: 'Where are my glasses',
                  sentence: 'Can someone help me find my glasses?',
                  speaker_perspective_question: 'Are you looking for your glasses?',
                  confidence: 0.08,
                  evidenceIds: evidenceIds.slice(0, 1),
                  reasoning: 'Alternative search request',
                },
                {
                  intent: 'I need help reading',
                  sentence: 'I need someone to read this for me.',
                  speaker_perspective_question: 'Do you need help reading something?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Activity need',
                },
              ],
            });
          }

          // Generic with memory facts
          const topFact = memoryFacts[0];
          const factText = topFact.text || topFact.payload?.text || 'personal routine';
          return JSON.stringify({
            hypotheses: [
              {
                intent: `Regarding ${factText}`,
                sentence: `I want to ask about ${factText}.`,
                speaker_perspective_question: `Is this about ${factText}?`,
                confidence: 0.7,
                evidenceIds: [topFact.id || 'mem_1'],
                reasoning: `Matched context: ${factText}`,
              },
              {
                intent: `Help with ${fragment}`,
                sentence: `Please help me with ${fragment}.`,
                speaker_perspective_question: `Do you need help with ${fragment}?`,
                confidence: 0.2,
                evidenceIds: [],
                reasoning: 'Direct assistance interpretation',
              },
              {
                intent: `Check status of ${fragment}`,
                sentence: `Can you check the status of ${fragment}?`,
                speaker_perspective_question: `Should I check on ${fragment}?`,
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'General status inquiry',
              },
            ],
          });
        }

        // Context OFF (Ablation mode)
        return JSON.stringify({
          hypotheses: [
            {
              intent: `Literal topic: ${fragment}`,
              sentence: `I am trying to say: ${fragment}.`,
              speaker_perspective_question: `Are you talking about ${fragment}?`,
              confidence: 0.45,
              evidenceIds: [],
              reasoning: 'No personal memory context available; literal surface extraction.',
            },
            {
              intent: `Need help with ${fragment}`,
              sentence: `I need help with ${fragment}.`,
              speaker_perspective_question: `Do you need help with this?`,
              confidence: 0.35,
              evidenceIds: [],
              reasoning: 'Generic need assumption',
            },
            {
              intent: `Refusal regarding ${fragment}`,
              sentence: `No, not ${fragment}.`,
              speaker_perspective_question: `Are you saying no to ${fragment}?`,
              confidence: 0.2,
              evidenceIds: [],
              reasoning: 'Generic negation fallback',
            },
          ],
        });
      }

      case 'confirmation_composer': {
        const hypothesis = input.hypothesis || {};
        const attempt = input.attemptNumber || 1;
        const sent = hypothesis.sentence || 'I need help.';
        const q =
          attempt === 1
            ? hypothesis.speaker_perspective_question || `Do you mean ${sent}?`
            : `Understood. Did you mean: ${sent}?`;

        return JSON.stringify({
          question: q.length > 80 ? q.slice(0, 77) + '?' : q,
          finalSentence: sent,
        });
      }

      case 'learner': {
        const fragment = (input.fragment || '').toLowerCase();
        const confirmed = (input.confirmedSentence || '').toLowerCase();
        const substitutions: Array<{ said: string; meant: string }> = [];
        const nameAliases: Array<{ said: string; meant: string }> = [];

        if (fragment.includes('car') && (confirmed.includes('walk') || confirmed.includes('bus'))) {
          substitutions.push({ said: 'car', meant: confirmed.includes('walk') ? 'walk' : 'bus' });
        }
        if (fragment.includes('pri') && confirmed.includes('priya')) {
          nameAliases.push({ said: 'Pri', meant: 'Priya' });
        }

        return JSON.stringify({
          substitutions,
          nameAliases,
          summary:
            substitutions.length > 0 || nameAliases.length > 0
              ? 'Learned patient substitution patterns.'
              : 'Confirmed intent recorded for fragment.',
        });
      }

      case 'eval_judge': {
        const gold = (input.goldIntent || '').toLowerCase();
        const hypSent = (input.hypothesisSentence || '').toLowerCase();
        const hypInt = (input.hypothesisIntent || '').toLowerCase();
        const combined = `${hypSent} ${hypInt}`;

        // Match if core semantic keywords overlap
        const goldWords = gold
          .replace(/[.,?!]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 3 && !['please', 'tell', 'that', 'with', 'about'].includes(w));

        const matches = goldWords.filter((w: string) => combined.includes(w));
        const ratio = goldWords.length > 0 ? matches.length / goldWords.length : 0;
        const isMatch = ratio >= 0.5 || combined.includes(gold);

        return JSON.stringify({
          match: isMatch,
          reason: isMatch
            ? `Hypothesis covers key semantics: ${matches.join(', ')}`
            : `Missing critical concepts from gold intent: ${gold}`,
        });
      }

      default:
        return '{}';
    }
  }
}
