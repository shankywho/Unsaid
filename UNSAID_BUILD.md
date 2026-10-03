# UNSAID — Backend Build Spec (for Claude Code)

> **You are Claude Code. Build this entire backend autonomously, phase by phase, without stopping to ask questions.** When something is ambiguous, pick the most reasonable option, write the decision into `DECISIONS.md`, and keep going. Commit after every phase. Run tests after every phase. Never leave the repo in a broken state.

---

## 0. Context

**Hackathon:** "Stop prompting. Code solo agents" — Lyzr × Qdrant × Omi (AI House / HiDevs). Solo entry. Deadline **Oct 13, 2026, 11:59 PM IST**.
**Track:** Accessibility & Adaptive Assistants.
**Judging:** 60%+ of score = working software, clean repo, **observable agentic workflows**. Mandatory: real-time voice input → vector retrieval → orchestrated agent reasoning in one unified loop.
**Submission:** public GitHub repo, setup instructions, **architecture diagram in README.md**, ≤5 min demo video.

### Product

**Unsaid — finishing the sentences aphasia takes away.**
A personal AI that understands the fragmented speech of stroke survivors with aphasia by remembering their life well enough to know what they meant.

- **Omi** (wearable) captures the patient's ambient world (people, events, routines) and, in assist mode, their fragmented utterances.
- **Qdrant** stores a personal context memory + the patient's personal "word map" (learned substitutions and resolved fragments).
- **Lyzr** agents reconstruct intent: fragment → retrieve context → top-3 hypotheses → yes/no confirmation → speak the full sentence → learn from the result.

Example:
- Ambient memory: "Priya is visiting on Sunday", "Doctor said Papa should avoid sugar".
- Patient says: *"Sunday… Priya… cake… no."*
- Unsaid asks: *"Do you mean Priya shouldn't bring cake on Sunday?"* → patient: "yes"
- Unsaid speaks to caregiver: *"Please tell Priya not to bring cake on Sunday."*
- Word map learns the pattern.

**Positioning:** communication aid. Never diagnosis or treatment. No medical claims anywhere in code, README, or API copy.

### The money-shot metric
The backend must support an **ablation**: the same fragment resolved with **context ON vs context OFF**. Build an eval script that reports top-1 / top-3 accuracy for both. This is the core proof in the demo video.

---

## 1. Tech stack (non-negotiable unless broken)

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+, TypeScript (strict) |
| HTTP | Express 4 + `zod` validation |
| Relational DB | PostgreSQL 16 + Prisma ORM |
| Vector DB | Qdrant (Docker locally, Qdrant Cloud in prod) via `@qdrant/js-client-rest` |
| Queue | Redis 7 + BullMQ |
| Agents | **Lyzr Agent API** (all reasoning goes through Lyzr) |
| Embeddings | Adapter. Default: OpenAI `text-embedding-3-small` (1536 dims) |
| TTS | Adapter. Default: OpenAI TTS (`gpt-4o-mini-tts` or `tts-1`), save mp3 to `./storage/audio` |
| Realtime to clients | Server-Sent Events (SSE) |
| Logging | `pino` |
| Tests | `vitest` + `supertest` |
| Infra | `docker-compose.yml` with postgres, redis, qdrant |

Package manager: `pnpm`. Lint: `eslint` + `prettier`. Scripts: `dev`, `build`, `start`, `test`, `seed`, `eval`, `lyzr:setup`, `db:migrate`.

---

## 2. Phase 0 — Verify integration contracts FIRST

External API shapes below are **best-known guesses**. Before writing adapters:

1. Check `docs.lyzr.ai`, `docs.omi.me`, `qdrant.tech/documentation`, and the HiDevs starter kit if a path/URL is provided in `.env` or the repo.
2. Every external service sits behind an **adapter interface** (`src/adapters/*`). If a contract is wrong, only the adapter changes.
3. Every adapter has a **mock implementation** used in tests and when `MOCK_EXTERNALS=true`. The whole pipeline must run end-to-end with mocks and zero API keys.
4. Record verified (or still-assumed) contracts in `DECISIONS.md`.

