import { prisma } from '../db';
import { redis } from '../redis';
import { env } from '../config/env';
import { adapters } from '../adapters';
import { bus } from '../tracing/events';
import { logger } from '../lib/logger';
import { runAgent } from '../agents/runAgent';
import { ConfirmationComposerOutputSchema, type HypothesisItem } from '../agents/schemas';
import { enqueueLearnJob } from '../queues/learnQueue';

export const pendingKey = (userId: string): string => `confirm:pending:${userId}`;

export async function getPendingConfirmation(userId: string) {
  const id = await redis.get(pendingKey(userId));
  if (!id) return null;
  const conf = await prisma.confirmation.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!conf || conf.status !== 'PENDING') {
    await redis.del(pendingKey(userId));
    return null;
  }
  return conf;
}

export async function createPendingConfirmation(params: {
  userId: string;
  runId: string;
  fragment: string;
  hypotheses: HypothesisItem[];
  question: string;
  questionAudio?: string | null;
}) {
  const { userId, runId, fragment, hypotheses, question, questionAudio } = params;

  // Check if existing pending confirmation needs to be superseded
  const existingPending = await getPendingConfirmation(userId);
  if (existingPending) {
    await expireConfirmation(existingPending.id, 'superseded');
  }

  const confirmation = await prisma.confirmation.create({
    data: {
      userId,
      runId,
      fragment,
      hypotheses: hypotheses as any,
      currentIndex: 0,
      question,
      questionAudio: questionAudio ?? null,
      status: 'PENDING',
    },
    include: { user: true },
  });

  // Store pending pointer in Redis with TTL
  await redis.set(pendingKey(userId), confirmation.id, 'EX', env.CONFIRMATION_TIMEOUT_SEC);

  // Update Run status
  await prisma.run.update({
    where: { id: runId },
    data: { status: 'AWAITING_CONFIRMATION' },
  });

  bus.publish(
    'confirmation.asked',
    userId,
    {
      confirmationId: confirmation.id,
      question,
      questionAudio,
      audioUrl: questionAudio ? `/v1/audio/${questionAudio}` : undefined,
      currentIndex: 0,
      hypothesesCount: hypotheses.length,
    },
    runId,
  );

  // Notify Omi wearable if configured
  await adapters()
    .omi.notify(userId, question)
    .catch(() => {});

  return confirmation;
}

