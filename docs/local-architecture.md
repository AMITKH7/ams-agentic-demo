# AMS Agentic Ecosystem — Local Architecture

## High-Level Flow

```text
ServiceNow Incident UI
  → Run AMS Triage button
  → ServiceNow Script Include AMSBridgeClient
  → AMS Bridge API
  → Atlassian Rovo MCP
  → Jira + Confluence evidence
  → Optional OpenAI refinement
  → ServiceNow work notes
  → Human Gate 1
  → GitHub issue handoff
  → GitHub Copilot draft PR
  → GitHub PR webhook
  → ServiceNow work notes update
  → Dashboard / Metrics
```

## Component Responsibilities

| Component | Responsibility |
|---|---|
| ServiceNow | System of record, incident workflow, work notes, human gates |
| AMS Bridge | Orchestration, evidence retrieval, traceability, governance |
| Atlassian Rovo MCP | Jira, Confluence, and Teamwork Graph retrieval |
| Jira | Historical incidents and related engineering tasks |
| Confluence | Runbooks, SOPs, RCA, and known errors |
| OpenAI | Optional wording refinement only |
| GitHub | Engineering handoff and issue tracking |
| GitHub Copilot | Draft remediation PR generation |
| Dashboard | Local trace and observability proof |
| Trace Store | Local demo state and idempotency |

## Source of Truth

OpenAI is not the source of truth.

The source-grounded evidence comes from:

```text
ServiceNow Incident
Jira issues
Confluence runbooks / SOP / RCA / known errors
Teamwork Graph relations
GitHub issue / PR metadata
```

## Optional AI Design

```text
ai_enhance.enabled = false
→ deterministic behavior only

ai_enhance.enabled = true
→ OpenAI refines wording
→ source evidence is preserved
→ deterministic fallback is used on error
```

## Human Gate Design

| Gate | Location | Purpose |
|---|---|---|
| Human Gate 1 | ServiceNow before GitHub handoff | Engineer approves remediation handoff |
| Human Gate 2 | GitHub PR / ServiceNow work notes | Engineer validates PR before merge |

## No Auto-Merge Principle

The asset does not auto-merge code.

Copilot can produce a draft/open PR, but engineer review is mandatory before merge.