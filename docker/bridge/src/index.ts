import express from "express";
import { loadManifest, findService } from "./config/loader";
import { AtlassianAdapter } from "./adapters/atlassian";
import { ServiceNowAdapter } from "./adapters/servicenow";
import { GitHubAdapter } from "./adapters/github";
import { buildTriagePack, buildDynamicTriagePack } from "./services/triageService";
import { enhanceTriagePackIfEnabled } from "./services/aiEnhancementService";
import { createGitHubHandoff } from "./services/githubHandoffService";
import { TraceStore } from "./services/traceStore";
import { AuditEventService } from "./services/auditEventService";
import { metrics } from "./services/metricsService";
import { registerObservabilityRoutes } from "./services/observabilityRoutes";
import { registerGitHubWebhookRoutes } from "./services/githubWebhookRoutes";
import { makeTraceId } from "./security/tracing";
import { requireEnv } from "./security/vault";


const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(metrics.httpMiddleware());

const traceStore = new TraceStore(
  process.env.TRACE_STORE_PATH || "/app/data/ams-traces.json"
);
const auditEvents = new AuditEventService(traceStore);

const manifest = loadManifest();
registerObservabilityRoutes(app, manifest, traceStore);

let atlassian: AtlassianAdapter;
let servicenow: ServiceNowAdapter;
let github: GitHubAdapter;

function requireInternalKey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const expected = requireEnv("BRIDGE_INTERNAL_KEY");
  const provided = req.header("x-ams-internal-key");

  if (!provided || provided !== expected) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid x-ams-internal-key header"
    });
  }

  next();
}

function extractCiName(description: string | undefined, fallback = "checkout-service"): string {
  if (!description) {
    return fallback;
  }

  const match = description.match(/CI:\s*([a-zA-Z0-9._-]+)/i);
  return match?.[1] || fallback;
}

function summariseDynamicContext(dynamicContext: any) {
  if (!dynamicContext) {
    return undefined;
  }

  return {
    query: dynamicContext.query,
    selectedJiraIssue: dynamicContext.bestJiraIssueKey,
    fallbackJiraUsed: dynamicContext.usedFallbackJira,
    jiraMatchCount: dynamicContext.jiraResults?.length || 0,
    confluenceMatchCount: dynamicContext.confluenceResults?.length || 0,
    topJiraMatches: (dynamicContext.jiraResults || []).slice(0, 5).map((item: any) => ({
      title: item.title,
      url: item.url,
      type: item.type
    })),
    topConfluenceMatches: (dynamicContext.confluenceResults || []).slice(0, 5).map((item: any) => ({
      title: item.title,
      url: item.url,
      type: item.type
    }))
  };
}