### 2.1 Omi (assumed contract — verify)
Omi developer apps can register webhooks:
- **Real-time transcript processor**: `POST {OUR_URL}/webhooks/omi/transcript?uid=<omi_user_id>` with body roughly:
  ```json
  { "session_id": "abc", "segments": [
    { "text": "...", "speaker": "SPEAKER_00", "speaker_id": 0, "is_user": true, "start": 12.3, "end": 14.1 }
  ]}
  ```
- **Memory/conversation created trigger**: `POST {OUR_URL}/webhooks/omi/memory?uid=<id>` with a full conversation object (transcript_segments, structured summary, created_at…).
- Optional **notification to user**: Omi integration notification endpoint authenticated with app secret. Implement behind `OmiNotifier` adapter; no-op if not configured.

Parse webhooks with **tolerant zod schemas** (`.passthrough()`, optional fields). Never 500 on an unexpected payload: log it, store raw payload in `RawWebhook` table, return 200.

### 2.2 Lyzr (assumed contract — verify)
- Inference: `POST ${LYZR_INFERENCE_URL}` (default `https://agent-prod.studio.lyzr.ai/v3/inference/chat/`), header `x-api-key: ${LYZR_API_KEY}`, body:
  ```json
  { "user_id": "...", "agent_id": "...", "session_id": "...", "message": "..." }
  ```
  Response contains the agent's text reply (likely `response` field — make the parser look for `response`, `message`, `output` in that order).
- Agents: try to create via Lyzr agent-creation API in `scripts/lyzr-setup.ts`. **If API creation fails**, the script prints each agent's name + system prompt + recommended settings so the human can create them in Lyzr Studio, then paste IDs into `.env`.
- Each agent must return **JSON only**. Parse with zod. On parse failure: one retry with a "Return valid JSON only matching this schema: …" repair message. On second failure: mark node failed, trace it, degrade gracefully.

### 2.3 Qdrant
Use the official JS REST client. Create collections and payload indexes on boot (idempotent).

---

## 3. Repo structure

```
unsaid/
├─ README.md                  # judge-facing, with mermaid architecture diagram
├─ DECISIONS.md               # every assumption + why
├─ docker-compose.yml
├─ .env.example
├─ prisma/schema.prisma
├─ scripts/
│  ├─ lyzr-setup.ts           # create/print Lyzr agents
│  ├─ seed.ts                 # demo persona + 7 days of ambient transcripts
│  ├─ eval.ts                 # ablation: context ON vs OFF
│  └─ replay-omi.ts           # replays a JSON file as Omi webhooks (for demo video)
├─ fixtures/
│  ├─ persona-ramesh-family.json
│  ├─ ambient-week.json
│  └─ fragments-eval.json     # 30+ fragments with gold intents
├─ src/
│  ├─ index.ts                # boot: env → db → qdrant init → queues → http
│  ├─ config/env.ts           # zod-validated env
│  ├─ http/
│  │  ├─ app.ts
│  │  ├─ middleware/ (error, requestId, auth)
│  │  └─ routes/ (webhooks, users, simulate, confirmations, runs, memory, stream, audio, health)
│  ├─ adapters/
│  │  ├─ lyzr/ (LyzrClient interface, http impl, mock impl)
│  │  ├─ embeddings/ (interface, openai, mock deterministic hash-embedding)
│  │  ├─ tts/ (interface, openai, mock writes silent mp3)
│  │  ├─ omi/ (webhook schemas, notifier, mock)
│  │  └─ qdrant/ (client wrapper, collection bootstrap)
│  ├─ agents/
│  │  ├─ prompts/            # one .md per agent system prompt (source of truth)
│  │  ├─ schemas.ts          # zod output schema per agent
│  │  └─ runAgent.ts         # call Lyzr → parse → repair-retry → trace
│  ├─ orchestrator/
│  │  ├─ dag.ts              # tiny typed DAG runner (nodes, deps, parallel where possible)
│  │  ├─ assistPipeline.ts   # fragment → hypotheses → confirm
│  │  ├─ ingestPipeline.ts   # ambient → facts → memory
│  │  └─ learnPipeline.ts    # confirmation → word map update
│  ├─ memory/
│  │  ├─ memoryStore.ts      # upsert w/ dedup, search w/ filters, recency rerank
│  │  └─ wordMap.ts
│  ├─ confirmations/         # pending state machine (Redis + Postgres)
│  ├─ tracing/               # Run + Step persistence + SSE event bus
│  ├─ queues/                # BullMQ queues + workers
│  └─ lib/ (logger, errors, ids, time)
└─ test/ (unit + integration, all with MOCK_EXTERNALS=true)
```

