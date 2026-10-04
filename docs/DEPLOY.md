# Deploying Unsaid (target: under 15 minutes)

Stack: **API on Railway or Render** (Docker), **Postgres on Neon**, **Redis on Upstash**, **Qdrant Cloud**.
Nothing here deploys automatically; follow the steps. The API runs HTTP and the BullMQ workers in one process, so one
service is enough.

## 0. Before you start

- Rotate every key that ever lived in a local `.env` (Lyzr, OpenAI, Groq). Assume they are exposed.
- Generate secrets: `openssl rand -hex 32` three times for `API_KEY`, `SESSION_SECRET`, `OMI_WEBHOOK_SECRET`.
- The API **refuses to boot in production** if `API_KEY` is weak/default, `SESSION_SECRET` < 32 chars or
  `OMI_WEBHOOK_SECRET` < 16 chars.

## 1. Data stores (about 5 min)

| Service      | Steps                                                                                                                                                       | Value for the API              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Neon         | New project (Postgres 16) → Connection string, **pooled off** or the direct host (Prisma migrations need a direct connection) with `?sslmode=require`       | `DATABASE_URL`                 |
| Upstash      | New Redis database → **TLS** endpoint. BullMQ needs a regular Redis protocol URL, not REST: `rediss://default:<pw>@<host>:6379`. Pick a region near the API | `REDIS_URL`                    |
| Qdrant Cloud | Free cluster → copy the cluster URL (`https://<id>.<region>.cloud.qdrant.io:6333`) and create an API key                                                    | `QDRANT_URL`, `QDRANT_API_KEY` |

Upstash note: BullMQ polls constantly and can burn through a free command quota. Use a fixed-price plan for a live demo.
Vector size: collections are created at `EMBEDDING_DIM` (1536 for `text-embedding-3-small`). If you change it later, set
`QDRANT_ALLOW_RESET=true` once (drops and recreates) or use a new cluster.

## 2. Lyzr agents (about 3 min)

Agents are created once, from the repo prompts, and their ids go into env vars:

```bash
LYZR_API_KEY=... pnpm lyzr:setup          # local: creates missing agents / updates existing ones, prints the 7 ids
```

Re-running updates the prompt of agents whose `LYZR_AGENT_*_ID` is already set (it never creates duplicates).
If the Lyzr API call fails the script prints a manual table: paste `src/agents/prompts/<name>.md` as the agent
instructions in Lyzr Studio (JSON response format, `gpt-4o-mini`).

## 3. Environment variables

Full list with comments: [`.env.prod.example`](../.env.prod.example). Required for production:

| Variable                                                    | Notes                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV=production`                                       | disables `/debug`, `/docs` (unless `ENABLE_DOCS=true`)                 |
| `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY` | from step 1                                                            |
| `MOCK_EXTERNALS=false`, `LLM_PROVIDER=lyzr`                 | Lyzr is the agent path; Groq is a dev fallback only                    |
| `LYZR_API_KEY` + `LYZR_AGENT_*_ID` (7)                      | from step 2                                                            |
| `OPENAI_API_KEY` (optional)                                 | empty = local embeddings (384-d, needs ~450 MB RAM) and browser speech |
| `API_KEY`, `SESSION_SECRET`, `OMI_WEBHOOK_SECRET`           | step 0                                                                 |
| `AUTH_DISABLED=true`                                        | open console, no login (a public URL is then readable by anyone)       |
| `CORS_ORIGINS`                                              | frontend origin(s), comma separated                                    |
| `TRUST_PROXY=1`                                             | correct client IPs for rate limiting behind the platform proxy         |
| `PUBLIC_BASE_URL`                                           | the API's public https URL                                             |

## 4A. Railway

1. New project → **Deploy from GitHub repo** (the `Dockerfile` and `railway.json` are picked up).
2. Variables tab: add everything from section 3. Railway injects `PORT`.
3. `railway.json` runs `npx prisma migrate deploy` before each release and health-checks `/readyz`.
4. Settings → Networking → **Generate domain**.

## 4B. Render

1. New → **Blueprint** → select the repo (`render.yaml`). Secrets marked `sync: false` are prompted in the dashboard;
   `API_KEY`, `SESSION_SECRET`, `OMI_WEBHOOK_SECRET` are generated (read them from the dashboard afterwards).
2. Pre-deploy command runs the migration; `/readyz` is the health check.
3. Free instances sleep: use at least the Starter plan for a demo (webhooks cannot wake a cold service in time).

## 5. First-run steps (once, after the first successful deploy)

Run these in the platform shell (Railway: `railway run` / Render: Shell tab), where the compiled scripts exist:

```bash
npx prisma migrate deploy        # already done by pre-deploy; safe to repeat
node dist/scripts/seed.js        # demo persona + a week of ambient memory
```

Seeding is optional for Omi-only use (the system learns from live conversation) but the demo is far stronger with it.

## 6. Verify

```bash
API=https://<your-domain>
curl $API/healthz                      # {"status":"ok"}
curl $API/readyz                       # db/redis/qdrant "ok", lyzr "configured", llmProvider "lyzr"
curl -c jar -H 'content-type: application/json' -d '{"email":"…","password":"…"}' $API/auth/login
curl -b jar $API/v1/me
curl -H "Authorization: Bearer $API_KEY" -X POST $API/v1/simulate/fragment \
  -H 'content-type: application/json' -d '{"userId":"<id from /v1/me>","text":"water… Ramesh… bill"}'
