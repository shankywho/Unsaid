-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT');

-- CreateEnum
CREATE TYPE "AssistMode" AS ENUM ('AUTO', 'ON', 'OFF');

-- CreateEnum
CREATE TYPE "SegmentSource" AS ENUM ('OMI_REALTIME', 'OMI_MEMORY', 'SIMULATED');

-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('UNCLASSIFIED', 'AMBIENT', 'FRAGMENT', 'FLUENT', 'CONFIRMATION_REPLY', 'NOISE');

-- CreateEnum
CREATE TYPE "PipelineKind" AS ENUM ('ASSIST', 'INGEST', 'LEARN');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'AWAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED_ALL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WordMapKind" AS ENUM ('SUBSTITUTION', 'PHRASE', 'NAME_ALIAS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "omiUid" TEXT,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "contextEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assistMode" "AssistMode" NOT NULL DEFAULT 'AUTO',
    "caregiverName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "speaker" TEXT,
    "isUser" BOOLEAN NOT NULL,
    "startSec" DOUBLE PRECISION,
    "endSec" DOUBLE PRECISION,
    "source" "SegmentSource" NOT NULL,
    "kind" "SegmentKind" NOT NULL DEFAULT 'UNCLASSIFIED',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipeline" "PipelineKind" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "contextUsed" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "agentId" TEXT,
    "status" "StepStatus" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "retrieval" JSONB,
    "latencyMs" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fragment" TEXT NOT NULL,
    "hypotheses" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "questionAudio" TEXT,
    "status" "ConfirmationStatus" NOT NULL,
    "confirmedIdx" INTEGER,
    "finalSentence" TEXT,
    "finalAudio" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordMapEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saidToken" TEXT NOT NULL,
    "meantToken" TEXT NOT NULL,
    "kind" "WordMapKind" NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qdrantId" TEXT NOT NULL,

    CONSTRAINT "WordMapEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawWebhook" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "parsedOk" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_omiUid_key" ON "User"("omiUid");

-- CreateIndex
CREATE INDEX "TranscriptSegment_userId_createdAt_idx" ON "TranscriptSegment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_userId_dedupeKey_key" ON "TranscriptSegment"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Run_userId_startedAt_idx" ON "Run"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Step_runId_idx" ON "Step"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Confirmation_runId_key" ON "Confirmation"("runId");

-- CreateIndex
CREATE INDEX "Confirmation_userId_status_idx" ON "Confirmation"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WordMapEntry_userId_saidToken_meantToken_key" ON "WordMapEntry"("userId", "saidToken", "meantToken");

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordMapEntry" ADD CONSTRAINT "WordMapEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
