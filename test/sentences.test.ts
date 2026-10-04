import { describe, it, expect, beforeEach } from 'vitest';
import { buildConfirmQuestion, cleanConfirmedSentence, isQuestion } from '../src/lib/sentences';
import { resetAll, makeUser } from './helpers';
import { runLearnPipeline } from '../src/orchestrator/learnPipeline';
import { searchWordMap } from '../src/memory/wordMap';

describe('buildConfirmQuestion', () => {
  it('uses a hypothesis that is already a question as is, without doubling punctuation', () => {
    expect(buildConfirmQuestion({ sentence: 'Is Priya bringing cake on Sunday?' })).toBe(
      'Is Priya bringing cake on Sunday?',
    );
    expect(buildConfirmQuestion({ question: 'Are you asking if Priya is bringing cake??' })).toBe(
      'Are you asking if Priya is bringing cake?',
    );
    expect(buildConfirmQuestion({ question: 'Do you mean: Is Priya coming?.' })).toBe(
      'Do you mean: Is Priya coming?',
    );
  });
  it('wraps a statement exactly once', () => {
    expect(buildConfirmQuestion({ sentence: 'We should not bake a cake.' })).toBe(
      'Do you mean: We should not bake a cake?',
    );
  });
  it('detects questions without a question mark', () => {
    expect(isQuestion('Did Ramesh pay the bill')).toBe(true);
    expect(isQuestion('Please tell Priya.')).toBe(false);
  });
});

describe('cleanConfirmedSentence', () => {
  it('strips commentary labels and wrapping quotes', () => {
    expect(cleanConfirmedSentence('Please note: "Please tell Priya not to bring cake."')).toBe(
      'Please tell Priya not to bring cake.',
    );
    expect(cleanConfirmedSentence('**Confirmed sentence:** I want water.')).toBe('I want water.');
  });
  it('rejects commentary and junk', () => {
    expect(cleanConfirmedSentence('Please note that this is a guess')).toBeNull();
    expect(cleanConfirmedSentence('  ')).toBeNull();
    expect(cleanConfirmedSentence('...')).toBeNull();
  });
});

describe('LEARN stores only the cleaned confirmed sentence', () => {
  beforeEach(async () => {
    await resetAll();
  });
  it('writes the cleaned sentence to the word map', async () => {
    const user = await makeUser({ displayName: 'Mohan' });
    await runLearnPipeline({
      userId: user.id,
      fragment: 'water bill friday',
      confirmedSentence: 'Please note: Pay the water bill on Friday.',
    });
    const hit = (await searchWordMap(user.id, 'water bill friday')).find(
      (h) => h.kind === 'resolved_utterance',
    );
    expect(hit?.resolvedSentence).toBe('Pay the water bill on Friday.');
  });
  it('stores nothing when the sentence is not usable', async () => {
    const user = await makeUser({ displayName: 'Mohan' });
    await runLearnPipeline({
      userId: user.id,
      fragment: 'abc def',
      confirmedSentence: 'Please note that nothing was said',
    });
    const hits = await searchWordMap(user.id, 'abc def');
    expect(hits.find((h) => h.kind === 'resolved_utterance')).toBeUndefined();
  });
});
