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
  githubIssueAiEnhanced?: boolean;
  githubIssueAiProvider?: string;
  githubIssueAiError?: string;
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

function yesNo(value?: boolean): string {
  return value ? "Yes" : "No";
}

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
    `Optional AI Refinement`,
    `- OpenAI Triage Refinement: ${yesNo(input.aiEnhanced)}`,
    `- AI Provider: ${input.aiProvider || "none"}`,
    input.aiError ? `- AI Fallback Reason: ${input.aiError}` : undefined,
    input.aiError ? `- Fallback Used: Deterministic source-grounded triage pack` : undefined,
    ``,
    `Analysis Summary`,
    `- Analysis Mode: ${input.analysisMode}`,
    `- Source of Truth: Jira / Confluence evidence retrieved through Atlassian Rovo MCP`,
    `- OpenAI Role: Optional wording refinement only; not source of truth`,
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
    `Optional AI Refinement`,
    `- GitHub/Copilot Issue Body Refined by OpenAI: ${yesNo(input.githubIssueAiEnhanced)}`,
    `- AI Provider: ${input.githubIssueAiProvider || "none"}`,
    input.githubIssueAiError ? `- AI Fallback Reason: ${input.githubIssueAiError}` : undefined,
    input.githubIssueAiError ? `- Fallback Used: Deterministic GitHub issue body` : undefined,
    ``,
    `Copilot Remediation Guardrails`,
    `- Use GitHub issue context and repository instructions.`,
    `- Keep the code change small and focused.`,
    `- Do not change unrelated files.`,
    `- Do not weaken tests.`,
    `- Retry must be limited to transient timeout errors only.`,
    `- Validation/business errors must not be retried.`,
    `- Create PR for human review.`,
    `- Auto-merge is not allowed.`,
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
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
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
    `Optional AI Refinement`,
    `- GitHub/Copilot Issue Body Refined by OpenAI: Not re-run; existing handoff reused.`,
    `- OpenAI Role: Optional wording refinement only; not source of truth.`,
    ``,
    `Copilot Remediation Guardrails`,
    `- Continue from existing GitHub issue / PR.`,
    `- Keep the code change small and focused.`,
    `- Do not weaken tests.`,
    `- Retry must be limited to transient timeout errors only.`,
    `- Validation/business errors must not be retried.`,
    `- Human review is required before merge.`,
    `- Auto-merge is not allowed.`,
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
    `Copilot Remediation Guardrails`,
    `- PR must remain human-reviewed.`,
    `- Retry must be limited to transient timeout errors only.`,
    `- Validation/business errors must not be retried.`,
    `- Tests must not be weakened.`,
    `- Auto-merge is not allowed.`,
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