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
  const relatedObjects = objects.filter(item => item.raw?.key !== primaryRaw.key);

  const primaryDescription = cleanText(primaryRaw.description);

  const problem =
    extractField(primaryDescription, "Issue:") ||
    extractField(primaryDescription, "Problem:") ||
    primaryDescription ||
    "Not available.";

  const rootCause =
    extractField(primaryDescription, "Root Cause:") ||
    "Not explicitly available in the primary Jira item.";

  const resolution =
    extractField(primaryDescription, "Resolution:") ||
    "Not explicitly available in the primary Jira item.";

  const developerFix =
    extractField(primaryDescription, "Developer Fix:") ||
    "Not explicitly available in the primary Jira item.";

  const relatedRows = relatedObjects
    .map(item => {
      const raw = item.raw || {};
      const key = cleanText(raw.key);
      const summary = cleanText(raw.summary);
      const issueType = cleanText(raw.issueType?.name || "Work item");
      const status = cleanText(raw.jiraStatus?.name || "Unknown");
      const relevance = deriveRelevance(summary, cleanText(raw.description));

      return `| ${key} | ${issueType} | ${status} | ${summary} | ${relevance} |`;
    })
    .join("\n");

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