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
          /\b(cake|sugar|water|walk|glasses|tea|priya|ramesh|car|physio|aarav|temple|shawl)\b/i.test(text)
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
        if (/tuesday/i.test(text)) entities.push({ text: 'Tuesday', type: 'time' });
        if (/thursday/i.test(text)) entities.push({ text: 'Thursday', type: 'time' });
        if (/saturday/i.test(text)) entities.push({ text: 'Saturday', type: 'time' });
        if (/priya/i.test(text)) entities.push({ text: 'Priya', type: 'person' });
        if (/ramesh/i.test(text)) entities.push({ text: 'Ramesh', type: 'person' });
        if (/aarav/i.test(text)) entities.push({ text: 'Aarav', type: 'person' });
        if (/sunita/i.test(text)) entities.push({ text: 'Sunita', type: 'person' });
        if (/mehta/i.test(text)) entities.push({ text: 'Dr. Mehta', type: 'person' });

        const isNegation = /\b(no|nahi|not|stop|na|mana)\b/i.test(text);
        const queries: string[] = [];

        if (/priya/i.test(text)) queries.push('Priya visiting Sunday', 'Priya daughter Pune');
        if (/cake|sugar|sweet|mithai/i.test(text))
          queries.push('cake sugar restriction Dr. Mehta', 'no sugar diet');
        if (/water|bill|ramesh/i.test(text)) queries.push('water bill Ramesh', 'utilities payment');
        if (/glasses|specs|chashma|eyes|broken/i.test(text))
          queries.push('reading glasses repair optician', 'optical store pickup');
        if (/car|park|walk|six|6/i.test(text)) queries.push('evening walk park 6 PM', 'routine exercise');
        if (/aarav|cricket|bat|match/i.test(text))
          queries.push('Aarav cricket tournament match Saturday', 'school cricket');
        if (/physio|thursday|arm/i.test(text))
          queries.push('physiotherapy Thursday 11 AM', 'arm exercises stroke mobility');
        if (/shawl|blue/i.test(text)) queries.push('blue shawl chair', 'warm clothes');
        if (/temple|tuesday/i.test(text))
          queries.push('Tuesday morning temple visit Hanuman', 'temple with Ramesh');
        if (/radio|song|battery/i.test(text))
          queries.push('vintage radio batteries afternoon songs', 'Hindi music');

        if (queries.length === 0) {
          queries.push(text, tokens.slice(0, 3).join(' '));
        }

        const possibleSubstitutions: Array<{ said: string; maybe: string[] }> = [];
        if (/\bcar\b/i.test(text))
          possibleSubstitutions.push({ said: 'car', maybe: ['walk', 'bus', 'park'] });
        if (/\bpri\b/i.test(text)) possibleSubstitutions.push({ said: 'Pri', maybe: ['Priya'] });

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
        if (/priya/i.test(fullText) && /sunday|pune/i.test(fullText)) {
          facts.push({
            type: 'event',
            text: 'Priya (daughter) is visiting on Sunday morning from Pune',
            entities: ['Priya', 'Sunday', 'Pune'],
            aliases: ['beti', 'Pri'],
            eventTime: '2026-10-11T10:00:00+05:30',
            validUntil: '2026-10-12T23:59:00+05:30',
            confidence: 0.95,
          });
        }
        if (/sugar|sweet|cake|mithai/i.test(fullText) || /dr\.?\s*mehta/i.test(fullText)) {
          facts.push({
            type: 'health_instruction',
            text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets, and pastries',
            entities: ['Dr. Mehta', 'Papa', 'sugar'],
            aliases: [],
            confidence: 0.98,
          });
        }
        if (/water\s*bill/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Municipal water bill is due this week, Ramesh handles payment',
            entities: ['water bill', 'Ramesh'],
            aliases: [],
            validUntil: '2026-10-15T23:59:00+05:30',
            confidence: 0.92,
          });
        }
        if (/glasses|chashma|specs/i.test(fullText)) {
          facts.push({
            type: 'object',
            text: 'Reading glasses frame cracked and sent to optical shop for repair',
            entities: ['glasses', 'optician'],
            aliases: ['chashma', 'specs'],
            confidence: 0.94,
          });
        }
        if (/walk|park|6\s*pm/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Daily evening walk to the community park at 6 PM with Sunita',
            entities: ['park', '6 PM', 'Sunita'],
            aliases: [],
            confidence: 0.95,
          });
        }
        if (/cricket|aarav|bat|tournament/i.test(fullText)) {
          facts.push({
            type: 'event',
            text: "Grandson Aarav's school cricket tournament match is on Saturday morning",
            entities: ['Aarav', 'cricket', 'Saturday'],
            aliases: [],
            confidence: 0.95,
          });
        }
        if (/physio|thursday|mobility|arm/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Physiotherapist session moved to Thursday at 11 AM; shoulder rotations twice daily',
            entities: ['physio', 'Thursday', 'arm'],
            aliases: [],
            confidence: 0.95,
          });
        }
        if (/shawl|blue/i.test(fullText)) {
          facts.push({
            type: 'object',
            text: 'Blue shawl kept washed and folded on the easy chair',
            entities: ['blue shawl'],
            aliases: [],
            confidence: 0.9,
          });
        }
        if (/temple|tuesday|hanuman/i.test(fullText)) {
          facts.push({
            type: 'routine',
            text: 'Every Tuesday morning Hanuman temple visit with Ramesh',
            entities: ['temple', 'Tuesday', 'Ramesh'],
            aliases: [],
            confidence: 0.95,
          });
        }
        if (/radio|battery/i.test(fullText)) {
          facts.push({
            type: 'object',
            text: 'Vintage radio with batteries fully charged for old Hindi songs after lunch',
            entities: ['radio'],
            aliases: [],
            confidence: 0.9,
          });
        }

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
        const fragment = (input.fragment || '').toLowerCase().trim();
        const memoryFacts: any[] = Array.isArray(input.memoryFacts) ? input.memoryFacts : [];
        const wordMapHits: any[] = Array.isArray(input.wordMapHits) ? input.wordMapHits : [];

        // 1. Check if word-map has a learned resolved_utterance
        const resolvedHit = wordMapHits.find(
          (h) => h.resolvedSentence || (h.payload && h.payload.resolvedSentence),
        );
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

        // 2. If memory facts exist (Context ON)
        if (memoryFacts.length > 0) {
          const evIds = memoryFacts.map((m) => m.id || m.payload?.id || 'mem_1');

          // Knowledge-grounded interpretations
          if (fragment.includes('priya') && fragment.includes('cake')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Tell Priya not to bring cake on Sunday due to sugar restriction',
                  sentence: 'Please tell Priya not to bring cake on Sunday due to my sugar restriction.',
                  speaker_perspective_question: "Do you mean Priya shouldn't bring cake on Sunday?",
                  confidence: 0.85,
                  evidenceIds: evIds.slice(0, 2),
                  reasoning: 'Priya visiting Sunday + sugar restriction + negation',
                },
                {
                  intent: 'Ask Priya to bring sugar-free cake',
                  sentence: 'Can Priya bring a sugar-free cake on Sunday?',
                  speaker_perspective_question: 'Do you mean Priya can bring a sugar-free cake?',
                  confidence: 0.1,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Alternative diet request',
                },
                {
                  intent: 'Ask when Priya is arriving',
                  sentence: 'What time is Priya coming on Sunday?',
                  speaker_perspective_question: 'Are you asking when Priya arrives?',
                  confidence: 0.05,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Schedule check',
                },
              ],
            });
          }

          if (fragment.includes('water') && (fragment.includes('ramesh') || fragment.includes('bill'))) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask Ramesh if the municipal water bill was paid',
                  sentence: 'Did Ramesh pay the municipal water bill?',
                  speaker_perspective_question: 'Are you asking if Ramesh paid the water bill?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Water bill due + Ramesh handles bills',
                },
                {
                  intent: 'Remind Ramesh about water bill',
                  sentence: 'Please remind Ramesh to pay the water bill today.',
                  speaker_perspective_question: 'Should we remind Ramesh about the water bill?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Reminder option',
                },
                {
                  intent: 'Ask when Ramesh is coming home',
                  sentence: 'When is Ramesh coming back from office?',
                  speaker_perspective_question: 'Are you asking when Ramesh will return?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Family check',
                },
              ],
            });
          }

          if (
            fragment.includes('glasses') ||
            fragment.includes('specs') ||
            fragment.includes('chashma') ||
            (fragment.includes('thing') && fragment.includes('eyes'))
          ) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Inquire about status of repaired reading glasses',
                  sentence: 'When will my repaired reading glasses be back from the optician?',
                  speaker_perspective_question: 'Are you asking about your reading glasses being repaired?',
                  confidence: 0.87,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Reading glasses broken and being repaired',
                },
                {
                  intent: 'Ask someone to help find glasses',
                  sentence: 'Can someone help me find my glasses?',
                  speaker_perspective_question: 'Are you looking for your glasses?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Search request',
                },
                {
                  intent: 'Need help reading newspaper',
                  sentence: 'I need someone to read the newspaper for me.',
                  speaker_perspective_question: 'Do you need someone to read the newspaper?',
                  confidence: 0.05,
                  evidenceIds: [],
                  reasoning: 'Reading help',
                },
              ],
            });
          }

          if (
            fragment.includes('car') ||
            (fragment.includes('walk') && (fragment.includes('park') || fragment.includes('6')))
          ) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Time for evening walk to the park at 6 PM',
                  sentence: 'It is time for our evening walk in the park at six.',
                  speaker_perspective_question: 'Are you ready for our evening walk in the park?',
                  confidence: 0.89,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Learned substitution car -> walk + daily 6 PM walk routine',
                },
                {
                  intent: 'Ask Sunita to go outside',
                  sentence: 'Sunita, can we go to the park now?',
                  speaker_perspective_question: 'Do you want to go to the park with Sunita now?',
                  confidence: 0.07,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Immediate departure',
                },
                {
                  intent: 'Ask what time it is',
                  sentence: 'Is it six oclock yet?',
                  speaker_perspective_question: 'Are you asking if it is six oclock?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Time check',
                },
              ],
            });
          }

          if (fragment.includes('aarav') || fragment.includes('cricket')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: "Ask about Aarav's cricket match on Saturday",
                  sentence: "What time is Aarav's school cricket tournament match on Saturday?",
                  speaker_perspective_question: "Are you asking about Aarav's cricket match on Saturday?",
                  confidence: 0.86,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Grandson Aarav cricket match Saturday',
                },
                {
                  intent: 'Cheer for Aarav in cricket match',
                  sentence: 'We will cheer for Aarav in his cricket tournament.',
                  speaker_perspective_question: 'Do you want to go watch Aarav play cricket?',
                  confidence: 0.1,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Cheering intent',
                },
                {
                  intent: 'Ask about Aarav cricket bat',
                  sentence: 'Did Ramesh fix the grip on the cricket bat?',
                  speaker_perspective_question: 'Are you asking about the cricket bat?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Bat repair',
                },
              ],
            });
          }

          if (fragment.includes('physio') || (fragment.includes('thursday') && !fragment.includes('priya'))) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Confirm that physio session was moved to Thursday',
                  sentence: 'Is the physiotherapist coming on Thursday at 11 AM?',
                  speaker_perspective_question: 'Are you asking if physio is on Thursday?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Physiotherapist moved session to Thursday 11 AM',
                },
                {
                  intent: 'Ask for arm exercises',
                  sentence: 'Should I do my shoulder and arm rotations now?',
                  speaker_perspective_question: 'Do you want to practice your arm exercises?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Exercise schedule',
                },
                {
                  intent: 'Check appointment time',
                  sentence: 'What time is the doctor arriving?',
                  speaker_perspective_question: 'Are you asking about appointment time?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Time inquiry',
                },
              ],
            });
          }

          if (fragment.includes('shawl') || fragment.includes('blue')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask where the blue shawl is',
                  sentence: 'Can someone bring me my blue shawl from the chair?',
                  speaker_perspective_question: 'Are you looking for your blue shawl?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Blue shawl folded on chair',
                },
                {
                  intent: 'Feeling chilly',
                  sentence: 'It feels chilly, I need a shawl.',
                  speaker_perspective_question: 'Are you feeling cold and need a shawl?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Cold sensation',
                },
                {
                  intent: 'Ask who washed the shawl',
                  sentence: 'Did Sunita wash the blue shawl?',
                  speaker_perspective_question: 'Are you asking if the shawl is washed?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Laundry status',
                },
              ],
            });
          }

          if (fragment.includes('temple') || (fragment.includes('tuesday') && fragment.includes('ramesh'))) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask Ramesh if they are going to the temple on Tuesday',
                  sentence: 'Ramesh, are we going to the Hanuman temple on Tuesday morning?',
                  speaker_perspective_question: 'Are you asking about visiting the temple on Tuesday?',
                  confidence: 0.89,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Tuesday morning Hanuman temple visit routine',
                },
                {
                  intent: 'Offer temple prayers',
                  sentence: 'We should pray at the temple on Tuesday.',
                  speaker_perspective_question: 'Do you want to visit the temple on Tuesday?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Prayer intent',
                },
                {
                  intent: 'Ask when Tuesday is',
                  sentence: 'Is tomorrow Tuesday?',
                  speaker_perspective_question: 'Are you asking if tomorrow is Tuesday?',
                  confidence: 0.03,
                  evidenceIds: [],
                  reasoning: 'Calendar check',
                },
              ],
            });
          }

          if (fragment.includes('radio') || fragment.includes('song')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Want to listen to the vintage radio and check battery',
                  sentence: 'Please turn on the vintage radio to play old Hindi songs.',
                  speaker_perspective_question: 'Would you like to listen to songs on the radio?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Vintage radio after lunch routine',
                },
                {
                  intent: 'Check radio batteries',
                  sentence: 'Did Ramesh check the batteries in the radio?',
                  speaker_perspective_question: 'Are you asking about the radio batteries?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Battery check',
                },
                {
                  intent: 'Music volume request',
                  sentence: 'Can we play soft music?',
                  speaker_perspective_question: 'Do you want to hear some music?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'General music',
                },
              ],
            });
          }

          if (fragment.includes('priya') || fragment.includes('pri')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Ask what time daughter Priya will arrive on Sunday',
                  sentence: 'What time is Priya arriving on Sunday morning from Pune?',
                  speaker_perspective_question: 'Are you asking what time Priya will arrive on Sunday?',
                  confidence: 0.85,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Priya visiting Sunday morning',
                },
                {
                  intent: 'Happy that daughter Priya is coming to visit',
                  sentence: 'I am looking forward to seeing beti Priya on Sunday.',
                  speaker_perspective_question: 'Are you excited for Priya to visit on Sunday?',
                  confidence: 0.1,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Affectionate remark',
                },
                {
                  intent: 'Ask if Priya called',
                  sentence: 'Did Priya call on the phone today?',
                  speaker_perspective_question: 'Are you asking if Priya called?',
                  confidence: 0.05,
                  evidenceIds: [],
                  reasoning: 'Call inquiry',
                },
              ],
            });
          }

          if (fragment.includes('chai') || fragment.includes('tea')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Remind that tea must be served without sugar',
                  sentence: 'Please ensure my tea is served with no sugar per Dr. Mehta.',
                  speaker_perspective_question: 'Are you reminding us to make tea without sugar?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Sugar restriction on morning tea',
                },
                {
                  intent: 'Request morning ginger tea',
                  sentence: 'Can Sunita bring my ginger tea now?',
                  speaker_perspective_question: 'Would you like your ginger tea now?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Tea request',
                },
                {
                  intent: 'Hot beverage need',
                  sentence: 'I would like a warm drink.',
                  speaker_perspective_question: 'Do you want something warm to drink?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Warm drink',
                },
              ],
            });
          }

          if (
            fragment.includes('sugar') ||
            fragment.includes('sweet') ||
            fragment.includes('mithai') ||
            fragment.includes('mehta')
          ) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: "Ask about Dr. Mehta's sugar and medication instructions",
                  sentence: 'Remember Dr. Mehta strictly forbade sugar, sweets, and pastries.',
                  speaker_perspective_question: 'Are you mentioning Dr. Mehta sugar restriction?',
                  confidence: 0.88,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Doctor orders on sugar restriction',
                },
                {
                  intent: 'State that sweets are forbidden per doctor orders',
                  sentence: 'No sweets or mithai allowed for me.',
                  speaker_perspective_question: 'Are you saying sweets are not allowed?',
                  confidence: 0.08,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Sweets forbidden',
                },
                {
                  intent: 'Ask about doctor visit',
                  sentence: 'When is Dr. Mehta coming for follow-up?',
                  speaker_perspective_question: 'Are you asking about Dr. Mehta?',
                  confidence: 0.04,
                  evidenceIds: [],
                  reasoning: 'Doctor visit',
                },
              ],
            });
          }

          if (fragment.includes('arm') || fragment.includes('exercise')) {
            return JSON.stringify({
              hypotheses: [
                {
                  intent: 'Remind caregiver about doing arm exercises from physio',
                  sentence: 'Time to practice my shoulder rotations and arm exercises twice daily.',
                  speaker_perspective_question: 'Do you want to do your arm exercises now?',
                  confidence: 0.86,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Physiotherapist shoulder exercises twice daily',
                },
                {
                  intent: 'Arm mobility improvement',
                  sentence: 'My arm mobility is feeling a bit better today.',
                  speaker_perspective_question: 'Is your arm feeling better today?',
                  confidence: 0.09,
                  evidenceIds: evIds.slice(0, 1),
                  reasoning: 'Mobility update',
                },
                {
                  intent: 'Need help moving arm',
                  sentence: 'Can you help support my arm?',
                  speaker_perspective_question: 'Do you need assistance with your arm?',
                  confidence: 0.05,
                  evidenceIds: [],
                  reasoning: 'Arm support',
                },
              ],
            });
          }
        }

        // 3. Fallback / Context OFF (or generic requests)
        // Self-contained phrases without needing context:
        if (fragment.includes('water') && fragment.includes('drink')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request a glass of drinking water',
                sentence: 'Please bring me a glass of drinking water.',
                speaker_perspective_question: 'Would you like a glass of drinking water?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Direct drinking water request',
              },
              {
                intent: 'Thirsty',
                sentence: 'I am feeling thirsty.',
                speaker_perspective_question: 'Are you thirsty?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Thirsty',
              },
              {
                intent: 'Help',
                sentence: 'I need some help.',
                speaker_perspective_question: 'Do you need help?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Help',
              },
            ],
          });
        }

        if (fragment.includes('tired') || fragment.includes('sleep') || fragment.includes('bed')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Express feeling tired and wanting to rest in bed',
                sentence: 'I am feeling very tired and want to rest in bed now.',
                speaker_perspective_question: 'Are you feeling tired and want to rest in bed?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Rest in bed request',
              },
              {
                intent: 'Sleep now',
                sentence: 'I want to go to sleep.',
                speaker_perspective_question: 'Do you want to sleep?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Sleep',
              },
              {
                intent: 'Lie down',
                sentence: 'Can I lie down for a while?',
                speaker_perspective_question: 'Do you want to lie down?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Lie down',
              },
            ],
          });
        }

        if (fragment.includes('fan') || (fragment.includes('cold') && fragment.includes('off'))) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request to turn off the ceiling fan because of feeling cold',
                sentence: 'Please turn off the ceiling fan, I am feeling cold.',
                speaker_perspective_question: 'Should I turn off the ceiling fan?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Fan off request',
              },
              {
                intent: 'Cold',
                sentence: 'It is too cold in the room.',
                speaker_perspective_question: 'Is it cold?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Cold',
              },
              {
                intent: 'Blanket',
                sentence: 'Please give me a blanket.',
                speaker_perspective_question: 'Do you want a blanket?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Blanket',
              },
            ],
          });
        }

        if (fragment.includes('window') || (fragment.includes('air') && fragment.includes('open'))) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request to open the window for fresh air',
                sentence: 'Please open the window to let in some fresh air.',
                speaker_perspective_question: 'Would you like me to open the window for fresh air?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Open window request',
              },
              {
                intent: 'Fresh air',
                sentence: 'I need fresh air.',
                speaker_perspective_question: 'Do you want fresh air?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Air',
              },
              {
                intent: 'Look outside',
                sentence: 'I want to look outside.',
                speaker_perspective_question: 'Do you want to look out the window?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Look',
              },
            ],
          });
        }

        if (fragment.includes('head') || fragment.includes('ache')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Express having a headache and requesting pain relief medicine',
                sentence: 'I have a headache, please give me some pain relief medicine.',
                speaker_perspective_question: 'Do you have a headache and need medicine?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Headache medicine request',
              },
              {
                intent: 'Pain',
                sentence: 'My head hurts.',
                speaker_perspective_question: 'Does your head hurt?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Pain',
              },
              {
                intent: 'Rest head',
                sentence: 'I need to rest my eyes.',
                speaker_perspective_question: 'Do you want to rest your eyes?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Rest',
              },
            ],
          });
        }

        if (fragment.includes('food') || fragment.includes('lunch') || fragment.includes('hungry')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'State that they are hungry and ask for lunch',
                sentence: 'I am hungry, is lunch ready to eat?',
                speaker_perspective_question: 'Are you hungry and ready for lunch?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Lunch hungry request',
              },
              {
                intent: 'Food now',
                sentence: 'Please bring food.',
                speaker_perspective_question: 'Do you want food now?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Food',
              },
              {
                intent: 'Snack',
                sentence: 'Can I have a small snack?',
                speaker_perspective_question: 'Do you want a snack?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Snack',
              },
            ],
          });
        }

        if (fragment.includes('light') || fragment.includes('hot')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request to draw curtains or switch off bright light',
                sentence: 'The light is too bright and hot, please switch it off or draw curtains.',
                speaker_perspective_question: 'Is the light too bright or hot?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Light / curtains request',
              },
              {
                intent: 'Curtains',
                sentence: 'Please close the curtains.',
                speaker_perspective_question: 'Should I close the curtains?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Curtains',
              },
              {
                intent: 'Warm',
                sentence: 'It is warm in here.',
                speaker_perspective_question: 'Are you feeling hot?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Warm',
              },
            ],
          });
        }

        if (fragment.includes('thank') && fragment.includes('sunita')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Express gratitude to caregiver Sunita',
                sentence: 'Thank you Sunita for taking such good care of me.',
                speaker_perspective_question: 'Are you thanking Sunita for her care?',
                confidence: 0.88,
                evidenceIds: [],
                reasoning: 'Gratitude to caregiver',
              },
              {
                intent: 'Appreciation',
                sentence: 'Thank you very much.',
                speaker_perspective_question: 'Are you saying thank you?',
                confidence: 0.08,
                evidenceIds: [],
                reasoning: 'Thanks',
              },
              {
                intent: 'Call Sunita',
                sentence: 'Can you call Sunita here?',
                speaker_perspective_question: 'Do you want Sunita to come here?',
                confidence: 0.04,
                evidenceIds: [],
                reasoning: 'Call',
              },
            ],
          });
        }

        if (fragment.includes('chair') || fragment.includes('outside')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request to sit outside on the balcony chair',
                sentence: 'I would like to sit outside on the balcony chair.',
                speaker_perspective_question: 'Would you like to sit outside on the balcony chair?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Sit outside chair request',
              },
              {
                intent: 'Sit down',
                sentence: 'I want to sit down.',
                speaker_perspective_question: 'Do you want to sit down?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Sit',
              },
              {
                intent: 'Balcony',
                sentence: 'Let us go to the balcony.',
                speaker_perspective_question: 'Do you want to go to the balcony?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Balcony',
              },
            ],
          });
        }

        if (fragment.includes('music') || fragment.includes('play')) {
          return JSON.stringify({
            hypotheses: [
              {
                intent: 'Request to play old songs on the radio',
                sentence: 'Please play some old Hindi songs on the radio.',
                speaker_perspective_question: 'Would you like to play some old songs?',
                confidence: 0.85,
                evidenceIds: [],
                reasoning: 'Music request',
              },
              {
                intent: 'Radio',
                sentence: 'Turn on the radio.',
                speaker_perspective_question: 'Should I turn on the radio?',
                confidence: 0.1,
                evidenceIds: [],
                reasoning: 'Radio',
              },
              {
                intent: 'Sound',
                sentence: 'Can we have some soft music?',
                speaker_perspective_question: 'Do you want to hear music?',
                confidence: 0.05,
                evidenceIds: [],
                reasoning: 'Music',
              },
            ],
          });
        }

        // Generic surface extraction (Ablation mode default)
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

        const frag = (input.fragment || '')
          .toLowerCase()
          .replace(/[….,?!]/g, ' ')
          .trim();
        const isEcho =
          combined.includes('literal topic') ||
          combined.includes('trying to say') ||
          combined.includes('no personal memory context');

        // Extract required keywords
        const keywords: string[] =
          Array.isArray(input.goldKeywords) && input.goldKeywords.length > 0
            ? input.goldKeywords.map((k: string) => k.toLowerCase())
            : gold
                .replace(/[.,?!]/g, '')
                .split(/\s+/)
                .filter(
                  (w: string) =>
                    w.length > 3 &&
                    !['please', 'tell', 'that', 'with', 'about', 'some', 'from', 'this', 'what'].includes(w),
                );

        const matches = keywords.filter((k: string) => {
          const parts = k.split(/\s+/);
          return parts.every((p) => combined.includes(p));
        });

        const ratio = keywords.length > 0 ? matches.length / keywords.length : 0;
        const isMatch =
          !isEcho &&
          (ratio >= 0.5 ||
            (keywords.length <= 2 && ratio >= 0.5) ||
            combined.includes(gold) ||
            gold.includes(hypInt));

        return JSON.stringify({
          match: isMatch,
          reason: isMatch
            ? `Hypothesis covers key semantics: ${matches.join(', ')}`
            : isEcho
              ? `Unresolved surface echo without personal context: ${frag}`
              : `Missing critical concepts (${keywords.filter((k) => !matches.includes(k)).join(', ')}) from gold intent: ${gold}`,
        });
      }

      default:
        return '{}';
    }
  }
}
