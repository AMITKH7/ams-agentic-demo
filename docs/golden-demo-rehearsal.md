cat > docs/golden-demo-rehearsal.md <<'EOF'
# Golden Demo Rehearsal Checklist

## Demo Objective

Show an end-to-end agentic incident-management workflow:

ServiceNow Incident
→ Dynamic Jira/Confluence evidence retrieval
→ Optional OpenAI refinement flag
→ ServiceNow governed work notes
→ Human Gate 1
→ GitHub/Copilot handoff
→ Copilot PR
→ GitHub webhook back to ServiceNow
→ Dashboard and metrics proof

## Golden Demo Chain

| Item | Value |
|---|---|
| ServiceNow Incident | INC0010001 |
| CI / Service | checkout-service |
| Selected Jira | KAN-1 |
| GitHub Issue | https://github.com/AMITKH7/checkout-service/issues/3 |
| Copilot PR | https://github.com/AMITKH7/checkout-service/pull/4 |
| Dashboard | http://localhost:3000/dashboard |

## Rehearsal Commands

```bash
./scripts/reset-local-state.sh
./scripts/run-health-check.sh
./scripts/show-trace.sh INC0010001
./scripts/smoke-knowledge-search.sh
./scripts/run-triage.sh INC0010001
./scripts/run-handoff-preview.sh INC0010001 amit.khandelwal
./scripts/run-github-handoff.sh INC0010001 amit.khandelwal
./scripts/run-pr-webhook-local.sh
./scripts/show-metrics.sh
./scripts/show-dashboard-url.sh