# Omi setup (phone microphone, no wearable)

The Omi app can stream live transcripts from the **phone mic** to Unsaid. No Omi hardware is needed: open a
live-listen session in the app and it behaves like the wearable.

> Source: docs.omi.me, "Integrations" (checked 2026-10-04). The real-time trigger needs an **active live-listen
> session**; recordings uploaded later are not replayed through it.

## What Unsaid expects

`POST /webhooks/omi/transcript?uid=<omi user id>&session_id=<id>` with a JSON body, either a bare array of segments
(what the Omi docs show) or `{ "session_id": "...", "segments": [...] }`. Segment fields (all optional):
`text, speaker, speakerId|speaker_id, is_user, start, end`. Segments arrive over multiple calls as the conversation
unfolds; resent segments are de-duplicated (`sha1(session|start|text)`), so a retry never triggers a second assist.

`is_user: true` marks the **patient's own speech** (treated as a fragment to resolve); everything else is ambient
context that becomes memory. In the Omi app, make sure the account owner is the patient (speaker profile / "my voice").

Every raw payload (secret stripped) is stored in the `RawWebhook` table. If Omi's real shape ever differs from the above,
look there first and adjust `src/adapters/omi/schemas.ts`.

## Authentication of the webhook

The webhook has its own secret, `OMI_WEBHOOK_SECRET` (separate from `API_KEY`). It is **required in production**.
Pass it in whichever way the Omi URL field allows:

| Style  | URL to paste into Omi                                           |
| ------ | --------------------------------------------------------------- |
| path   | `https://HOST/webhooks/omi/transcript/<SECRET>` (safest choice) |
| query  | `https://HOST/webhooks/omi/transcript?secret=<SECRET>`          |
| header | `x-omi-secret: <SECRET>` (only if you front it with a proxy)    |

The path style avoids the open question of whether Omi correctly appends `?uid=...&session_id=...` to a URL that
already contains a `?` (the docs do not say). Generate a secret with `openssl rand -hex 32`.

## A. Local, via ngrok

1. Start the stack and API:
   ```bash
   docker compose up -d && pnpm db:migrate && pnpm seed
   OMI_WEBHOOK_SECRET=$(openssl rand -hex 16) pnpm dev     # or put it in .env
   ```
2. Expose it: `ngrok http 8080` and copy the `https://<id>.ngrok-free.app` URL.
3. In the Omi app: **Settings → Enable Developer Mode → Developer Settings → Real-Time Transcript Webhook** and paste
   `https://<id>.ngrok-free.app/webhooks/omi/transcript/<SECRET>`.
4. Optional but recommended: make the seeded patient match your Omi account so memory lines up. Find your Omi uid in the
   first `RawWebhook` row (`query.uid`) or `GET /v1/omi/status`, then set it:
   ```bash
   curl -X PATCH localhost:8080/v1/users/$USER_ID -H "Authorization: Bearer $API_KEY" \
     -H 'content-type: application/json' -d '{"displayName":"Mohan Lal Sharma"}'
   ```
   (An unknown `uid` auto-creates an empty "Omi Patient" user. To bind the seeded patient, set `omiUid` on it in the
   database, e.g. `UPDATE "User" SET "omiUid"='<uid>' WHERE "displayName"='Mohan Lal Sharma';`.)
5. Start a **live-listen** session in the app and speak. Watch `pnpm dev` logs, or:
   ```bash
   curl -H "Authorization: Bearer $API_KEY" "localhost:8080/v1/omi/status?userId=$USER_ID"
   curl -N "localhost:8080/v1/stream?userId=$USER_ID&api_key=$API_KEY"
   ```

## B. Deployed

Same as above with `https://<your-deployed-host>/webhooks/omi/transcript/<SECRET>`; see [DEPLOY.md](./DEPLOY.md) for the
host. No tunnel needed. Confirm with `/v1/omi/status`.

## Verifying it is really live

`GET /v1/omi/status` returns:

```json
{
  "ok": true,
  "data": {
    "lastSegmentAt": "2026-10-04T10:11:12.000Z",
    "lastSegmentSource": "OMI_REALTIME",
    "segmentsLast5Min": { "OMI_REALTIME": 14, "OMI_MEMORY": 0, "SIMULATED": 0 },
    "lastRawWebhookAt": "…",
    "rawWebhooksLast5Min": 6,
    "webhookSecretConfigured": true
  }
}
```

`OMI_REALTIME` > 0 proves Omi (not the simulator) is delivering. `rawWebhooksLast5Min > 0` with zero segments means payloads
arrive but did not parse (inspect `RawWebhook.parsedOk = false`). Nothing at all usually means a wrong URL, a wrong secret
(401 in the Omi/ngrok logs), or no active live-listen session.

## Troubleshooting

| Symptom                          | Check                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| 401 from the webhook             | Secret in URL differs from `OMI_WEBHOOK_SECRET`                                    |
| Segments stored but no questions | `is_user` never true: patient voice not recognised as the account owner in Omi     |
| Memory never grows               | Ambient segments buffer until 6 segments or 30 s idle; check the ingest worker log |
| `uid` missing                    | Use the path-style secret URL; unknown/missing uid falls back to the first user    |
| Replay without a phone           | `pnpm replay:omi` posts the fixture week through the same endpoint                 |

## Privacy and consent

Ambient capture records other people. Tell everyone present, only run it with their consent, and use
`DELETE /v1/memory/{id}` / `POST /v1/memory/purge` to erase. Raw ambient transcripts are deleted after
`RAW_TRANSCRIPT_RETENTION_DAYS` (default 14); extracted facts persist until deleted.