```

Then point Omi at `$API/webhooks/omi/transcript/<OMI_WEBHOOK_SECRET>` ([OMI_SETUP.md](./OMI_SETUP.md)).

## 6b. Frontend (landing page and console)

The Docker image already contains the built frontend (`web/dist`, built from `/web` in the `web-build` stage) and the API serves it
at `/` (landing), `/login` and `/app/*` with SPA fallback, so **one service serves everything on one origin**. That is the
recommended setup: the session cookie stays first-party and `CORS_ORIGINS` can stay empty.

- The landing page's eval numbers are read from the newest live report in `docs/eval/` (or `eval-results/`) at **build** time. After a
  new `pnpm eval`, copy the report into `docs/eval/` and redeploy.
- Optional build-time variables (set them as Docker build args / platform build variables, they are baked into the bundle):
  `VITE_DEMO_VIDEO_URL` (YouTube or Loom share link; empty shows a poster) and `VITE_GITHUB_URL`.
- Vercel instead: import the repo with **Root Directory `web`** and enable "Include source files outside of the Root Directory"
  (the build reads `../docs/eval`). Edit the two `YOUR-API-HOST` rewrites in `web/vercel.json`. Because the rewrites proxy `/v1` and
  `/auth` through Vercel, the browser still sees one origin. Server-sent events pass through the rewrite but long streams can be cut by
  Vercel's function time limits; the combined Docker deployment avoids that.

## 7. Self-hosting alternative

`docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` brings up API + Postgres + Redis + Qdrant on
one machine (put a TLS reverse proxy such as Caddy in front and set `TRUST_PROXY=1`).

## 8. Operations

- Logs are JSON (pino). Transcript text is never logged at `info`; raise `LOG_LEVEL=debug` only briefly and never in prod.
- Rolling deploys: SIGTERM triggers graceful shutdown (`/readyz` turns 503, SSE streams close, workers drain, DB/Redis close;
  hard deadline 25 s, so keep the platform's stop timeout at or above 30 s).
- Rate limiting is per-instance (in-memory). Run one instance, or put a limiter at the proxy if you scale out.
- Audio files are written to `AUDIO_DIR` (`/data/audio` in the image). On platforms with ephemeral disks, old audio links
  break after a redeploy; attach a volume to `/data` if that matters.

## 7. Frontend on Vercel

1. Edit `web/vercel.json`: replace `YOUR-API-HOST` in the two rewrites with the Render host (for example `unsaid-api.onrender.com`). The browser then talks to Vercel only, so no CORS setup is needed.
2. Vercel → Add New Project → import the GitHub repo → **Root Directory `web`**, framework Vite, install command `pnpm install`, build command `pnpm build`, output `dist`. Keep "Include source files outside of the Root Directory" **on**: the build reads `../docs/eval` and `../fixtures`.
3. Optional env vars: `VITE_GITHUB_URL`, `VITE_DEMO_VIDEO_URL`, `VITE_GITHUB_STARS`.
4. Deploy, then set Render's `CORS_ORIGINS` to the Vercel URL and `PUBLIC_BASE_URL` to the Render URL.