---

## 4. Environment

`.env.example`:
```
NODE_ENV=development
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
API_KEY=dev-key                      # simple bearer for /v1/* routes
MOCK_EXTERNALS=false

DATABASE_URL=postgresql://unsaid:unsaid@localhost:5432/unsaid
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

LYZR_API_KEY=
LYZR_INFERENCE_URL=https://agent-prod.studio.lyzr.ai/v3/inference/chat/
LYZR_AGENT_FRAGMENT_ID=
LYZR_AGENT_CONTEXT_EXTRACTOR_ID=
LYZR_AGENT_HYPOTHESIS_ID=
LYZR_AGENT_CONFIRM_ID=
LYZR_AGENT_LEARNER_ID=
LYZR_AGENT_UTTERANCE_CLASSIFIER_ID=

OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
TTS_MODEL=tts-1
TTS_VOICE=alloy

OMI_APP_ID=
OMI_APP_SECRET=
OMI_WEBHOOK_SECRET=                  # optional shared secret query param

CONFIRMATION_TIMEOUT_SEC=45
RAW_TRANSCRIPT_RETENTION_DAYS=14
```

Webhook routes are **not** behind `API_KEY` (Omi calls them) but accept optional `?secret=` matching `OMI_WEBHOOK_SECRET`.

---

## 5. Data model

### 5.1 Postgres (Prisma)

```prisma
model User {
  id              String   @id @default(cuid())
  omiUid          String?  @unique
  displayName     String
  role            UserRole @default(PATIENT)
  contextEnabled  Boolean  @default(true)   // ablation + privacy toggle
  assistMode      AssistMode @default(AUTO) // AUTO | ON | OFF
  caregiverName   String?
  createdAt       DateTime @default(now())
  segments        TranscriptSegment[]
  runs            Run[]
  confirmations   Confirmation[]
  wordMapEntries  WordMapEntry[]
}
enum UserRole { PATIENT }
enum AssistMode { AUTO ON OFF }

model TranscriptSegment {
  id         String   @id @default(cuid())
  userId     String
  sessionId  String
  text       String
  speaker    String?
  isUser     Boolean
  startSec   Float?
  endSec     Float?
  source     SegmentSource   // OMI_REALTIME | OMI_MEMORY | SIMULATED
  kind       SegmentKind @default(UNCLASSIFIED) // AMBIENT | FRAGMENT | FLUENT | CONFIRMATION_REPLY
  createdAt  DateTime @default(now())
  user       User @relation(fields:[userId], references:[id])
  @@index([userId, createdAt])
}

model Run {                        // one pipeline execution = one trace
  id          String   @id @default(cuid())
  userId      String
  pipeline    PipelineKind         // ASSIST | INGEST | LEARN
  status      RunStatus            // RUNNING | AWAITING_CONFIRMATION | SUCCEEDED | FAILED
  input       Json
  output      Json?
  contextUsed Boolean
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  steps       Step[]
  user        User @relation(fields:[userId], references:[id])
}

model Step {                       // one DAG node execution
  id         String   @id @default(cuid())
  runId      String
  node       String                // e.g. "classify", "fragment", "retrieve", "hypothesize"
  agentId    String?               // Lyzr agent id if agent node
  status     StepStatus
  input      Json
  output     Json?
  error      String?
  retrieval  Json?                 // qdrant hits: [{id, score, type, text}]
  latencyMs  Int?
  attempt    Int @default(1)
  startedAt  DateTime @default(now())
  endedAt    DateTime?
  run        Run @relation(fields:[runId], references:[id])
  @@index([runId])
}

model Confirmation {
  id            String   @id @default(cuid())
  userId        String
  runId         String   @unique
  fragment      String
  hypotheses    Json                 // ranked [{intent, sentence, confidence, evidenceIds}]
  currentIndex  Int @default(0)      // which hypothesis is being asked
  question      String
  questionAudio String?              // audio id
  status        ConfirmationStatus   // PENDING | CONFIRMED | REJECTED_ALL | EXPIRED
  confirmedIdx  Int?
  finalSentence String?
  finalAudio    String?
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?
  user          User @relation(fields:[userId], references:[id])
}

model WordMapEntry {               // mirror of qdrant word-map points for listing/UI
  id          String @id @default(cuid())
  userId      String
  saidToken   String               // what patient said, e.g. "car"
  meantToken  String               // what they meant, e.g. "bus"
  kind        WordMapKind          // SUBSTITUTION | PHRASE | NAME_ALIAS
  hits        Int @default(1)
  lastSeenAt  DateTime @default(now())
  qdrantId    String
  user        User @relation(fields:[userId], references:[id])
  @@unique([userId, saidToken, meantToken])
}

model RawWebhook {
  id         String @id @default(cuid())
  route      String
  query      Json
  body       Json
  parsedOk   Boolean
  createdAt  DateTime @default(now())
}
```

