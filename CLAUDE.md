# CLAUDE.md — Unsaid

Unsaid is a backend communication aid for people with non-fluent (expressive) aphasia. It listens to ambient
conversation (Omi real-time transcripts), extracts personal facts into vector memory (Qdrant), and when the user
speaks a telegraphic fragment ("water… Ramesh… bill") it retrieves context, proposes ranked intent hypotheses,
asks a yes/no confirmation, speaks the confirmed sentence (TTS), and learns a personal word map from confirmations.
Spec: `UNSAID_BUILD.md`. Decision log: `DECISIONS.md`.

## Hard rules

- **Lyzr is the mandatory agent path** (hackathon rule). Groq (`LLM_PROVIDER=groq`) is a developer fallback only.
- **Never tune prompts, gold labels, or rules to specific eval fragments.** Rules must be general.
- **Never put secrets in tracked files.** `.env` is git-ignored; `.env.example` holds placeholders only.
- **Never report results not produced by `pnpm eval` with the `eval_judge` agent (via Lyzr).** Mock-mode numbers are
  smoke tests and must be labelled as such. Never self-grade.
- **No medical claims.** Unsaid is a communication aid, not a diagnostic or therapeutic device.
- Frontend lives in `/web` (React + Vite). Landing numbers are read from the newest **live** eval report at build time: never hardcode or round them. The design is dark (spec: `web/design-ref/`, tokens in `web/src/design/tokens.css`): Geist + Geist Mono only, no serif. The mint accent is only for live states, the current question and the confirmed sentence; patient fragments are always dim mono, resolved sentences always large sans with a faint glow. Never hardcode a patient name; render it from the user record. `public/debug.html` is a dev tool only.

## Stack

Node 20+, TypeScript (CommonJS), Express 4, Zod 4, Prisma 6 (Postgres), BullMQ + ioredis (Redis), Qdrant,
Lyzr Studio agents (7), OpenAI embeddings + TTS, pino logging, vitest + supertest.

## Commands

| Command                                          | Purpose                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `docker compose up -d`                           | Postgres, Redis, Qdrant (host ports overridable in `.env`)   |
| `pnpm i`                                         | install (runs `prisma generate`)                             |
| `pnpm db:migrate`                                | apply Prisma migrations                                      |
| `pnpm dev` / `pnpm build && pnpm start`          | run API (+ in-process workers)                               |
| `pnpm test`                                      | vitest, always with mocked externals, real local docker deps |
| `pnpm lint` / `pnpm exec tsc --noEmit`           | eslint+prettier / typecheck                                  |
| `pnpm seed`                                      | seed demo persona + ambient memory                           |
| `pnpm lyzr:setup`                                | create/update the 7 Lyzr agents                              |
| `pnpm eval` / `pnpm eval:learn`                  | live ablation eval / learning-loop eval (needs live keys)    |
| `cd web && pnpm dev` / `pnpm build` / `pnpm e2e` | frontend dev server / static build / Playwright + axe        |
| `cd web && pnpm gen:api`                         | regenerate typed API client from docs/openapi.yaml           |
| `pnpm replay:omi`                                | replay fixtures through the Omi webhook                      |

## Conventions

- Agents are addressed by logical `AgentName`; prompts live in `src/agents/prompts/<name>.md` (source of truth).
- Every route validates input with zod; errors use the common envelope from `src/http/middleware/error.ts`.
- Never log transcript text at info level (debug only).
- Tests: `MOCK_EXTERNALS=true`, isolated DB `unsaid_test`, Redis db 1, Qdrant collections prefixed `test_`.
- Commit per phase; keep lint/typecheck/test/build green.
