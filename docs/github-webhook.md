# GitHub PR Webhook

## Purpose

The GitHub PR webhook closes the traceability loop from Copilot PR back to ServiceNow.

## Endpoint

```text
POST /api/v1/github/webhook
```

## Local Replay

```bash
./scripts/run-pr-webhook-local.sh
```

Expected response:

```json
{
  "correlated": true,
  "status": "PR_CREATED",
  "workNotesUpdated": true
}
```

## Correlation Logic

Bridge correlates PR to incident using:

- ServiceNow incident number
- GitHub issue number
- selected Jira key
- branch/title/body references
- existing trace store record

## ServiceNow Update

When PR is detected, ServiceNow work notes show:

```text
AMS Copilot remediation PR detected.

Human Gate 2: Required.
Auto-merge: Not allowed.

Validation Expected:
- npm test
- npm run build
```

## Security Note

Local demo webhook does not yet enforce GitHub webhook signature validation.

Production hardening should add:

- GitHub webhook secret
- signature validation
- GitHub App authentication