(Fill in the obvious enums.)

### 5.2 Qdrant collections

**`unsaid_memory`** — personal context facts.
- Vector: dense, `EMBEDDING_DIM`, cosine.
- Payload:
  ```ts
  {
    userId: string,
    type: "person" | "relationship" | "event" | "routine" | "preference" | "place" | "object" | "health_instruction",
    text: string,              // canonical fact sentence, e.g. "Priya (daughter) is visiting on Sunday"
    entities: string[],        // ["Priya", "Sunday"]
    aliases: string[],         // ["beti", "Pri"]
    eventTime?: string,        // ISO, if the fact refers to a time
    validUntil?: string,       // ISO, facts like "visiting Sunday" expire
    sourceSegmentIds: string[],
    speaker?: string,
    confidence: number,        // 0..1 from extractor
    createdAt: string,
    updatedAt: string,
    mentions: number
  }
  ```
- Payload indexes: `userId` (keyword), `type` (keyword), `entities` (keyword), `createdAt` (datetime), `validUntil` (datetime).

**`unsaid_wordmap`** — patient-specific language patterns.
- Vector: dense, same dim, cosine (embed the *fragment*).
- Payload:
  ```ts
  {
    userId: string,
    kind: "resolved_utterance" | "substitution" | "name_alias",
    fragment: string,          // "sunday priya cake no"
    resolvedSentence?: string, // "Priya shouldn't bring cake on Sunday"
    said?: string, meant?: string,
    hits: number,
    lastSeenAt: string
  }
  ```
- Payload indexes: `userId`, `kind`.

**Every Qdrant query MUST filter by `userId`.** Write a unit test that asserts the filter is always present (multi-tenant safety).

### 5.3 Memory rules
- **Dedup on upsert:** search same `userId` + `type`, top-1; if score ≥ 0.92 → merge (union entities/aliases/sourceSegmentIds, increment `mentions`, update `updatedAt`, keep higher confidence). Else insert.
- **Retrieval:** for each fragment keyword + the full fragment, run filtered searches (limit 8), union, then **rerank**: `final = 0.7*semantic + 0.2*recency + 0.1*log(1+mentions)` where recency decays with a 7-day half-life. Drop expired (`validUntil < now`). Return top 10 with scores — these scores go into the trace.
- When `user.contextEnabled === false`: skip memory retrieval AND word-map retrieval (ablation mode). Trace node shows `skipped: context disabled`.

---

## 6. Agents (Lyzr) — prompts are the product

Store each prompt in `src/agents/prompts/<name>.md`. `lyzr-setup.ts` reads these files. Every agent: temperature low (0.2, hypothesis 0.5), JSON-only output.

### 6.1 `utterance_classifier`
Purpose: decide what a patient (`is_user=true`) segment is.
Input: segment text + last 3 segments + whether a confirmation is pending.
Output:
```json
{ "kind": "FRAGMENT" | "FLUENT" | "CONFIRMATION_REPLY" | "NOISE",
  "confirmationAnswer": "yes" | "no" | null,
  "reason": "short" }
```
Prompt guidance: Aphasic speech markers = telegraphic (content words only, missing function words), long pauses/ellipses, word-finding failures ("the… the thing"), semantic substitutions, perseveration. If a confirmation is pending, treat yes-like replies ("haan", "yes", "ha", "hmm yes", "yeah", head-nod transcribed as "mm-hm") as yes and no-like ("nahi", "no", "na") as no. Be multilingual-tolerant (English + Hindi in Latin script).

