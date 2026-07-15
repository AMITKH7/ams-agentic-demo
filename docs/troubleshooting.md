# Troubleshooting

## Bridge Not Reachable

Symptom:

```text
curl: (7) Failed to connect to localhost port 3000
```

Check:

```bash
docker compose ps
docker compose logs --tail=300 ams-bridge
docker compose up --build
```

## TypeScript Build Error

Run:

```bash
docker compose up --build
```

Look for:

```text
error TS...
```

Fix the indicated file and rebuild.

## Preview Endpoint Returns Invalid JSON

Run with headers:

```bash
set -a
source .env
set +a

curl -sS -i -X POST http://localhost:3000/api/v1/remediation/handoff/preview \
  -H "Content-Type: application/json" \
  -H "x-ams-internal-key: $BRIDGE_INTERNAL_KEY" \
  -d '{"incidentNumber":"INC0010001","approvedBy":"amit.khandelwal"}'
```

Check status:

| Status | Meaning |
|---|---|
| 200 | Success |
| 401 / 403 | Internal key issue |
| 404 | Route missing |
| 500 | Runtime error |

## Internal Key Issue

Reload `.env`:

```bash
set -a
source .env
set +a
```

## Duplicate GitHub Issue Risk

Always reset trace before demo:

```bash
./scripts/reset-local-state.sh
```

For `INC0010001`, handoff should reuse GitHub Issue #3.

## OpenAI Fallback Test

Use the preview endpoint only.

Do not test OpenAI mode by creating real GitHub issues unless intentionally testing a new incident.

## ServiceNow Work Notes Not Updating

Check:

- ServiceNow instance URL
- `ams.bridge.url`
- `ams.bridge.key`
- Cloudflare tunnel URL if using tunnel
- bridge logs

## GitHub PR Webhook Not Updating ServiceNow

Run local replay:

```bash
./scripts/run-pr-webhook-local.sh
```

Then check:

```bash
docker compose logs --tail=200 ams-bridge
```