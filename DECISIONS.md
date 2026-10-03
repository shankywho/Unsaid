# DECISIONS

Every assumption made while building Unsaid, and why. Newest phase last.

## Phase 0 — contract verification & scaffold

### Verified / still-assumed external contracts

| Service                  | Status                                                            | Notes                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omi real-time transcript | **Partly verified** (docs.omi.me/doc/developer/apps/Integrations) | `POST <url>?uid=<uid>&session_id=<id>`; body is the segment payload; `session_id` arrives in the **query**. Spec shows `{session_id, segments:[…]}`; we accept _either_ that object, a bare array of segments, or `{segments}`, with `session_id` from body or query. Segment fields (`text, speaker, speaker_id, is_user, start, end`) all optional. |
| Omi memory webhook       | **Partly verified**                                               | `POST <url>?uid=<uid>`; body = conversation with `transcript_segments`, `structured`, `created_at`. Schema is tolerant (`passthrough`, all optional).                                                                                                                                                                                                 |
| Omi notifier             | **Assumed**                                                       | `POST https://api.omi.me/v2/integrations/{app_id}/notification?uid=&message=` with `Authorization: Bearer <OMI_APP_SECRET>`. No-op when `OMI_APP_ID`/`OMI_APP_SECRET` are empty. Lives behind `OmiNotifier`.                                                                                                                                          |
| Lyzr inference           | **Assumed** (docs.lyzr.ai page not reachable during build)        | `POST ${LYZR_INFERENCE_URL}`, `x-api-key`, body `{user_id, agent_id, session_id, message}`; reply text read from `response` → `message` → `output`. Only `src/adapters/lyzr/httpClient.ts` needs to change if wrong.                                                                                                                                  |
| Lyzr agent creation      | **Assumed**                                                       | `POST https://agent-prod.studio.lyzr.ai/v3/agents/` with `x-api-key`. `scripts/lyzr-setup.ts` falls back to printing prompts for manual Studio creation.                                                                                                                                                                                              |
| Qdrant                   | Verified via official JS client                                   | Collections + payload indexes created idempotently on boot.                                                                                                                                                                                                                                                                                           |
| OpenAI embeddings / TTS  | Standard public API                                               | `/v1/embeddings`, `/v1/audio/speech` (mp3).                                                                                                                                                                                                                                                                                                           |

### Tooling choices

- **Versions pinned deliberately:** Express 4 (spec), Prisma 6 (classic `url = env()` datasource; Prisma 7 requires driver adapters/config file), TypeScript 5.9, ESLint 9. `pnpm add` otherwise resolved to much newer majors.
- **CommonJS output** (no `"type": "module"`): avoids `.js` import-extension noise; `tsx`/`vitest` run TS directly, `tsc` emits to `dist/`.
- **Local ports:** this dev machine already has Postgres on 5432 and Redis on 6379, so `docker-compose.yml` host ports are overridable (`POSTGRES_PORT`, `REDIS_PORT`, `QDRANT_PORT`); the local `.env` uses 5442/6389. `.env.example` keeps the standard ports.
- **Tests run against real docker services** (Postgres/Redis/Qdrant) but isolated: database `unsaid_test`, Redis db 1, Qdrant collections prefixed `test_`. External APIs (Lyzr/OpenAI/Omi) are always mocked in tests.

## Phase 1 — schema, Qdrant, adapters

- `TranscriptSegment` gets a `dedupeKey` (sha1 of `sessionId|startSec|text`) with a unique `(userId, dedupeKey)` index to satisfy the "Omi may resend" rule; extra enums `NOISE` (SegmentKind) and `StepStatus.SKIPPED` added; `Confirmation.resolution` records why a confirmation ended (e.g. `superseded`, `timeout`).
- Lyzr agents are addressed by a **logical `AgentName`**; `HttpLyzrClient` maps it to the env agent id, the mock ignores ids. All agent messages are JSON documents.
- Mock embedder = deterministic feature hashing over stemmed, stop-word-filtered tokens, so cosine ≈ token overlap. Tests run it at `EMBEDDING_DIM=256` for speed; production default stays 1536.
- OpenAI embeddings request passes `dimensions` so `EMBEDDING_DIM` is honoured.
- Mock TTS writes a short silent but valid MP3 so the browser audio player works in the demo.

