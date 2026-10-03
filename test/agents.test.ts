import { describe, it, expect, beforeEach } from 'vitest';
import { runAgent } from '../src/agents/runAgent';
import {
  UtteranceClassifierOutputSchema,
  FragmentAnalystOutputSchema,
  ContextExtractorOutputSchema,
  IntentHypothesizerOutputSchema,
  ConfirmationComposerOutputSchema,
  LearnerOutputSchema,
  EvalJudgeOutputSchema,
} from '../src/agents/schemas';
import { MockLyzrClient } from '../src/adapters/lyzr/mock';
import type { LyzrChatRequest, LyzrClient } from '../src/adapters/lyzr/types';
import { main as lyzrSetupMain } from '../scripts/lyzr-setup';

describe('Phase 3 — Agents & runAgent', () => {
  let mockClient: MockLyzrClient;

  beforeEach(() => {
    mockClient = new MockLyzrClient();
  });

  it('runs utterance_classifier on a fragment and returns valid schema', async () => {
    const res = await runAgent(
      'utterance_classifier',
      UtteranceClassifierOutputSchema,
      { text: 'Sunday… Priya… cake… no', history: [], hasPendingConfirmation: false },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.kind).toBe('FRAGMENT');
    expect(res.confirmationAnswer).toBeNull();
  });

  it('runs utterance_classifier on confirmation reply and returns valid answer', async () => {
    const res = await runAgent(
      'utterance_classifier',
      UtteranceClassifierOutputSchema,
      { text: 'haan yes', history: [], hasPendingConfirmation: true },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.kind).toBe('CONFIRMATION_REPLY');
    expect(res.confirmationAnswer).toBe('yes');
  });

  it('runs fragment_analyst and extracts keywords, entities, and queries', async () => {
    const res = await runAgent(
      'fragment_analyst',
      FragmentAnalystOutputSchema,
      { text: 'Sunday Priya cake no' },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.keywords).toContain('priya');
    expect(res.entities.some((e) => e.text === 'Priya')).toBe(true);
    expect(res.negation).toBe(true);
    expect(res.retrievalQueries.length).toBeGreaterThan(0);
  });

  it('runs context_extractor and extracts structured facts', async () => {
    const res = await runAgent(
      'context_extractor',
      ContextExtractorOutputSchema,
      {
        segments: [
          { speaker: 'Ramesh', text: 'Priya is visiting us on Sunday.' },
          { speaker: 'Sunita', text: 'Remember Dr. Mehta said Papa should avoid sugar.' },
        ],
        knownPeople: ['Priya', 'Ramesh'],
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.facts.length).toBeGreaterThanOrEqual(2);
    expect(res.facts.some((f) => f.type === 'event' && f.entities.includes('Priya'))).toBe(true);
    expect(res.facts.some((f) => f.type === 'health_instruction')).toBe(true);
  });

  it('runs intent_hypothesizer with memory facts (context ON) and cites evidence', async () => {
    const res = await runAgent(
      'intent_hypothesizer',
      IntentHypothesizerOutputSchema,
      {
        fragment: 'Sunday Priya cake no',
        analyst: { keywords: ['sunday', 'priya', 'cake', 'no'], negation: true },
        memoryFacts: [
          { id: 'fact_priya', text: 'Priya is visiting on Sunday', type: 'event', score: 0.92 },
          { id: 'fact_sugar', text: 'Papa should avoid sugar', type: 'health_instruction', score: 0.88 },
        ],
        wordMapHits: [],
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.hypotheses).toHaveLength(3);
    const top = res.hypotheses[0];
    expect(top.intent).toContain('Priya');
    expect(top.evidenceIds).toContain('fact_priya');
    expect(top.confidence).toBeGreaterThan(0.5);
  });

  it('runs intent_hypothesizer without memory facts (context OFF / ablation)', async () => {
    const res = await runAgent(
      'intent_hypothesizer',
      IntentHypothesizerOutputSchema,
      {
        fragment: 'Sunday Priya cake no',
        analyst: { keywords: ['sunday', 'priya', 'cake', 'no'], negation: true },
        memoryFacts: [],
        wordMapHits: [],
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.hypotheses).toHaveLength(3);
    expect(res.hypotheses[0].evidenceIds).toHaveLength(0);
    expect(res.hypotheses[0].confidence).toBeLessThan(0.6);
  });

  it('runs confirmation_composer and formats concise questions', async () => {
    const res = await runAgent(
      'confirmation_composer',
      ConfirmationComposerOutputSchema,
      {
        hypothesis: {
          intent: 'Tell Priya not to bring cake on Sunday',
          sentence: 'Please tell Priya not to bring cake on Sunday.',
          speaker_perspective_question: "Do you mean Priya shouldn't bring cake on Sunday?",
        },
        attemptNumber: 1,
        patientName: 'Mohan',
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.question).toBe("Do you mean Priya shouldn't bring cake on Sunday?");
    expect(res.finalSentence).toBe('Please tell Priya not to bring cake on Sunday.');
  });

  it('runs learner and detects learned substitutions', async () => {
    const res = await runAgent(
      'learner',
      LearnerOutputSchema,
      {
        fragment: 'car park six',
        confirmedSentence: 'Time for evening walk in the park at six.',
        rejectedHypotheses: [],
        analyst: {},
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.substitutions.some((s) => s.said === 'car' && s.meant === 'walk')).toBe(true);
  });

  it('runs eval_judge to evaluate hypothesis match', async () => {
    const res = await runAgent(
      'eval_judge',
      EvalJudgeOutputSchema,
      {
        fragment: 'Sunday Priya cake no',
        hypothesisSentence: 'Please tell Priya not to bring cake on Sunday.',
        hypothesisIntent: 'Tell Priya not to bring cake on Sunday',
        goldIntent: 'Priya should not bring cake on Sunday due to sugar restrictions',
        goldKeywords: ['Priya', 'cake', 'Sunday'],
      },
      { userId: 'u_1' },
      mockClient,
    );

    expect(res.match).toBe(true);
  });

  it('recovers via repair-retry when model initially returns invalid JSON or markdown', async () => {
    let callCount = 0;
    const flakeyClient: LyzrClient = {
      agentId: () => undefined,
      async chat(_req: LyzrChatRequest): Promise<string> {
        callCount++;
        if (callCount === 1) {
          return 'Here is the result:\n```json\n{ invalid_json: true, \n```';
        }
        return JSON.stringify({
          kind: 'FRAGMENT',
          confirmationAnswer: null,
          reason: 'Repaired successfully',
        });
      },
    };

    const res = await runAgent(
      'utterance_classifier',
      UtteranceClassifierOutputSchema,
      { text: 'fragment' },
      { userId: 'u_1' },
      flakeyClient,
    );

    expect(callCount).toBe(2);
    expect(res.kind).toBe('FRAGMENT');
  });

  it('runs scripts/lyzr-setup.ts cleanly', async () => {
    await expect(lyzrSetupMain()).resolves.not.toThrow();
  });
});