async function generateTriagePack(params: {
  incidentNumber: string;
  shortDescription: string;
  description?: string;
  ciName: string;
  jiraIssueKey?: string;
  traceId: string;
}) {
  const service = findService(manifest, params.ciName);

  if (!service) {
    throw new Error(`No service map found for CI: ${params.ciName}`);
  }

  const shouldUseDynamicSearch =
    manifest.atlassian.dynamic_search.enabled &&
    !params.jiraIssueKey;

  if (shouldUseDynamicSearch) {
    console.log(
      `[bridge] Dynamic Rovo search enabled | traceId=${params.traceId} | ci=${params.ciName}`
    );

    const dynamicContext = await atlassian.getDynamicAtlassianContext({
      shortDescription: params.shortDescription,
      description: params.description || "",
      ciName: params.ciName,
      traceId: params.traceId
    });

    let baseTriagePack = buildDynamicTriagePack({
      incidentNumber: params.incidentNumber,
      shortDescription: params.shortDescription,
      description: params.description || "",
      ciName: params.ciName,
      dynamicContext
    });

    baseTriagePack = baseTriagePack.replace(
      "AI Enhancement | Disabled - deterministic bridge pack",
      `AI Enhancement | ${
        manifest.ai_enhance.enabled
          ? "Enabled - OpenAI optional narrative"
          : "Disabled - deterministic bridge pack"
      }`
    );

    const aiResult = await enhanceTriagePackIfEnabled(manifest, {
      incidentNumber: params.incidentNumber,
      shortDescription: params.shortDescription,
      ciName: params.ciName,
      analysisMode: "dynamic",
      selectedJira: dynamicContext.bestJiraIssueKey,
      triagePack: baseTriagePack
    });

    return {
      mode: "dynamic",
      issueKey: dynamicContext.bestJiraIssueKey,
      service,
      objectAris: dynamicContext.objectAris || [],
      triagePack: aiResult.triagePack,
      aiEnhanced: aiResult.aiEnhanced,
      aiProvider: aiResult.provider,
      aiError: aiResult.error,
      dynamicContext,
      triageContext: undefined
    };
  }

  const issueKey =
    params.jiraIssueKey ||
    manifest.atlassian.dynamic_search.fallback_jira_issue;

  console.log(
    `[bridge] Seeded Jira triage enabled | traceId=${params.traceId} | issue=${issueKey}`
  );

  const triageContext = await atlassian.getTriageContextForJiraIssue(
    issueKey,
    params.traceId
  );

  const baseTriagePack = buildTriagePack({
    incidentNumber: params.incidentNumber,
    ciName: params.ciName,
    issueKey,
    contextPayload: triageContext.context,
    hydratedObjectsPayload: triageContext.hydratedObjects
  });

  const aiResult = await enhanceTriagePackIfEnabled(manifest, {
    incidentNumber: params.incidentNumber,
    shortDescription: params.shortDescription,
    ciName: params.ciName,
    analysisMode: "seeded",
    selectedJira: issueKey,
    triagePack: baseTriagePack
  });

  return {
    mode: "seeded",
    issueKey,
    service,
    objectAris: triageContext.objectAris || [],
    triagePack: aiResult.triagePack,
    aiEnhanced: aiResult.aiEnhanced,
    aiProvider: aiResult.provider,
    aiError: aiResult.error,
    dynamicContext: undefined,
    triageContext
  };
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    project: manifest.project.name,
    maturity: manifest.project.maturity,
    atlassian_enabled: manifest.atlassian.enabled,
    dynamic_search_enabled: manifest.atlassian.dynamic_search.enabled,
    ai_enhance_enabled: manifest.ai_enhance.enabled,
    ai_provider: manifest.ai_enhance.provider,
    ai_model: manifest.ai_enhance.model,
    github_handoff_enabled: manifest.github_handoff.enabled,
    github_handoff_provider: manifest.github_handoff.provider,
    github_handoff_repo: manifest.github_handoff.repo,
    trace_store_path: process.env.TRACE_STORE_PATH || "/app/data/ams-traces.json",
    trace_records: traceStore.list().length,
    time: new Date().toISOString()
  });
});

