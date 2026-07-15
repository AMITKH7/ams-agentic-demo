# Optional OpenAI Refinement

## Purpose

OpenAI is an optional refinement layer.

It improves readability of:

- ServiceNow triage notes
- GitHub/Copilot handoff issue body

It does not replace source evidence.

## Default Mode

```yaml
ai_enhance:
  enabled: false
```

Behavior:

```text
No OpenAI call.
Deterministic source-grounded output is used.
```

## Enabled Mode

```yaml
ai_enhance:
  enabled: true
  provider: openai
```

Behavior:

```text
Jira/Confluence evidence is fetched first.
Bridge builds deterministic triage pack.
OpenAI refines the wording.
Source evidence is preserved.
```

## Fine-Grained Flags

```yaml
ai_enhance:
  refine:
    servicenow_triage_notes: true
    github_handoff_issue: true
    copilot_guardrails: true
```

## Fallback Behavior

If OpenAI is enabled but unavailable:

```text
Fallback to deterministic output.
Do not fail the workflow.
Do not block ServiceNow update.
Do not create unsafe remediation.
```

## ServiceNow Indicators

ServiceNow work notes show:

```text
Optional AI Refinement
- OpenAI Triage Refinement: Yes/No
- AI Provider: openai/none
- AI Fallback Reason: ...
- Fallback Used: Deterministic source-grounded triage pack
```

## GitHub Handoff Preview

Use:

```bash
./scripts/run-handoff-preview.sh INC0010001 amit.khandelwal
```

This validates the generated issue body without creating a GitHub issue.

## Client Positioning

OpenAI is client-controlled.

Clients can run the asset in:

- deterministic-only mode
- AI-refined mode
- fallback-safe mode