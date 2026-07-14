import { GitHubAdapter, GitHubIssueResponse } from "../adapters/github";
import { Manifest } from "../config/loader";
import { refineGitHubHandoffBodyIfEnabled } from "./aiEnhancementService";

export type GitHubHandoffInput = {
  incidentNumber: string;
  shortDescription: string;
  ciName: string;
  selectedJira: string;
  approvedBy: string;
  triagePack: string;
};

export type GitHubHandoffBodyPreviewResult = {
  title: string;
  body: string;
  deterministicBody: string;
  aiEnhanced: boolean;
  aiProvider: string;
  aiError?: string;
};

export type GitHubHandoffResult = {
  issue: GitHubIssueResponse;
  title: string;
  body: string;
  aiEnhanced: boolean;
  aiProvider: string;
  aiError?: string;
};

function buildIssueTitle(input: GitHubHandoffInput): string {
  return `AMS Handoff - ${input.incidentNumber} - ${input.shortDescription}`;
}

function buildDeterministicIssueBody(input: GitHubHandoffInput): string {
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

## Engineering Problem

The triage evidence indicates a checkout payment confirmation timeout pattern.

The expected remediation is to add safe, bounded retry behavior only for transient payment gateway timeout failures.

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

## Acceptance Criteria

- Retry applies only to transient payment gateway timeout errors.
- Validation, card-decline, and business errors are not retried.
- Retry count is bounded.
- Tests prove successful retry after transient timeout.
- Tests prove non-transient errors are not retried.
- Pull request remains available for human review.
- No auto-merge.

## Source Triage Pack

${input.triagePack}
`;
}

export async function buildGitHubHandoffBodyPreview(
  manifest: Manifest,
  input: GitHubHandoffInput
): Promise<GitHubHandoffBodyPreviewResult> {
  const title = buildIssueTitle(input);
  const deterministicBody = buildDeterministicIssueBody(input);

  const aiBodyResult = await refineGitHubHandoffBodyIfEnabled(manifest, {
    incidentNumber: input.incidentNumber,
    shortDescription: input.shortDescription,
    ciName: input.ciName,
    selectedJira: input.selectedJira,
    approvedBy: input.approvedBy,
    triagePack: input.triagePack,
    originalBody: deterministicBody
  });

  return {
    title,
    body: aiBodyResult.body,
    deterministicBody,
    aiEnhanced: aiBodyResult.aiEnhanced,
    aiProvider: aiBodyResult.provider,
    aiError: aiBodyResult.error
  };
}

export async function createGitHubHandoff(
  github: GitHubAdapter,
  manifest: Manifest,
  input: GitHubHandoffInput
): Promise<GitHubHandoffResult> {
  const preview = await buildGitHubHandoffBodyPreview(manifest, input);

  const issue = await github.createIssue({
    title: preview.title,
    body: preview.body,
    labels: [
      "ams-triage",
      "copilot-handoff",
      "incident-remediation"
    ]
  });

  return {
    issue,
    title: preview.title,
    body: preview.body,
    aiEnhanced: preview.aiEnhanced,
    aiProvider: preview.aiProvider,
    aiError: preview.aiError
  };
}