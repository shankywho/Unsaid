# Backend demo script (about 6 minutes)

Everything below is a command you can paste. Frontend screenshots are out of scope here; the live trace is shown with
`curl`, the dev console (`/debug`) or the SSE stream.

```bash
export API=http://localhost:8080 KEY=dev-key        # use the values from your .env
H=(-H "Authorization: Bearer $KEY" -H 'content-type: application/json')
```

## 0. Boot (live mode)

```bash
docker compose up -d && pnpm db:migrate
pnpm lyzr:setup          # once: provisions/updates the 7 Lyzr agents
pnpm seed                # persona Mohan Lal Sharma + a week of ambient memory (also pre-loads two word-map examples)
pnpm dev
curl $API/readyz         # db/redis/qdrant ok, lyzr "configured", llmProvider "lyzr"
export USER_ID=$(curl -s "${H[@]}" $API/v1/me | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.patients.find(p=>p.displayName.startsWith("Mohan")).id')
```

Narration: Unsaid listens to the household through Omi, stores facts as vectors, and when Mohan speaks a fragment it proposes what he
probably means and asks him to confirm. Nothing is spoken until he says yes.

## 1. Watch the pipeline (second terminal, keep it open)

```bash
curl -N "$API/v1/stream?userId=$USER_ID&api_key=$KEY"
```

## 2. Ambient memory (what the system overhears)

```bash
pnpm replay:omi          # posts the fixture week through the real /webhooks/omi/transcript, then a first fragment
curl -s "${H[@]}" "$API/v1/memory?userId=$USER_ID&q=water%20bill" | head -c 600
```

Point out `memory.upserted` events and that every fact carries entities, aliases and a validity window.
(If the server has `OMI_WEBHOOK_SECRET` set, run `REPLAY_WEBHOOK_SECRET=<secret> pnpm replay:omi`.)

## 3. A fragment, resolved with context

```bash
curl -s "${H[@]}" -X POST $API/v1/simulate/fragment -d '{"userId":"'$USER_ID'","text":"water… Ramesh… bill"}'
```

In the stream: `segment.classified` → parallel retrieval steps with scores → `hypotheses.generated` (three different speech acts:
asking, stating, requesting) → `confirmation.asked`. Take `confirmationId` from the response:

```bash
export CONF_ID=<confirmationId>
curl -s "${H[@]}" -X POST $API/v1/confirmations/$CONF_ID/answer -d '{"answer":"no"}'    # next hypothesis
curl -s "${H[@]}" -X POST $API/v1/confirmations/$CONF_ID/answer -d '{"answer":"yes"}'   # assist.resolved + audio
export RUN_ID=<runId from the simulate response>
curl -s "${H[@]}" $API/v1/runs/$RUN_ID | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.steps.map(s=>s.node+" "+s.latencyMs+"ms").join("\n")'
```

## 4. Ablation: same fragment with memory switched off

```bash
curl -s "${H[@]}" -X PATCH $API/v1/users/$USER_ID -d '{"contextEnabled":false}'
curl -s "${H[@]}" -X POST $API/v1/simulate/fragment -d '{"userId":"'$USER_ID'","text":"Sunday… Priya… cake… no"}'
curl -s "${H[@]}" -X PATCH $API/v1/users/$USER_ID -d '{"contextEnabled":true}'
curl -s "${H[@]}" -X POST $API/v1/simulate/fragment -d '{"userId":"'$USER_ID'","text":"Sunday… Priya… cake… no"}'
```

With context OFF the three retrieval steps arrive as `SKIPPED` and `evidenceIds` are empty; the hypotheses are generic. Then show
the measured effect (takes ~20 min live, so show the saved report instead):

```bash
cat docs/eval/live-eval-2026-10-04.md        # produced by `pnpm eval`
```

## 5. Learning loop

```bash
curl -s "${H[@]}" $API/v1/users/$USER_ID/wordmap          # before
# answer a confirmation with "yes" (step 3); the LEARN run emits wordmap.updated in the stream
curl -s "${H[@]}" $API/v1/users/$USER_ID/wordmap          # after: new substitution / resolved utterance
curl -s "${H[@]}" $API/v1/users/$USER_ID/insights
```

Full measurement (live, about 6 min): `pnpm eval:learn` (10 scenarios, differently phrased test fragments, before vs after).

## 6. Omi live path (if a phone is available)

Follow [OMI_SETUP.md](./OMI_SETUP.md), speak, then:

```bash
curl -s "${H[@]}" "$API/v1/omi/status?userId=$USER_ID"     # lastSegmentSource: OMI_REALTIME
```

## 7. Privacy

```bash
curl -s "${H[@]}" -X DELETE "$API/v1/memory/<pointId>?userId=$USER_ID"
curl -s "${H[@]}" -X POST $API/v1/memory/purge -d '{"userId":"'$USER_ID'"}'   # destructive: erases this patient's memory
```

## Safety lines to say out loud

Communication aid, not a medical device. Confirmation is always required before anything is spoken. Used only with the
consent of the patient and everyone whose speech is captured.
