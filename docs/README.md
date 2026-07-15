# AMS Agentic Ecosystem Documentation

## Local Documentation

| Document | Purpose |
|---|---|
| [Local Runbook](local-runbook.md) | How to run the demo locally |
| [Local Architecture](local-architecture.md) | Component and flow explanation |
| [Idempotency](idempotency.md) | Trace store and duplicate prevention |
| [Optional OpenAI Refinement](optional-openai-refinement.md) | AI flag behavior and fallback |
| [Observability](observability.md) | Health, metrics, dashboard |
| [GitHub Webhook](github-webhook.md) | PR webhook and ServiceNow trace update |
| [Troubleshooting](troubleshooting.md) | Common errors and fixes |

## Core Demo

```text
ServiceNow Incident INC0010001
→ Dynamic Jira/Confluence triage
→ Optional OpenAI refinement
→ Human Gate 1
→ GitHub Issue #3
→ Copilot PR #4
→ GitHub webhook
→ ServiceNow work notes
→ Dashboard evidence
```

## Default Mode

```yaml
ai_enhance:
  enabled: false
```

The asset works without OpenAI by default.