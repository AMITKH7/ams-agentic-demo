import express from "express";
import { ServiceNowAdapter } from "../adapters/servicenow";
import { makeTraceId } from "../security/tracing";
import { AuditEventService } from "./auditEventService";
import { AmsTraceRecord, TraceStore } from "./traceStore";

type PullRequestPayload = {
  action?: string;
  pull_request?: {
    number?: number;
    html_url?: string;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    title?: string;
    body?: string;
    head?: {
      ref?: string;
    };
  };
  repository?: {
    full_name?: string;
  };
};

function textContainsIssueReference(text: string, issueNumber: number): boolean {
  const patterns = [
    `#${issueNumber}`,
    `issue ${issueNumber}`,
    `issues/${issueNumber}`
  ];

  return patterns.some(pattern => text.toLowerCase().includes(pattern.toLowerCase()));
}

function correlateTrace(
  records: AmsTraceRecord[],
  payload: PullRequestPayload
): AmsTraceRecord | undefined {
  const pr = payload.pull_request;

  const haystack = [
    pr?.title,
    pr?.body,
    pr?.head?.ref,
    pr?.html_url,
    payload.repository?.full_name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const record of records) {
    if (haystack.includes(record.incidentNumber.toLowerCase())) {
      return record;
    }
  }

  for (const record of records) {
    if (record.githubIssue?.number && textContainsIssueReference(haystack, record.githubIssue.number)) {
      return record;
    }
  }

  for (const record of records) {
    if (record.selectedJira && haystack.includes(record.selectedJira.toLowerCase())) {
      return record;
    }
  }

  if (records.length === 1) {
    return records[0];
  }

  return undefined;
}

function prStatusFromAction(
  action: string | undefined,
  merged: boolean | undefined
): "PR_CREATED" | "PR_UPDATED" | "PR_MERGED" | "PR_CLOSED" {
  if (action === "opened") {
    return "PR_CREATED";
  }

  if (action === "closed" && merged) {
    return "PR_MERGED";
  }

  if (action === "closed") {
    return "PR_CLOSED";
  }

  return "PR_UPDATED";
}

