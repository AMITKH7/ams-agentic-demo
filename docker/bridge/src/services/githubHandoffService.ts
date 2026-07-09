import { GitHubAdapter, GitHubIssueResponse } from "../adapters/github";

export type GitHubHandoffInput = {
  incidentNumber: string;
  shortDescription: string;
  ciName: string;
  selectedJira: string;
  approvedBy: string;
  triagePack: string;
};

export type GitHubHandoffResult = {
  issue: GitHubIssueResponse;
  title: string;
  body: string;
};

function buildIssueTitle(input: GitHubHandoffInput): string {
  return `AMS Handoff - ${input.incidentNumber} - ${input.shortDescription}`;
}

function buildIssueBody(input: GitHubHandoffInput): string {
  return `# AMS GitHub / Copilot Handoff

## Human Gate

This handoff was manually approved by:

\`${input.approvedBy}\`

Code remediation must not be merged automatically. Any pull request created from this issue must remain a draft until reviewed.

## Incident Context

| Field | Value |
|---|---|
| ServiceNow Incident | ${input.incidentNumber} |
| CI / Service | ${input.ciName} |
| Selected Jira | ${input.selectedJira} |
| Short Description | ${input.shortDescription} |

## Copilot Remediation Instructions

Use the triage pack below as the only source of incident context.

Expected remediation behavior:

1. Identify the checkout payment timeout handling path.1. Identify the ther timeout errors are retried through the standard retry wrapper.
1. Identify the checkout tial 1. Identify theme1. Identify theout e1. Identify the checkout tial 1. Identify theme1. Identify ule1. Identify the checkout tial 1. Identify theme1. Identify theout e1. Identill request as Draft.
7. Include references to ServiceNow incident ${input.incidentNumber} and Jira ${input.selectedJira}.

## Source Triage Pack

${input.triagePack}
`;
}

export async function createGitHubHandoff(
  github: GitHubAdapter,
  input: GitHubHandoffInput
): Promise<GitHubHandoffResult> {
  const title = buildIssueTitle(input);
  const body = buildIssueBody(input);

  const issue = await github.createIssue({
    title,
    body,
    labels: [
      "ams-triage",
      "copilot-handoff",
      "incident-remediation"
    ]
  });

  return {
    issue,
    title,
    body
  };
}