## Phase 2 — tracing, SSE, DAG

- Event bus publishes locally **and** to Redis channel `unsaid:events`; each process tags its origin and ignores its own echo, so API + worker processes both feed SSE clients without duplicates.
- `/v1/*` auth accepts `Authorization: Bearer` **or** `?api_key=` because browser `EventSource`/`<audio>` can't set headers (needed by `/debug`). Tradeoff: key may appear in access logs; acceptable for a hackathon demo key.
- DAG runner never throws: a failed node → FAILED step, dependents → SKIPPED unless `allowFailedDeps`. Pipelines inspect results to degrade or fail the run.

## Phase 3 — agents, schemas, runAgent, lyzr-setup

- All 7 agent system prompts stored in `src/agents/prompts/<name>.md` as markdown source of truth.
- `runAgent` handles markdown code-fence removal (` ```json `), schema validation via Zod, and 1 automated repair prompt on parse failure before bubbling `AGENT_PARSE_ERROR`.
- `MockLyzrClient` implements deterministic, context-sensitive handlers for all 7 agents to support CI/offline testing, word-map learning verification, and context ON vs OFF ablation.
- `scripts/lyzr-setup.ts` attempts creation via Lyzr API when `LYZR_API_KEY` is present, or prints an explicit manual setup table and `.env` template if unconfigured or API fails.

## Phase 4 — INGEST pipeline, memory store, Omi webhooks

- Universal Query API (`qdrant.query`) used with `@qdrant/js-client-rest` v1.19.0.
- Strict multi-tenant safety: every Qdrant query, update, and deletion is constrained with `{ key: 'userId', match: { value: userId } }`.
- Fact dedup merges facts with cosine score >= 0.92, uniting entities, aliases, and sourceSegmentIds while incrementing mention count.
- Recency reranking calculates an exponential decay with a 7-day half-life and drops facts past `validUntil`.
- Omi webhooks accept flexible formats, write to `RawWebhook` without throwing 500s, and buffer ambient segments in Redis for batched INGEST DAG execution via BullMQ.

## Phase 5 — ASSIST pipeline, confirmation state machine, TTS, audio route

- Parallel DAG execution: memory retrieval and wordmap retrieval run simultaneously.
- Regex fast-path for pending confirmations classifies affirmative and negative replies locally, avoiding LLM latency.
- Confirmation state machine supports Yes/No progressions up to 3 candidate hypotheses before degrading to a fallback categorical question.
- Superseding logic: a new fragment spoken while a confirmation is already pending marks the earlier confirmation as EXPIRED with reason `superseded`.
- Context ablation mode cleanly skips both memory and wordmap retrieval DAG nodes when `contextEnabled=false`, leaving evidenceIds empty.
- Audio streaming endpoint `GET /v1/audio/:id` serves MP3 files without authentication so browser `<audio>` tags and debug tools can play them without header limitations.

## Phase 6 — LEARN pipeline and word map

- Dual-write word map: `unsaid_wordmap` Qdrant collection stores dense vectors for fast semantic matching of recurring fragments, while PostgreSQL `WordMapEntry` maintains hits count and fast listing for the caregiver UI.
- Feedback loop: Learner agent runs asynchronously upon confirmation, extracting substitutions and aliases. On subsequent utterances of the same fragment, the learned resolved utterance is prioritized by the hypothesizer with high confidence as hypothesis #1.
- `GET /v1/users/:id/wordmap` provides unified listing of substitutions and resolved utterances.

## Phase 7 — Runs, memory/privacy routes, simulation, and debug console

- Caregiver & debug UI (`public/debug.html` served at `/debug`): includes live SSE DAG timeline with node-level latency and retrieval score bars, Yes/No confirmation controls, `<audio>` auto-player, and an interactive context ON/OFF toggle for live ablation demonstrations.
- Granular privacy controls: `DELETE /v1/memory/:pointId` removes specific facts and `POST /v1/memory/purge` completely clears a user's memory and word map collections in Qdrant.
- Step-level observability: `GET /v1/runs/:id` surfaces individual node execution statuses, latencies, sanitized inputs/outputs, and Qdrant retrieval hits with cosine scores.

## Phase 8 — Fixtures, seed, replay-omi, eval suite

- Realistic persona & fixtures: 68-year-old stroke survivor **Mohan Lal Sharma** recovering from left-hemisphere stroke with moderate **non-fluent (Broca's / expressive) aphasia**. Son **Ramesh Sharma** manages household utilities and logistics; daughter Priya visits on Sundays; grandson Aarav plays cricket; Sunita provides daily care; Dr. Mehta prescribes sugar restriction.
- Dataset: 32 synthetic clinical scenario fragments (`fixtures/fragments-eval.json`) based on speech-language pathology literature (~70% context-dependent, 10 self-contained daily requests).
- Ablation evaluation (`scripts/eval.ts`): runs identical fragments with context ON vs context OFF. An LLM judge (`eval_judge`) evaluates hypothesis correctness against ground truth.
- Mock-mode smoke test baseline: In mock mode, Context OFF scores **0.31 top-1** (resolving exactly the 10 self-contained fragments, while failing the 22 context-dependent fragments where context is missing) and **0.69 top-3**. Context ON achieves **0.72 top-1 / 0.81 top-3**. This is explicitly labeled as a pre-API key offline smoke test to validate DAG mechanics; live LLM benchmarks with real latencies (1.5–3.5s) will be recorded once external keys are configured.
- `scripts/replay-omi.ts` provides realistic Omi webhook replay with timing delays for demo video recording.

## Phase 9 — Documentation and Diagrams

- Architectural clarity: complete Mermaid DAG diagrams documented in `README.md` for both INGEST (asynchronous vector embedding & fact extraction) and ASSIST (parallel memory & wordmap retrieval, intent hypothesizing, confirmation generation, and low-latency audio synthesis).
- Comprehensive README covering full installation, Docker Compose dependencies, API endpoints, evaluation benchmarks, and Lyzr setup instructions.
- Zero-medical-claims framing maintained throughout docs: Unsaid is strictly framed as an accessibility & adaptive communication assistant.

## Phase 10 — Stretch Goals & Enterprise Polish

- Caregiver insights endpoint: `GET /v1/users/:id/insights` calculates communication metrics over time (e.g., confirmations, top recurring word map substitutions, active personal facts) to help speech therapists and family members track communication progress.
- Raw ambient retention cleanup: `cleanupQueue.ts` schedules a recurring daily worker via BullMQ's modern `upsertJobScheduler` to purge raw ambient transcripts older than 30 days while preserving extracted semantic memories, satisfying strict privacy policies.
- Graceful shutdown lifecycle: worker process handles SIGINT and SIGTERM to stop background queues and close Prisma and Redis connections cleanly without dropping active jobs.

## Audit & Critical Refinements

- Embedding Dimension Safety: `bootstrapQdrant` queries `qdrant.getCollection(name)` and inspects `vectors.size`. If it does not match `env.EMBEDDING_DIM` (e.g. 256 for mock testing vs 1536 for OpenAI `text-embedding-3-small`), it throws a descriptive error by default to prevent accidental data loss. It only drops/recreates collections if `QDRANT_ALLOW_RESET=true`. Explicit reset is available via `pnpm qdrant:reset` (`scripts/reset-qdrant.ts`).
- Persona Disambiguation: Clarified throughout documentation and seed data that **Mohan Lal Sharma** is the patient (68yo), while **Ramesh Sharma** is his son and primary caregiver.
- Clinical Accuracy: Corrected aphasia classification to **non-fluent (Broca's / expressive) aphasia**, eliminating contradictory references to fluent anomic variants.
- Route & Command Canonicalization: Standardized on port 8080 across all docs, configs, and `.env.example`. Removed duplicate aliases to enforce single canonical endpoints and scripts: route is strictly `POST /v1/simulate/fragment`, eval command is strictly `pnpm eval`, and replay command is strictly `pnpm replay:omi`.
