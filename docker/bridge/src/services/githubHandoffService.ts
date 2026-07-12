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

## Human Gate 1

This handoff was manually approved by:

\`${input.approvedBy}\`

Code remediation must not be merged automatically. Any pull request created from this issue must remain draft/open until reviewed by an engineer.

## Incident Context

| Field | Value |
|---|---|
| ServiceNow Incident | ${input.incidentNumber} |
| CI / Service | ${input.ciName} |
| Selected Jira | ${input.selectedJira} |
| Short Description | ${input.shortDescription} |

## Copilot Remediation Instructions

Use the triage pack below as incident context.

Expected remediation behavior:

1. Locate the checkout payment confirmation path.
2. Retry only transient payment gateway timeout errors.
3. Do not retry validation, card-decline, or business errors.
4. Use a small bounded retry count.
5. Keep retry logic isolated and unit-testable.
6. Add or update automated tests.
7. Run validation before completion:
   - npm test
   - npm run build
8. Create a pull request for human review.
9. Do not auto-merge.
10. Include references to ServiceNow incident ${input.incidentNumber} and Jira ${input.selectedJira}.

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