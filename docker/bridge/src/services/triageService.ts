import type {
  AtlassianSearchResult,
  DynamicAtlassianContext,
  FetchedAtlassianResult
} from "../adapters/atlassian";

type JiraRaw = {
  key?: string;
  summary?: string;
  description?: string;
  webUrl?: string;
  createdAt?: string;
  resolvedAt?: string | null;
  assignee?: { name?: string };
  reporter?: { name?: string };
  jiraStatus?: { name?: string };
  issueType?: { name?: string };
};

type JiraObject = {
  ari?: string;
  type?: string;
  raw?: JiraRaw;
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function tableCell(value: unknown): string {
  return cleanText(value)
    .replace(/\n/g, " ")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: unknown, max = 280): string {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function getObjects(hydratedObjectsPayload: any): JiraObject[] {
  return asArray(hydratedObjectsPayload?.data?.data?.objects);
}

function extractField(description: string, fieldName: string): string {
  const lines = description.split("\n");
  const fieldIndex = lines.findIndex(
    line => line.trim().toLowerCase() === fieldName.toLowerCase()
  );

  if (fieldIndex === -1) return "";

  const collected: string[] = [];

  for (let i = fieldIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (/^[A-Za-z ]+:$/.test(line.trim()) && collected.length > 0) {
      break;
    }

    if (line.trim().length > 0) {
      collected.push(line.trim());
    }
  }

  return collected.join(" ");
}

function extractLooseField(text: string, fieldNames: string[]): string {
  for (const fieldName of fieldNames) {
    const regex = new RegExp(`${fieldName}\\s*:?\\s*([\\s\\S]{1,600})`, "i");
    const match = text.match(regex);

    if (match?.[1]) {
      const value = match[1]
        .split(/\n[A-Z][A-Za-z ]{2,40}\s*:/)[0]
        .trim();

      if (value) return truncate(value, 500);
    }
  }

  return "";
}

function deriveRelevance(summary: string, description: string): string {
  const text = `${summary} ${description}`.toLowerCase();

  if (text.includes("retry") || text.includes("timeout")) {
    return "Relevant to payment timeout and retry handling.";
  }

  if (text.includes("graphql") || text.includes("mutation")) {
    return "Relevant to GraphQL payment mutation regression.";
  }

  if (text.includes("rollback") || text.includes("deployment")) {
    return "Relevant to rollback or deployment validation.";
  }

  if (text.includes("latency") || text.includes("downstream")) {
    return "Relevant to downstream dependency latency.";
  }

  return "Related historical work item discovered by Teamwork Graph.";
}

function confidenceScore(dynamicContext: DynamicAtlassianContext): number {
  let score = 0.5;

  if (dynamicContext.jiraResults.length > 0) score += 0.15;
  if (dynamicContext.confluenceResults.length > 0) score += 0.15;
  if (dynamicContext.confluenceResults.length >= 3) score += 0.05;
  if (dynamicContext.objectAris.length > 1) score += 0.1;

  const evidenceText = dynamicContext.confluenceResults
    .map(item => `${item.title || ""} ${item.text || ""}`)
    .join(" ")
    .toLowerCase();

  if (
    evidenceText.includes("runbook") ||
    evidenceText.includes("rca") ||
    evidenceText.includes("known error") ||
    evidenceText.includes("sop")
  ) {
    score += 0.05;
  }

  if (dynamicContext.usedFallbackJira) {
    score -= 0.15;
  }

  return Math.max(0.1, Math.min(0.95, Number(score.toFixed(2))));
}

function fetchedPayloadText(item: FetchedAtlassianResult): string {
  if (item.error) return item.error;

  if (typeof item.payload === "string") return item.payload;

  const text =
    item.payload?.text ||
    item.payload?.content ||
    item.payload?.body ||
    item.payload?.result?.content?.[0]?.text;

  if (text) return cleanText(text);

  try {
    return JSON.stringify(item.payload);
  } catch {
    return "";
  }
}

function searchResultRows(results: AtlassianSearchResult[]): string {
  return results
    .map((item, index) => {
      return `| ${index + 1} | ${tableCell(item.type || "unknown")} | ${tableCell(item.title)} | ${truncate(item.text, 180)} | ${tableCell(item.url)} |`;
    })
    .join("\n");
}

function confluenceEvidenceRows(dynamicContext: DynamicAtlassianContext): string {
  return dynamicContext.confluenceResults
    .map((item, index) => {
      const fetched = dynamicContext.fetchedConfluence.find(
        fetchedItem => fetchedItem.source.id === item.id
      );

      const content = fetched ? fetchedPayloadText(fetched) : item.text;
      const title = item.title || "Untitled Confluence page";

      let evidenceType = "Knowledge page";
      const lower = `${title} ${content}`.toLowerCase();

      if (lower.includes("runbook")) evidenceType = "Runbook";
      else if (lower.includes("rca")) evidenceType = "RCA";
      else if (lower.includes("known error")) evidenceType = "Known Error";
      else if (lower.includes("sop")) evidenceType = "SOP";

      return `| ${index + 1} | ${evidenceType} | ${tableCell(title)} | ${truncate(content, 220)} | ${tableCell(item.url)} |`;
    })
    .join("\n");
}

function jiraEvidenceRows(dynamicContext: DynamicAtlassianContext): string {
  const rows = dynamicContext.jiraResults.map((item, index) => {
    return `| ${index + 1} | ${tableCell(item.title)} | ${truncate(item.text, 220)} | ${tableCell(item.url)} |`;
  });

  return rows.join("\n");
}

function relatedJiraRows(hydratedObjectsPayload: any, primaryKey?: string): string {
  const objects = getObjects(hydratedObjectsPayload);

  return objects
    .filter(item => item.raw?.key !== primaryKey)
    .map(item => {
      const raw = item.raw || {};
      const key = tableCell(raw.key);
      const summary = tableCell(raw.summary);
      const issueType = tableCell(raw.issueType?.name || "Work item");
      const status = tableCell(raw.jiraStatus?.name || "Unknown");
      const relevance = deriveRelevance(summary, cleanText(raw.description));

      return `| ${key} | ${issueType} | ${status} | ${summary} | ${relevance} |`;
    })
    .join("\n");
}

function deriveRootCause(dynamicContext: DynamicAtlassianContext, primaryDescription: string): string {
  const combinedEvidence = [
    primaryDescription,
    ...dynamicContext.confluenceResults.map(item => item.text || ""),
    ...dynamicContext.fetchedConfluence.map(item => fetchedPayloadText(item))
  ].join("\n");

  return (
    extractField(primaryDescription, "Root Cause:") ||
    extractLooseField(combinedEvidence, ["Root Cause", "Likely Cause", "Cause"]) ||
    "The evidence points to a checkout payment timeout pattern. The most likely cause should be validated using payment gateway latency, checkout-service logs, and retry-wrapper configuration."
  );
}

function deriveResolution(dynamicContext: DynamicAtlassianContext, primaryDescription: string): string {
  const combinedEvidence = [
    primaryDescription,
    ...dynamicContext.confluenceResults.map(item => item.text || ""),
    ...dynamicContext.fetchedConfluence.map(item => fetchedPayloadText(item))
  ].join("\n");

  return (
    extractField(primaryDescription, "Resolution:") ||
    extractLooseField(combinedEvidence, ["Resolution", "Recommended Resolution", "Fix", "Solution"]) ||
    "Validate payment gateway latency, confirm timeout retry handling is enabled, verify retry wrapper configuration, and review recent deployment or GraphQL payment changes."
  );
}

function deriveProblem(primaryDescription: string, incidentShortDescription: string): string {
  return (
    extractField(primaryDescription, "Issue:") ||
    extractField(primaryDescription, "Problem:") ||
    cleanText(incidentShortDescription) ||
    primaryDescription ||
    "Not available."
  );
}

export function buildTriagePack(params: {
  incidentNumber: string;
  ciName: string;
  issueKey: string;
  contextPayload: any;
  hydratedObjectsPayload: any;
}): string {
  const objects = getObjects(params.hydratedObjectsPayload);
  const primary =
    objects.find(item => item.raw?.key === params.issueKey) ||
    objects[0];

  const primaryRaw = primary?.raw || {};
  const relatedRows = relatedJiraRows(params.hydratedObjectsPayload, primaryRaw.key);

  const primaryDescription = cleanText(primaryRaw.description);

  const problem = deriveProblem(primaryDescription, "");
  const rootCause = deriveRootCause(
    {
      query: "",
      results: [],
      jiraResults: [],
      confluenceResults: [],
      fetchedConfluence: [],
      bestJiraIssueKey: params.issueKey,
      objectAris: [],
      usedFallbackJira: false
    },
    primaryDescription
  );
  const resolution = deriveResolution(
    {
      query: "",
      results: [],
      jiraResults: [],
      confluenceResults: [],
      fetchedConfluence: [],
      bestJiraIssueKey: params.issueKey,
      objectAris: [],
      usedFallbackJira: false
    },
    primaryDescription
  );

  const developerFix =
    extractField(primaryDescription, "Developer Fix:") ||
    "Not explicitly available in the primary Jira item.";

  const objectCount = objects.length;
  const relatedCount = Math.max(objectCount - 1, 0);

  return `# AMS Triage Pack — ${cleanText(primaryRaw.summary || params.issueKey)}

## Incident Snapshot

| Field | Value |
|---|---|
| Service / CI | ${params.ciName} |
| Primary Jira | ${cleanText(primaryRaw.key || params.issueKey)} |
| Issue Type | ${cleanText(primaryRaw.issueType?.name || "Unknown")} |
| Status | ${cleanText(primaryRaw.jiraStatus?.name || "Unknown")} |
| Assignee | ${cleanText(primaryRaw.assignee?.name || "Unassigned")} |
| Reporter | ${cleanText(primaryRaw.reporter?.name || "Unknown")} |
| Created At | ${cleanText(primaryRaw.createdAt || "Unknown")} |
| Resolved At | ${cleanText(primaryRaw.resolvedAt || "Not resolved")} |
| Jira URL | ${cleanText(primaryRaw.webUrl || "Not available")} |

## Problem Statement

${problem}

## Root Cause

${rootCause}

## Resolution / Current Fix

${resolution}

## Developer Fix

${developerFix}

## Related Work Discovered by Teamwork Graph

Teamwork Graph returned ${objectCount} hydrated Jira objects, including ${relatedCount} related work item(s).

| Key | Type | Status | Summary | Relevance |
|---|---|---|---|---|
${relatedRows || "| None | - | - | No related work items found | - |"}

## Recommended Triage Actions

1. Confirm whether the current failure pattern is timeout-related, GraphQL-mapping-related, downstream-latency-related, or rollback/configuration-related.
2. Check checkout-service logs for payment confirmation timeout errors and retry attempt counts.
3. Validate that timeout errors are retried with exponential backoff.
4. Confirm validation failures and business-rule failures are not retried.
5. Review related Jira work items before creating duplicate fixes.
6. Confirm Jira status reflects the real delivery state.
7. If code remediation is required, hand off this triage pack to GitHub Copilot through a GitHub issue.

## Suggested RCA Summary

The available Jira context indicates a checkout payment timeout pattern linked to missing or insufficient retry handling around the downstream payment gateway. The recommended corrective action is retry handling with exponential backoff for timeout errors, supported by structured logging and regression coverage.

## Demo Proof

This triage pack was generated from Atlassian Rovo MCP using:

- getTeamworkGraphContext
- getTeamworkGraphObject

No direct Jira REST API was used.
`;
}

export function buildDynamicTriagePack(params: {
  incidentNumber: string;
  shortDescription: string;
  description: string;
  ciName: string;
  dynamicContext: DynamicAtlassianContext;
}): string {
  const dynamicContext = params.dynamicContext;
  const confidence = confidenceScore(dynamicContext);

  const hydratedObjects = getObjects(dynamicContext.hydratedObjects);
  const primary =
    hydratedObjects.find(item => item.raw?.key === dynamicContext.bestJiraIssueKey) ||
    hydratedObjects[0];

  const primaryRaw = primary?.raw || {};
  const primaryDescription = cleanText(primaryRaw.description);

  const problem = deriveProblem(primaryDescription, params.shortDescription);
  const rootCause = deriveRootCause(dynamicContext, primaryDescription);
  const resolution = deriveResolution(dynamicContext, primaryDescription);

  const relatedRows = relatedJiraRows(
    dynamicContext.hydratedObjects,
    primaryRaw.key || dynamicContext.bestJiraIssueKey
  );

  return `# AMS Dynamic Triage Pack — ${tableCell(params.shortDescription || dynamicContext.bestJiraIssueKey)}

## Incident Snapshot

| Field | Value |
|---|---|
| ServiceNow Incident | ${params.incidentNumber} |
| Service / CI | ${params.ciName} |
| Short Description | ${tableCell(params.shortDescription)} |
| Dynamic Search Query | ${tableCell(dynamicContext.query)} |
| Selected Jira Match | ${tableCell(dynamicContext.bestJiraIssueKey)} |
| Fallback Jira Used | ${dynamicContext.usedFallbackJira ? "Yes" : "No"} |
| Confidence | ${confidence} |
| AI Enhancement | Disabled - deterministic bridge pack |

## Problem Statement

${problem}

## Likely Root Cause

${rootCause}

## Recommended Resolution

${resolution}

## Confluence Evidence: Runbooks / SOPs / RCA / Known Errors

Rovo Search returned ${dynamicContext.confluenceResults.length} Confluence match(es). The bridge fetched the top matching pages where available.

| # | Type | Title | Evidence Snippet | URL |
|---|---|---|---|---|
${confluenceEvidenceRows(dynamicContext) || "| - | - | No Confluence evidence found | - | - |"}

## Jira Evidence: Similar Incidents / Fix Tasks

Rovo Search returned ${dynamicContext.jiraResults.length} Jira match(es).

| # | Title | Evidence Snippet | URL |
|---|---|---|---|
${jiraEvidenceRows(dynamicContext) || "| - | No Jira search result found | - | - |"}

## Related Jira Work from Teamwork Graph

Teamwork Graph expanded the selected Jira match and returned ${dynamicContext.objectAris.length} related object reference(s).

| Key | Type | Status | Summary | Relevance |
|---|---|---|---|---|
${relatedRows || "| None | - | - | No related Jira work found | - |"}

## Recommended Triage Actions

1. Check payment gateway latency during the incident window.
2. Check checkout-service logs for payment confirmation timeout errors.
3. Validate retry wrapper configuration for payment timeout errors.
4. Confirm timeout errors are retried with exponential backoff.
5. Confirm validation and business-rule failures are not retried.
6. Review recent deployment, rollback, or GraphQL payment mutation changes.
7. Use the Confluence runbook/RCA links above before starting remediation.
8. If code remediation is required, create a GitHub/Copilot handoff only after engineer approval.

## Suggested Work Notes Summary

Dynamic Rovo MCP search found matching Jira and Confluence evidence for the checkout payment timeout pattern. The most relevant evidence points to downstream payment gateway timeout and retry-wrapper validation. Recommended next action is to validate gateway latency, checkout-service logs, retry configuration, and recent deployment changes before proceeding to code remediation.

## Demo Proof

This triage pack was generated through the dynamic path:

- ServiceNow incident context
- Rovo MCP searchAtlassian for Jira + Confluence
- Rovo MCP fetchAtlassian for Confluence evidence
- Rovo MCP Teamwork Graph expansion for related Jira context
- Bridge deterministic triage pack generation
- ServiceNow work notes update
`;
}