**Pre-filter in code** before calling the agent: if confirmation pending and text matches a yes/no regex list → classify locally, skip agent (latency). Trace it as `classify(local)`.

### 6.2 `fragment_analyst`
Input: fragment text.
Output:
```json
{ "keywords": ["Sunday","Priya","cake","no"],
  "entities": [{"text":"Priya","type":"person"},{"text":"Sunday","type":"time"}],
  "speechActGuess": "request" | "question" | "statement" | "refusal" | "need" | "emotion",
  "negation": true,
  "possibleSubstitutions": [{"said":"car","maybe":["bus","auto"]}],
  "retrievalQueries": ["Priya visiting Sunday", "cake sugar restriction"] }
```
Prompt: you analyze fragmented speech from adults with aphasia. Extract what's there; do NOT guess full meaning yet. Generate 2–4 retrieval queries that would find relevant personal context.

### 6.3 `context_extractor` (ingest pipeline)
Input: a window of ambient transcript segments (with speakers) + list of known people/aliases for the user.
Output:
```json
{ "facts": [
  { "type":"event", "text":"Priya (daughter) is visiting on Sunday",
    "entities":["Priya","Sunday"], "aliases":["beti"],
    "eventTime":"2026-10-11", "validUntil":"2026-10-12T23:59:00+05:30",
    "confidence":0.86 } ] }
```
Prompt: extract durable, useful facts about the patient's life that would help someone understand what the patient means later: people + relationships, upcoming events, routines, preferences, objects they use, caregiver instructions. Ignore small talk. Resolve relative dates using the provided `now` and timezone. Max 8 facts per window. If nothing useful, return `{"facts":[]}`.

### 6.4 `intent_hypothesizer` (the core)
Input: fragment, fragment_analyst output, retrieved memory facts (with ids + scores), retrieved word-map entries, current time.
Output:
```json
{ "hypotheses": [
  { "intent": "Tell Priya not to bring cake on Sunday",
    "sentence": "Please tell Priya not to bring cake on Sunday.",
    "speaker_perspective_question": "Do you mean Priya shouldn't bring cake on Sunday?",
    "confidence": 0.78,
    "evidenceIds": ["mem_123","mem_456"],
    "reasoning": "Priya visiting Sunday + sugar restriction + 'no'" } ] }
```
Rules in prompt: exactly 3 hypotheses, ranked, diverse (not paraphrases of each other). Every hypothesis must be explainable by the fragment's words; evidence must cite provided memory ids only (never invent ids). Use word-map substitutions when present. Prefer the patient's likely needs (comfort, people, plans, health instructions). Questions must be answerable with yes/no and use simple words. Confidences sum ≤ 1.

**Code-side validation:** drop any `evidenceIds` not in the retrieved set; if fewer than 3 hypotheses returned, keep what's valid; if 0 → fallback to a category question ("Is this about a person, a place, or something you need?").

### 6.5 `confirmation_composer`
Input: hypothesis + attempt number + patient name.
Output: `{ "question": "...", "finalSentence": "..." }` — short, warm, ≤ 14 words for the question. Used when moving to hypothesis #2/#3 so phrasing stays natural ("Okay. Is it about…?").
(Allowed to skip the agent call when hypothesis already has a good question — but call it at least for re-asks so the trace shows it.)

### 6.6 `learner`
Input: fragment, confirmed sentence, rejected hypotheses, fragment_analyst output.
Output:
```json
{ "substitutions": [{"said":"car","meant":"bus"}],
  "nameAliases": [{"said":"Pri","meant":"Priya"}],
  "summary": "Patient uses 'car' for 'bus'." }
```
Only output substitutions clearly supported by the confirmed sentence.

---

## 7. Pipelines (DAG orchestration)

Implement a small typed DAG runner: nodes declare deps; independent nodes run in parallel; each node execution creates a `Step`, emits SSE events (`step.started`, `step.completed`, `step.failed`), records latency. Node failures → mark step failed; pipeline decides degrade vs fail.

