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

