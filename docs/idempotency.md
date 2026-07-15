# Idempotency and Trace Store

## Purpose

Idempotency prevents duplicate GitHub issues when the same incident is handed off more than once.

## Clean Demo Chain

```text
INC0010001
→ GitHub Issue #3
→ Copilot PR #4
```

## Trace Store

Local trace file:

```text
data/ams-traces.json
```

This file is local runtime state.

## Reset State

Use:

```bash
./scripts/reset-local-state.sh
```

This resets the local trace store to:

```text
INC0010001
GitHub Issue #3
Copilot PR #4
Status PR_CREATED
```

## Duplicate Prevention Flow

When `/api/v1/remediation/handoff` is called:

1. Bridge checks the trace store for the incident.
2. If a GitHub issue already exists, it reuses it.
3. No new GitHub issue is created.
4. ServiceNow work note states that duplicate prevention was applied.

Expected response for the clean demo chain:

```json
{
  "idempotent": true,
  "reused": true
}
```

## Known Test Duplicate

GitHub Issue #5 was created during earlier testing before the trace store was reseeded.

It is not part of the clean demo chain.