# Observability

## Endpoints

| Endpoint | Purpose |
|---|---|
| `/health` | Human-readable health |
| `/live` | Liveness |
| `/ready` | Readiness |
| `/metrics` | Prometheus-style metrics |
| `/dashboard` | Local dashboard |

## Dashboard

Open:

```text
http://localhost:3000/dashboard
```

Dashboard shows:

- trace records
- GitHub issue links
- Copilot PR links
- duplicate prevention
- recent events
- health links
- metrics links

## Metrics

Use:

```bash
./scripts/show-metrics.sh
```

Metrics include:

```text
ams_triage_requests_total
ams_triage_success_total
ams_triage_failure_total
ams_github_handoff_requests_total
ams_github_issue_created_total
ams_github_duplicate_prevented_total
ams_webhook_received_total
ams_webhook_failure_total
ams_http_requests_total
ams_trace_records_total
```

## Trace ID

Each major operation has a trace ID.

Trace ID appears in:

- ServiceNow work notes
- bridge logs
- local trace store
- dashboard