app.post("/api/v1/knowledge/search", requireInternalKey, async (req, res) => {
  const {
    incidentNumber = "INC-DEMO",
    shortDescription = "",
    description = "",
    ciName = "checkout-service",
    jiraIssueKey
  } = req.body || {};

  const traceId = makeTraceId(incidentNumber);
  const startedAt = Date.now();

  auditEvents.emit({
    incidentNumber,
    traceId,
    action: "KNOWLEDGE_SEARCH_STARTED",
    status: "started",
    details: {
      ciName,
      jiraIssueKey
    }
  });

  try {
    console.log(`[bridge] Knowledge search started | traceId=${traceId}`);

    const result = await generateTriagePack({
      incidentNumber,
      shortDescription,
      description,
      ciName,
      jiraIssueKey,
      traceId
    });

    auditEvents.emit({
      incidentNumber,
      traceId,
      action: "KNOWLEDGE_SEARCH_COMPLETED",
      status: "success",
      latencyMs: Date.now() - startedAt,
      details: {
        mode: result.mode,
        selectedJira: result.issueKey
      }
    });

    console.log(`[bridge] Knowledge search completed | traceId=${traceId}`);

    res.json({
      traceId,
      degrade: false,
      analysisMode: result.mode,
      aiEnhanced: result.aiEnhanced,
      aiProvider: result.aiProvider,
      aiError: result.aiError,
      incidentNumber,
      shortDescription,
      description,
      ciName,
      jiraIssueKey: result.issueKey,
      serviceEntry: result.service,
      objectAris: result.objectAris,
      dynamicSearch: summariseDynamicContext(result.dynamicContext),
      triagePack: result.triagePack
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    auditEvents.emit({
      incidentNumber,
      traceId,
      action: "KNOWLEDGE_SEARCH_FAILED",
      status: "failure",
      message,
      latencyMs: Date.now() - startedAt
    });

    console.error(`[bridge] Knowledge search failed | traceId=${traceId} | ${message}`);

    res.status(500).json({
      traceId,
      degrade: true,
      error: "knowledge_search_failed",
      detail: message
    });
  }
});

app.post("/api/v1/incident/triage", requireInternalKey, async (req, res) => {
  const {
    incidentNumber,
    jiraIssueKey
  } = req.body || {};

  if (!incidentNumber) {
    return res.status(400).json({
      error: "missing_incident_number",
      message: "incidentNumber is required"
    });
  }

  const traceId = makeTraceId(incidentNumber);
  const startedAt = Date.now();

  auditEvents.emit({
    incidentNumber,
    traceId,
    action: "TRIAGE_STARTED",
    status: "started",
    details: {
      jiraIssueKey
    }
  });

  try {
    console.log(`[bridge] ServiceNow triage started | traceId=${traceId} | incident=${incidentNumber}`);

    const incident = await servicenow.getIncidentByNumber(incidentNumber, traceId);

    const ciName = extractCiName(
      incident.description,
      "checkout-service"
    );

    traceStore.upsert({
      incidentNumber: incident.number,
      incidentSysId: incident.sys_id,
      traceId,
      ciName,
      status: "TRIAGE_STARTED"
    });

    const result = await generateTriagePack({
      incidentNumber: incident.number,
      shortDescription: incident.short_description || "",
      description: incident.description || "",
      ciName,
      jiraIssueKey,
      traceId
    });

    const dynamicSummary = summariseDynamicContext(result.dynamicContext);

    const workNotes = [
      `AMS Agentic Triage completed.`,
      ``,
      `Trace ID: ${traceId}`,
      `Source Incident: ${incident.number}`,
      `Mapped CI: ${ciName}`,
      `Analysis Mode: ${result.mode}`,
      `AI Enhanced: ${result.aiEnhanced ? "Yes" : "No"}`,
      `AI Provider: ${result.aiProvider || "none"}`,
      result.aiError ? `AI Error: ${result.aiError}` : undefined,
      `Primary Jira: ${result.issueKey}`,
      dynamicSummary?.query ? `Dynamic Search Query: ${dynamicSummary.query}` : undefined,
      ``,
      result.triagePack
    ]
      .filter(line => line !== undefined)
      .join("\n");

    await servicenow.updateWorkNotes(
      incident.sys_id,
      workNotes,
      traceId
    );

    const traceRecord = traceStore.upsert({
      incidentNumber: incident.number,
      incidentSysId: incident.sys_id,
      traceId,
      ciName,
      selectedJira: result.issueKey,
      status: "TRIAGE_COMPLETED"
    });

    auditEvents.emit({
      incidentNumber: incident.number,
      traceId,
      action: "TRIAGE_COMPLETED",
      status: "success",
      latencyMs: Date.now() - startedAt,
      details: {
        mode: result.mode,
        selectedJira: result.issueKey,
        workNotesUpdated: true
      }
    });

    console.log(`[bridge] ServiceNow triage completed | traceId=${traceId} | incident=${incidentNumber}`);

    res.json({
      traceId,
      degrade: false,
      analysisMode: result.mode,
      aiEnhanced: result.aiEnhanced,
      aiProvider: result.aiProvider,
      aiError: result.aiError,
      incidentNumber: incident.number,
      sysId: incident.sys_id,
      ciName,
      jiraIssueKey: result.issueKey,
      serviceEntry: result.service,
      objectAris: result.objectAris,
      dynamicSearch: dynamicSummary,
      trace: traceRecord,
      workNotesUpdated: true,
      triagePack: result.triagePack
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    traceStore.upsert({
      incidentNumber,
      traceId,
      status: "FAILED",
      lastError: message
    });

    auditEvents.emit({
      incidentNumber,
      traceId,
      action: "TRIAGE_FAILED",
      status: "failure",
      message,
      latencyMs: Date.now() - startedAt
    });

    console.error(`[bridge] ServiceNow triage failed | traceId=${traceId} | ${message}`);

    res.status(500).json({
      traceId,
      degrade: true,
      error: "servicenow_triage_failed",
      detail: message
    });
  }
});

app.post("/api/v1/remediation/handoff", requireInternalKey, async (req, res) => {
  const {
    incidentNumber,
    approvedBy = "unknown",
    jiraIssueKey
  } = req.body || {};

  if (!incidentNumber) {
    return res.status(400).json({
      error: "missing_incident_number",
      message: "incidentNumber is required"
    });
  }

  const traceId = makeTraceId(`HANDOFF-${incidentNumber}`);
  const startedAt = Date.now();

  auditEvents.emit({
    incidentNumber,
    traceId,
    action: "GITHUB_HANDOFF_REQUESTED",
    status: "started",
    details: {
      approvedBy,
      jiraIssueKey
    }
  });

  if (!manifest.github_handoff.enabled) {
    auditEvents.emit({
      incidentNumber,
      traceId,
      action: "GITHUB_HANDOFF_DISABLED",
      status: "skipped",
      message: "GitHub/Copilot handoff is disabled"
    });

    return res.status(409).json({
      traceId,
      degrade: true,
      error: "github_handoff_disabled",
      message: "GitHub/Copilot handoff is disabled in demo.yaml. Set github_handoff.enabled=true to enable this endpoint."
    });
  }

  try {
    console.log(`[bridge] GitHub handoff started | traceId=${traceId} | incident=${incidentNumber}`);

    const incident = await servicenow.getIncidentByNumber(incidentNumber, traceId);
    const ciName = extractCiName(incident.description, "checkout-service");

    const existingTrace = traceStore.getByIncidentNumber(incident.number);

    if (existingTrace?.githubIssue?.html_url) {
      const reusedWorkNotes = [
        `AMS GitHub/Copilot handoff reused.`,
        ``,
        `Trace ID: ${traceId}`,
        `Source Incident: ${incident.number}`,
        `Approved By: ${approvedBy}`,
        `Selected Jira: ${existingTrace.selectedJira || jiraIssueKey || "not available"}`,
        `Existing GitHub Issue: ${existingTrace.githubIssue.html_url}`,
        existingTrace.githubPr?.html_url
          ? `Existing Copilot PR: ${existingTrace.githubPr.html_url}`
          : undefined,
        ``,
        `Duplicate prevention applied: no new GitHub issue was created.`,
        ``,
        `Human Gate 1 already completed: existing GitHub/Copilot handoff reused.`,
        `Human Gate 2 required before Copilot/code remediation proceeds.`
      ]
        .filter((line): line is string => line !== undefined)
        .join("\n");

      await servicenow.updateWorkNotes(incident.sys_id, reusedWorkNotes, traceId);

      const traceRecord = traceStore.upsert({
        incidentNumber: incident.number,
        incidentSysId: incident.sys_id,
        traceId,
        ciName,
        selectedJira: existingTrace.selectedJira || jiraIssueKey,
        githubIssue: existingTrace.githubIssue,
        githubPr: existingTrace.githubPr,
        status: "GITHUB_HANDOFF_REUSED"
      });

      auditEvents.emit({
        incidentNumber: incident.number,
        traceId,
        action: "GITHUB_DUPLICATE_PREVENTED",
        status: "success",
        latencyMs: Date.now() - startedAt,
        details: {
          githubIssue: existingTrace.githubIssue.html_url,
          githubPr: existingTrace.githubPr?.html_url
        }
      });

      console.log(`[bridge] GitHub handoff reused | traceId=${traceId} | issue=${existingTrace.githubIssue.html_url}`);

      return res.json({
        traceId,
        degrade: false,
        idempotent: true,
        reused: true,
        incidentNumber: incident.number,
        sysId: incident.sys_id,
        ciName,
        jiraIssueKey: existingTrace.selectedJira || jiraIssueKey,
        approvedBy,
        githubIssue: existingTrace.githubIssue,
        githubPr: existingTrace.githubPr,
        trace: traceRecord,
        workNotesUpdated: true
      });
    }

    const result = await generateTriagePack({
      incidentNumber: incident.number,
      shortDescription: incident.short_description || "",
      description: incident.description || "",
      ciName,
      jiraIssueKey,
      traceId
    });

    const handoff = await createGitHubHandoff(github, {
      incidentNumber: incident.number,
      shortDescription: incident.short_description || "",
      ciName,
      selectedJira: result.issueKey,
      approvedBy,
      triagePack: result.triagePack
    });

    const traceRecord = traceStore.upsert({
      incidentNumber: incident.number,
      incidentSysId: incident.sys_id,
      traceId,
      ciName,
      selectedJira: result.issueKey,
      githubIssue: {
        number: handoff.issue.number,
        html_url: handoff.issue.html_url,
        api_url: handoff.issue.api_url,
        title: handoff.issue.title
      },
      status: "GITHUB_ISSUE_CREATED"
    });

    const workNotes = [
      `AMS GitHub/Copilot handoff created.`,
      ``,
      `Trace ID: ${traceId}`,
      `Source Incident: ${incident.number}`,
      `Approved By: ${approvedBy}`,
      `Selected Jira: ${result.issueKey}`,
      `GitHub Issue: ${handoff.issue.html_url}`,
      ``,
      `Human Gate 1 completed: engineer approved GitHub/Copilot handoff.`,
      `Human Gate 2 required before Copilot/code remediation proceeds.`
    ].join("\n");

    await servicenow.updateWorkNotes(incident.sys_id, workNotes, traceId);

    auditEvents.emit({
      incidentNumber: incident.number,
      traceId,
      action: "GITHUB_ISSUE_CREATED",
      status: "success",
      latencyMs: Date.now() - startedAt,
      details: {
        githubIssue: handoff.issue.html_url,
        selectedJira: result.issueKey
      }
    });

    console.log(`[bridge] GitHub handoff completed | traceId=${traceId} | issue=${handoff.issue.html_url}`);

    res.json({
      traceId,
      degrade: false,
      idempotent: false,
      reused: false,
      incidentNumber: incident.number,
      sysId: incident.sys_id,
      ciName,
      jiraIssueKey: result.issueKey,
      approvedBy,
      githubIssue: handoff.issue,
      trace: traceRecord,
      workNotesUpdated: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    traceStore.upsert({
      incidentNumber,
      traceId,
      status: "FAILED",
      lastError: message
    });

    auditEvents.emit({
      incidentNumber,
      traceId,
      action: "GITHUB_HANDOFF_FAILED",
      status: "failure",
      message,
      latencyMs: Date.now() - startedAt
    });

    console.error(`[bridge] GitHub handoff failed | traceId=${traceId} | ${message}`);

    res.status(500).json({
      traceId,
      degrade: true,
      error: "github_handoff_failed",
      detail: message
    });
  }
});

async function start() {
  console.log(`[bridge] Starting project=${manifest.project.name}`);

  atlassian = new AtlassianAdapter(manifest);
  await atlassian.init();

  servicenow = new ServiceNowAdapter(manifest.observability.trace_header);
  github = new GitHubAdapter(manifest);

  registerGitHubWebhookRoutes(app, traceStore, auditEvents, servicenow);

  const port = Number(process.env.PORT || 3000);
  

  app.listen(port, () => {
    console.log(`[bridge] Running on http://localhost:${port}`);
    console.log(`[bridge] Health check: curl http://localhost:${port}/health`);
  });
}

start().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[bridge] Fatal startup error: ${message}`);
  process.exit(1);
});