### 7.1 INGEST (ambient → memory) — async via BullMQ
Trigger: Omi transcript webhook segments that are **not** from the patient (or patient FLUENT speech), plus Omi memory-created webhook.
1. Buffer segments per `userId+sessionId` in Redis; flush a window when ≥ 6 segments or 30s idle (BullMQ delayed job with dedupe jobId).
2. Nodes: `load_known_people` → `extract_facts` (Lyzr context_extractor) → `embed` → `upsert_memory` (with dedup).
3. Emit `memory.upserted` SSE per fact.

### 7.2 ASSIST (fragment → confirmation) — synchronous-ish, target p50 < 4s
Trigger: patient segment classified `FRAGMENT` (and assistMode ≠ OFF; if ON, treat every patient segment as fragment unless it's a confirmation reply).
```
classify ──► fragment_analyze ──► ┬─ retrieve_memory ──┐
                                  └─ retrieve_wordmap ─┴─► hypothesize ──► compose_question ──► tts_question ──► await_confirmation
```
- `retrieve_*` nodes run in parallel, store hits in `Step.retrieval`.
- After `tts_question`: create `Confirmation` (PENDING), set Run status `AWAITING_CONFIRMATION`, store pending pointer in Redis `confirm:pending:{userId}` with TTL = `CONFIRMATION_TIMEOUT_SEC`. Emit `confirmation.asked` with question text + audio URL. Call `OmiNotifier` (no-op if unconfigured).

### 7.3 Confirmation state machine
Answers arrive via (a) next patient Omi segment classified CONFIRMATION_REPLY, or (b) `POST /v1/confirmations/:id/answer` (caregiver console button).
- **yes** → status CONFIRMED, `finalSentence` from hypothesis, TTS it, emit `assist.resolved` with audio, run status SUCCEEDED, enqueue LEARN.
- **no** → `currentIndex++`; if < hypotheses.length → compose next question (confirmation_composer), TTS, emit `confirmation.asked`, reset TTL. Else → REJECTED_ALL, emit `assist.unresolved` with fallback category question, enqueue LEARN with negatives only.
- TTL expiry → EXPIRED (BullMQ delayed job checks status), emit `confirmation.expired`.
- Only one PENDING confirmation per user at a time; a new fragment while pending supersedes it (mark EXPIRED, reason "superseded").

### 7.4 LEARN (async)
Nodes: `learner` (Lyzr) → `upsert_wordmap` (resolved_utterance point + substitution points; dedup by `said+meant`, increment `hits`) → mirror to `WordMapEntry`. Emit `wordmap.updated`.
Effect to demonstrate: same/similar fragment later → `retrieve_wordmap` returns the resolved_utterance with high score → hypothesizer ranks it #1. **Write an integration test proving the 2nd identical fragment gets the confirmed intent as hypothesis #1 (with mock Lyzr that respects word-map input).**

---

## 8. HTTP API

All `/v1/*` require `Authorization: Bearer ${API_KEY}`. JSON errors: `{ error: { code, message, requestId } }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | db, redis, qdrant, lyzr-config status |
| POST | `/webhooks/omi/transcript?uid=&secret=` | real-time segments → store → route (ingest buffer / assist / confirmation reply) |
| POST | `/webhooks/omi/memory?uid=&secret=` | full conversation → ingest |
| POST | `/v1/users` | create patient `{displayName, omiUid?, caregiverName?}` |
| GET | `/v1/users/:id` | user + settings |
| PATCH | `/v1/users/:id` | `{contextEnabled?, assistMode?}` |
| POST | `/v1/simulate/segments` | same as Omi webhook but by `userId`, for demo without device: `{userId, segments:[{text, isUser, speaker}]}` |
| POST | `/v1/simulate/fragment` | `{userId, text}` → runs ASSIST directly, returns `{runId, confirmationId}` |
| POST | `/v1/confirmations/:id/answer` | `{answer:"yes"|"no"}` |
| GET | `/v1/confirmations/:id` | state |
| GET | `/v1/runs?userId=&pipeline=&limit=` | list traces |
| GET | `/v1/runs/:id` | full trace: run + steps (inputs, outputs, retrieval hits, latencies) |
| GET | `/v1/memory?userId=&type=&q=` | list/search memory facts (q → semantic search) |
| DELETE | `/v1/memory/:pointId?userId=` | delete one fact (privacy control) |
| POST | `/v1/memory/purge` | `{userId}` delete all memory for user |
| GET | `/v1/users/:id/wordmap` | learned substitutions + resolved utterances |
| GET | `/v1/stream?userId=` | SSE: all events for user (see §9) |
| GET | `/v1/audio/:id` | serve mp3 (no auth needed if id is unguessable cuid) |
| GET | `/v1/users/:id/insights` | **stretch**: weekly stats — fragments count, first-try resolution rate trend, top failing categories, new substitutions |

Return `runId` everywhere so the trace UI can follow along.

---

## 9. Observability (this is scored — do it properly)

SSE event bus (in-process EventEmitter + Redis pub/sub so workers can publish). Event envelope:
```json
{ "type": "step.completed", "userId": "...", "runId": "...", "ts": "...", "data": { ... } }
```
Event types: `segment.received`, `segment.classified`, `run.started`, `step.started`, `step.completed`, `step.failed`, `memory.upserted`, `confirmation.asked`, `confirmation.answered`, `assist.resolved`, `assist.unresolved`, `confirmation.expired`, `wordmap.updated`, `run.completed`.

`step.completed` data must include: node name, agent id (if any), latency, a compact output preview, and for retrieval nodes the hits `[{id, type, text, score}]`.

Also ship **`/debug` static page** (single `public/debug.html`, vanilla JS, no build step): select user, live SSE log rendered as a vertical timeline per run (node → latency → output preview → qdrant hits with score bars), current confirmation with **Yes/No buttons**, audio player auto-playing question/final audio, toggle for `contextEnabled`. Ugly is fine; clear is mandatory. This doubles as the caregiver console in the demo video.

---

## 10. Seed + fixtures + eval

### 10.1 Persona (`fixtures/persona-ramesh-family.json`)
Patient: **Mohan Lal Sharma**, 68, post-stroke expressive aphasia. Family: son **Ramesh** (handles bills, lives with him), daughter **Priya** (lives in Pune, visits on weekends), grandson **Aarav** (8, cricket). Caregiver: **Sunita**. Doctor: **Dr. Mehta** (sugar restriction, walk at 6 PM). Routines: morning chai, 6 PM walk to the park, cricket on TV, temple Tuesday. Objects: reading glasses, blue shawl, radio.

### 10.2 Ambient week (`fixtures/ambient-week.json`)
~60 transcript segments across 7 days (family + caregiver speaking, timestamps relative to "now"), containing facts the eval needs: water bill due, Priya visiting Sunday, cake/sugar restriction, glasses broken and being repaired, Aarav's match Saturday, physio moved to Thursday, etc. Include noise/small talk the extractor should ignore.

### 10.3 Eval fragments (`fixtures/fragments-eval.json`)
≥ 30 items, each `{ fragment, goldIntent, goldKeywords, requiresContext: bool }`. Cover aphasia patterns: telegraphic ("water… Ramesh… yesterday"), anomia ("the… the… thing… eyes" → glasses), semantic substitution ("car… park… six" → walk at 6), perseveration, negation, Hindi-English mix ("chai… nahi… sugar"). ~70% should require context.

### 10.4 `pnpm eval`
For each fragment: run ASSIST with `contextEnabled=true` and `false` (fresh user per mode, both seeded with same persona). Judge correctness by an **LLM judge via Lyzr-independent call?** No — keep everything through Lyzr: create a 7th agent `eval_judge` (`{match: bool, reason}` comparing hypothesis vs goldIntent). Report table:
```
mode         top1   top3   avg_latency_ms
context ON   0.73   0.90   3100
context OFF  0.20   0.37   2400
```
Write results to `eval-results/<timestamp>.json` and `.md`. With `MOCK_EXTERNALS=true`, eval runs against mocks (deterministic) so it works in CI.

### 10.5 `scripts/replay-omi.ts`
Replays `ambient-week.json` then a scripted demo session as **real HTTP calls to the Omi webhook route** (with realistic payload shape), with configurable delay. Used to record the demo video when the physical device isn't reliable.

---

## 11. Privacy & safety (also a judging angle)
- Raw transcripts of non-patient speakers are retained only `RAW_TRANSCRIPT_RETENTION_DAYS` (daily cleanup BullMQ repeatable job); extracted facts persist.
- Every memory fact is listable and deletable via API; purge endpoint wipes Qdrant + Postgres for user.
- Never log full transcript text at info level — log ids + lengths; full text only at debug.
- No medical advice generation. Hypothesizer prompt forbids inventing health instructions; it may only reference stored `health_instruction` facts.
- README section: "Consent: Unsaid is a communication aid, used with the consent of the patient and household."

---

## 12. Testing requirements
All tests run with `MOCK_EXTERNALS=true`, against docker services (or testcontainers if easy).
- Unit: zod webhook parsing (valid, missing fields, extra fields), recency rerank math, dedup merge, yes/no regex classifier, DAG runner (parallelism, failure propagation), evidence-id sanitization, userId filter always present.
- Integration (supertest):
  1. Omi webhook with ambient segments → ingest job → facts in Qdrant.
  2. Fragment → confirmation asked → answer yes → resolved event + audio + learn job → word map entry.
  3. answer no ×3 → REJECTED_ALL + fallback.
  4. Learning loop: same fragment twice → 2nd run hypothesis #1 == confirmed intent.
  5. `contextEnabled=false` → retrieval steps skipped.
  6. Malformed webhook → 200 + RawWebhook stored.
- Mock Lyzr must be **deterministic and context-sensitive** (e.g., builds hypotheses from retrieved fact texts + word map) so tests are meaningful.

---

## 13. README.md (judge-facing — write it last, make it excellent)
Sections:
1. Title + one-liner + 3-line problem statement.
2. **Architecture diagram (mermaid)** — Omi → webhooks → classifier → (ingest | assist) pipelines → Lyzr agents → Qdrant collections → confirmation loop → TTS → caregiver console; plus learn loop back into Qdrant.
3. **Agent topology diagram (mermaid)** — the ASSIST DAG with parallel retrieval nodes.
4. Sponsor integration table: exactly where Omi, Qdrant, Lyzr are used (file paths).
5. Quickstart: `docker compose up -d`, `pnpm i`, `pnpm db:migrate`, `pnpm lyzr:setup`, `pnpm seed`, `pnpm dev`, open `/debug`.
6. Running with zero keys (`MOCK_EXTERNALS=true`).
7. Eval results table (paste latest).
8. API reference (short table).
9. Privacy & consent.
10. Limitations & next steps (honest).

---

## 14. Build order (phases — commit after each)

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | Contract verification notes in `DECISIONS.md`; scaffold, tooling, docker-compose, env validation, health route | `pnpm dev` boots, `/healthz` green with docker up |
| 1 | Prisma schema + migrations; Qdrant bootstrap (collections + indexes); adapters (interfaces + mocks + real impls) | unit tests for adapters pass |
| 2 | Tracing (Run/Step), SSE bus, DAG runner | DAG tests pass; SSE streams test events |
| 3 | Agent prompts + `runAgent` (parse, repair-retry, trace) + `lyzr-setup.ts` | mock agents return schema-valid JSON |
| 4 | INGEST pipeline + Omi webhooks + buffering + memory store (dedup, rerank) | integration test 1 passes |
| 5 | ASSIST pipeline + confirmation state machine + TTS + audio route | integration tests 2, 3, 5 pass |
| 6 | LEARN pipeline + word map | integration test 4 passes |
| 7 | Simulate routes, memory/privacy routes, runs routes, `/debug` page | manual run through `/debug` works with mocks |
| 8 | Fixtures, seed, replay-omi, eval (+ eval_judge agent) | `pnpm eval` prints table in mock mode |
| 9 | README with diagrams, DECISIONS cleanup, lint clean, all tests green | `pnpm lint && pnpm test && pnpm build` all pass |
| 10 (stretch) | `/insights` endpoint, retention cleanup job, Omi notifier | — |

**Do not skip phases. Do not start the stretch before Phase 9 is green.**

---

## 15. Engineering rules
- TypeScript strict, no `any` except at parse boundaries (immediately narrowed by zod).
- No business logic in route handlers — routes call services.
- All external calls: timeout (Lyzr 20s, embeddings 10s, TTS 15s), 2 retries with exponential backoff on 5xx/network only.
- Idempotency: Omi may resend segments — dedupe by `(sessionId, startSec, text hash)`.
- Every pipeline run is traceable from a single `runId`.
- Small files, clear names, comments only where the "why" isn't obvious.
- When finished, print a summary: what's done, what's assumed (from DECISIONS.md), exact commands to run the demo.
