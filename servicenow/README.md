# ServiceNow Configuration — AMS Agentic Triage Demo

## System Properties

Create these records in `sys_properties.list`.

### Property 1

| Field | Value |
|---|---|
| Name | ams.bridge.url |
| Type | string |
| Value | Cloudflare Tunnel URL, for example https://xxxx.trycloudflare.com |
| Read roles | admin |
| Write roles | admin |

### Property 2

| Field | Value |
|---|---|
| Name | ams.bridge.key |
| Type | string |
| Value | Same value as BRIDGE_INTERNAL_KEY from local .env |
| Read roles | admin |
| Write roles | admin |

## Script Include

Create Script Include:

| Field | Value |
|---|---|
| Name | AMSBridgeClient |
| Application | Global |
| Active | true |
| Client callable / Glide AJAX | false |

Script source:

`servicenow/AMSBridgeClient.script-include.js`

## UI Action

Create UI Action:

| Field | Value |
|---|---|
| Name | Run AMS Triage |
| Table | Incident [incident] |
| Active | true |
| Form button | true |
| Show insert | false |
| Show update | true |
| Client | false |
| Action name| Action name| Action name| Action name| Action name|ren| Action n= '' |

ScriScriScriScriScriScriScriScriScriScriScriScriSn.jScriScriScriSed ScriScriScriScriorm button:

Run AMS Triage

Expected message:

AMS triage completed. Trace ID: AMS-INC..., Mode: dynamic, Jira: KAN-1

Expected work notes:

- Analysis Mode: dynamic
- AI Enhanced: No
- Primary Jira: KAN-1
- Fallback Jira Used: No
- Confidence: 0.95
- Jira evidence: KAN-1, KAN-5, KAN-2
- Confluence evidence: SOP, RCA, Known Errors, Runbooks
