import express from "express";
import { loadManifest, findService } from "./config/loader";
import { AtlassianAdapter } from "./adapters/atlassian";
import { ServiceNowAdapter } from "./adapters/servicenow";
import { GitHubAdapter } from "./adapters/github";
import { buildTriagePack, buildDynamicTriagePack } from "./services/triageService";
import { enhanceTriagePackIfEnabled } from "./services/aiEnhancementService";
import { createGitHubHandoff } from "./services/githubHandoffService";
import { makeTraceId } from "./security/tracing";
import { requireEnv } from "./security/vault";

const app = express();
app.use(express.json({ limit: "1mb" }));

const manifest = loadManifest();

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

  try {
    console.log(`[bridge] ServiceNow triage started | traceId=${traceId} | incident=${incidentNumber}`);

    const incident = await servicenow.getIncidentByNumber(incidentNumber, traceId);

    const ciName = extractCiName(
      incident.description,
      "checkout-service"
    );

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
      workNotesUpdated: true,
      triagePack: result.triagePack
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

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

  if (!manifest.github_handoff.enabled) {
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

    const workNotes = [
      `AMS GitHub/Copilot handoff created.`,
      ``,
      `Trace ID: ${traceId}`,
      `Source Incident: ${incident.number}`,
      `Approved By: ${approvedBy}`,
      `Selected Jira: ${result.issueKey}`,
      `GitHub Issue: ${handoff.issue.html_url}`,
      ``,
      `Human Gate 2 required before Copilot/code remediation proceeds.`
    ].join("\n");

    await servicenow.updateWorkNotes(incident.sys_id, workNotes, traceId);

    console.log(`[bridge] GitHub handoff completed | traceId=${traceId} | issue=${handoff.issue.html_url}`);

    res.json({
      traceId,
      degrade: false,
      incidentNumber: incident.number,
      sysId: incident.sys_id,
      ciName,
      jiraIssueKey: result.issueKey,
      approvedBy,
      githubIssue: handoff.issue,
      workNotesUpdated: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

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