export async function answerConfirmation(confirmationId: string, answer: 'yes' | 'no') {
  const conf = await prisma.confirmation.findUnique({
    where: { id: confirmationId },
    include: { user: true },
  });

  if (!conf) throw new Error(`Confirmation ${confirmationId} not found`);
  if (conf.status !== 'PENDING') {
    return { confirmation: conf, resolved: conf.status === 'CONFIRMED' };
  }

  const hypotheses = (conf.hypotheses as unknown as HypothesisItem[]) || [];
  bus.publish('confirmation.answered', conf.userId, { confirmationId, answer }, conf.runId);

  if (answer === 'yes') {
    const confirmedIdx = conf.currentIndex;
    const currentHyp = hypotheses[confirmedIdx] || hypotheses[0];
    const finalSentence = currentHyp?.sentence || conf.question;

    let finalAudio: string | undefined;
    try {
      const ttsRes = await adapters().tts.synthesize(finalSentence);
      finalAudio = ttsRes.id;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to synthesize final speech audio');
    }

    const updated = await prisma.confirmation.update({
      where: { id: confirmationId },
      data: {
        status: 'CONFIRMED',
        confirmedIdx,
        finalSentence,
        finalAudio: finalAudio ?? null,
        resolvedAt: new Date(),
      },
    });

    await redis.del(pendingKey(conf.userId));

    await prisma.run.update({
      where: { id: conf.runId },
      data: {
        status: 'SUCCEEDED',
        endedAt: new Date(),
        output: { finalSentence, confirmedIdx },
      },
    });

    bus.publish(
      'assist.resolved',
      conf.userId,
      {
        confirmationId,
        finalSentence,
        finalAudio,
        audioUrl: finalAudio ? `/v1/audio/${finalAudio}` : undefined,
      },
      conf.runId,
    );

    // Enqueue learning
    await enqueueLearnJob({
      userId: conf.userId,
      fragment: conf.fragment,
      confirmedSentence: finalSentence,
      rejectedHypotheses: hypotheses.slice(0, confirmedIdx).map((h) => h.sentence),
      runId: conf.runId,
    });

    return { confirmation: updated, resolved: true, finalAudio, finalSentence };
  }

  // Answer is NO: move to next hypothesis or reject all
  const nextIdx = conf.currentIndex + 1;

  if (nextIdx < hypotheses.length) {
    const nextHyp = hypotheses[nextIdx];
    let nextQuestion = nextHyp.speaker_perspective_question;
    try {
      const composed = await runAgent(
        'confirmation_composer',
        ConfirmationComposerOutputSchema,
        {
          hypothesis: nextHyp,
          attemptNumber: nextIdx + 1,
          patientName: conf.user.displayName,
        },
        { userId: conf.userId, runId: conf.runId, node: 'confirmation_composer' },
      );
      nextQuestion = composed.question;
    } catch {
      // Keep nextHyp.speaker_perspective_question
    }

    let nextAudio: string | undefined;
    try {
      const ttsRes = await adapters().tts.synthesize(nextQuestion);
      nextAudio = ttsRes.id;
    } catch {
      // Best-effort TTS audio synthesis
    }

    const updated = await prisma.confirmation.update({
      where: { id: confirmationId },
      data: {
        currentIndex: nextIdx,
        question: nextQuestion,
        questionAudio: nextAudio ?? null,
      },
    });

    // Reset TTL in Redis
    await redis.set(pendingKey(conf.userId), confirmationId, 'EX', env.CONFIRMATION_TIMEOUT_SEC);

    bus.publish(
      'confirmation.asked',
      conf.userId,
      {
        confirmationId,
        question: nextQuestion,
        questionAudio: nextAudio,
        audioUrl: nextAudio ? `/v1/audio/${nextAudio}` : undefined,
        currentIndex: nextIdx,
        hypothesesCount: hypotheses.length,
      },
      conf.runId,
    );

    return { confirmation: updated, resolved: false, nextQuestion };
  }

  // All hypotheses rejected
  const updated = await prisma.confirmation.update({
    where: { id: confirmationId },
    data: {
      status: 'REJECTED_ALL',
      resolvedAt: new Date(),
    },
  });

  await redis.del(pendingKey(conf.userId));

  await prisma.run.update({
    where: { id: conf.runId },
    data: {
      status: 'FAILED',
      endedAt: new Date(),
      output: { rejectedAll: true },
    },
  });

  const fallbackQuestion = 'Is this about a person, a place, or something you need?';
  bus.publish(
    'assist.unresolved',
    conf.userId,
    {
      confirmationId,
      fallbackQuestion,
    },
    conf.runId,
  );

  return { confirmation: updated, resolved: false, fallbackQuestion };
}

export async function expireConfirmation(confirmationId: string, reason = 'timeout') {
  const conf = await prisma.confirmation.findUnique({ where: { id: confirmationId } });
  if (!conf || conf.status !== 'PENDING') return;

  await prisma.confirmation.update({
    where: { id: confirmationId },
    data: {
      status: 'EXPIRED',
      resolution: reason,
      resolvedAt: new Date(),
    },
  });

  await redis.del(pendingKey(conf.userId));

  await prisma.run.update({
    where: { id: conf.runId },
    data: {
      status: 'FAILED',
      endedAt: new Date(),
      output: { expired: true, reason },
    },
  });

  bus.publish('confirmation.expired', conf.userId, { confirmationId, reason }, conf.runId);
}
