export type TriageWorkNotesInput = {
  traceId: string;
  incidentNumber: string;
  ciName: string;
  analysisMode: string;
  aiEnhanced: boolean;
  aiProvider?: string;
  aiError?: string;
  selectedJira: string;
  dynamicSearchQuery?: string;
  triagePack: string;
};

export type GitHubHandoffCreatedInput = {
  traceId: string;
  incidentNumber: string;
  approvedBy: string;
  selectedJira: string;
  githubIssueUrl: string;
};

export type GitHubHandoffReusedInput = {
  traceId: string;
  incidentNumber: string;
  approvedBy: string;
  selectedJira?: string;
  githubIssueUrl: string;
  githubPrUrl?: string;
};

export type CopilotPrDetectedInput = {
  traceId: string;
  incidentNumber: string;
  selectedJira?: string;
  githubIssueUrl?: string;
  prUrl: string;
  prNumber: number;
  prState?: string;
  draft?: boolean;
  branch?: string;
  action: string;
  merged?: boolean;
};

export function buildTriageCompletedWorkNotes(input: TriageWorkNotesInput): string {
  return [
    `AMS Agentic Triage completed.`,
    ``,
    `Traceability`,
    `- Trace ID: ${input.traceId}`,
    `- Source Incident: ${input.incidentNumber}`,
    `- Mapped CI / Service: ${input.ciName}`,
    `- Primary Jira: ${input.selectedJira}`,
    input.dynamicSearchQuery ? `- Dynamic Search Query: ${input.dynamicSearchQuery}` : undefined,
    ``,
    `Analysis Summary`,
    `- Analysis Mode: ${input.analysisMode}`,
    `- AI Enhanced: ${input.aiEnhanced ? "Yes" : "No"}`,
    `- AI Provider: ${input.aiProvider || "none"}`,
    input.aiError ? `- AI Error: ${input.aiError}` : undefined,
    ``,
    `Governance Status`,
    `- Human Gate 1: Pending. Engineer must review triage before GitHub/Copilot handoff.`,
    `- Human Gate 2: Not started. Required before any code merge.`,
    `- Auto-merge: Not allowed.`,
    ``,
    `Source-Grounded Triage Pack`,
    input.triagePack
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function buildGitHubHandoffCreatedWorkNotes(input: GitHubHandoffCreatedInput): string {
  return [
    `AMS GitHub/Copilot handoff created.`,
    ``,
    `Traceability`,
    `- Trace ID: ${input.traceId}`,
    `- Source Incident: ${input.incidentNumber}`,
    `- Selected Jira: ${input.selectedJira}`,
    `- GitHub Issue: ${input.githubIssueUrl}`,
    ``,
    `Governance Status`,
    `- Human Gate 1: Completed by ${input.approvedBy}.`,
    `- Human Gate 2: Required before Copilot/code remediation can be merged.`,
    `- Duplicate Prevention: Not applicable. New GitHub issue created.`,
    `- Auto-merge: Not allowed.`,
    ``,
    `Next Action`,
    `- Assign or confirm Copilot remediation from the GitHub issue.`,
    `- Review any generated pull request before merge.`
  ].join("\n");
}

export function buildGitHubHandoffReusedWorkNotes(input: GitHubHandoffReusedInput): string {
  return [
    `AMS GitHub/Copilot handoff reused.`,
    ``,
    `Traceability`,
    `- Trace ID: ${input.traceId}`,
    `- Source Incident: ${input.incidentNumber}`,
    `- Selected Jira: ${input.selectedJira || "not available"}`,
    `- Existing GitHub Issue: ${input.githubIssueUrl}`,
    input.githubPrUrl ? `- Existing Copilot PR: ${input.githubPrUrl}` : undefined,
    ``,
    `Governance Status`,
    `- Human Gate 1: Already completed. Existing handoff reused.`,
    `- Human Gate 2: Required before Copilot/code remediation can be merged.`,
    `- Duplicate Prevention: Applied. No new GitHub issue was created.`,
    `- Auto-merge: Not allowed.`,
    ``,
    `Next Action`,
    `- Continue review from the existing GitHub issue / PR.`
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function buildCopilotPrDetectedWorkNotes(input: CopilotPrDetectedInput): string {
  return [
    `AMS Copilot remediation PR detected.`,
    ``,
    `Traceability`,
    `- Trace ID: ${input.traceId}`,
    `- Webhook Action: ${input.action}`,
    `- Source Incident: ${input.incidentNumber}`,
    `- Selected Jira: ${input.selectedJira || "not available"}`,
    input.githubIssueUrl ? `- GitHub Issue: ${input.githubIssueUrl}` : undefined,
    `- Copilot PR: ${input.prUrl}`,
    `- PR Number: #${input.prNumber}`,
    ``,
    `Pull Request Status`,
    `- PR State: ${input.prState || "not available"}`,
    `- Draft: ${input.draft === true ? "Yes" : "No"}`,
    input.branch ? `- Branch: ${input.branch}` : undefined,
    input.merged !== undefined ? `- Merged: ${input.merged ? "Yes" : "No"}` : undefined,
    ``,
    `Governance Status`,
    `- Human Gate 2: Required. Engineer must review validation evidence before merge.`,
    `- Auto-merge: Not allowed.`,
    ``,
    `Validation Expected`,
    `- npm test`,
    `- npm run build`,
    `- Confirm retry is limited to transient timeout errors.`,
    `- Confirm validation/business errors are not retried.`
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}