function buildPrWorkNotes(input: {
  record: AmsTraceRecord;
  traceId: string;
  action: string;
  prNumber: number;
  prUrl: string;
  prState?: string;
  draft?: boolean;
  branch?: string;
  merged?: boolean;
}): string {
  return [
    `AMS Copilot remediation PR detected.`,
    ``,
    `Trace ID: ${input.traceId}`,
    `Webhook Action: ${input.action}`,
    `Source Incident: ${input.record.incidentNumber}`,
    `Selected Jira: ${input.record.selectedJira || "not available"}`,
    input.record.githubIssue?.html_url
      ? `GitHub Issue: ${input.record.githubIssue.html_url}`
      : undefined,
    `Copilot PR: ${input.prUrl}`,
    `PR Number: #${input.prNumber}`,
    `PR State: ${input.prState || "not available"}`,
    `Draft: ${input.draft === true ? "Yes" : "No"}`,
    input.branch ? `Branch: ${input.branch}` : undefined,
    input.merged !== undefined ? `Merged: ${input.merged ? "Yes" : "No"}` : undefined,
    ``,
    `Human Gate 2 required: engineer must review validation evidence before merge.`
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function registerGitHubWebhookRoutes(
  app: express.Express,
  traceStore: TraceStore,
  auditEvents: AuditEventService,
  servicenow: ServiceNowAdapter
): void {
  app.post("/api/v1/github/webhook", async (req, res) => {
    const eventName = req.header("x-github-event") || "unknown";
    const deliveryId = req.header("x-github-delivery") || "manual-local-test";
    const payload = req.body as PullRequestPayload;
    const action = payload.action || "unknown";
    const startedAt = Date.now();

    if (eventName !== "pull_request") {
      auditEvents.emit({
        traceId: deliveryId,
        action: "GITHUB_WEBHOOK_IGNORED",
        status: "skipped",
        message: `Ignored GitHub event ${eventName}`,
        details: {
          eventName,
          action,
          deliveryId
        }
      });

      return res.json({
        degrade: false,
        ignored: true,
        reason: "unsupported_event",
        eventName,
        action
      });
    }

    const pr = payload.pull_request;

    if (!pr?.number || !pr.html_url) {
      auditEvents.emit({
        traceId: deliveryId,
        action: "GITHUB_WEBHOOK_FAILED",
        status: "failure",
        message: "Missing pull_request.number or pull_request.html_url",
        details: {
          eventName,
          action,
          deliveryId
        }
      });

      return res.status(400).json({
        degrade: true,
        error: "invalid_pull_request_payload",
        message: "pull_request.number and pull_request.html_url are required"
      });
    }

    const matchingTrace = correlateTrace(traceStore.list(), payload);

    if (!matchingTrace) {
      auditEvents.emit({
        traceId: deliveryId,
        action: "GITHUB_WEBHOOK_FAILED",
        status: "failure",
        message: "Could not correlate PR webhook to AMS trace",
        details: {
          eventName,
          action,
          deliveryId,
          prNumber: pr.number,
          prUrl: pr.html_url
        }
      });

      return res.status(404).json({
        degrade: true,
        error: "trace_not_found",
        message: "Could not correlate PR webhook to existing AMS trace",
        prNumber: pr.number,
        prUrl: pr.html_url
      });
    }

    const traceId = makeTraceId(`PR-${matchingTrace.incidentNumber}`);
    const status = prStatusFromAction(action, pr.merged);

    try {
      auditEvents.emit({
        incidentNumber: matchingTrace.incidentNumber,
        traceId,
        action: "GITHUB_WEBHOOK_RECEIVED",
        status: "started",
        details: {
          eventName,
          action,
          deliveryId,
          prNumber: pr.number,
          prUrl: pr.html_url
        }
      });

      const updatedTrace = traceStore.upsert({
        incidentNumber: matchingTrace.incidentNumber,
        incidentSysId: matchingTrace.incidentSysId,
        traceId,
        ciName: matchingTrace.ciName,
        selectedJira: matchingTrace.selectedJira,
        githubIssue: matchingTrace.githubIssue,
        githubPr: {
          number: pr.number,
          html_url: pr.html_url,
          state: pr.state,
          draft: pr.draft,
          branch: pr.head?.ref
        },
        status
      });

      const workNotes = buildPrWorkNotes({
        record: updatedTrace,
        traceId,
        action,
        prNumber: pr.number,
        prUrl: pr.html_url,
        prState: pr.state,
        draft: pr.draft,
        branch: pr.head?.ref,
        merged: pr.merged
      });

      const incident =
        updatedTrace.incidentSysId
          ? undefined
          : await servicenow.getIncidentByNumber(updatedTrace.incidentNumber, traceId);

      await servicenow.updateWorkNotes(
        updatedTrace.incidentSysId || incident!.sys_id,
        workNotes,
        traceId
      );

      auditEvents.emit({
        incidentNumber: updatedTrace.incidentNumber,
        traceId,
        action: "GITHUB_PR_TRACE_UPDATED",
        status: "success",
        latencyMs: Date.now() - startedAt,
        details: {
          eventName,
          action,
          deliveryId,
          prNumber: pr.number,
          prUrl: pr.html_url,
          status
        }
      });

      return res.json({
        degrade: false,
        correlated: true,
        traceId,
        incidentNumber: updatedTrace.incidentNumber,
        status,
        githubIssue: updatedTrace.githubIssue,
        githubPr: updatedTrace.githubPr,
        workNotesUpdated: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      traceStore.upsert({
        incidentNumber: matchingTrace.incidentNumber,
        traceId,
        status: "FAILED",
        lastError: message
      });

      auditEvents.emit({
        incidentNumber: matchingTrace.incidentNumber,
        traceId,
        action: "GITHUB_WEBHOOK_FAILED",
        status: "failure",
        message,
        latencyMs: Date.now() - startedAt,
        details: {
          eventName,
          action,
          deliveryId,
          prNumber: pr.number,
          prUrl: pr.html_url
        }
      });

      return res.status(500).json({
        degrade: true,
        error: "github_webhook_failed",
        detail: message
      });
    }
  });
}