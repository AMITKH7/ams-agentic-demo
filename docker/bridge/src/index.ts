import express from "express";
import { loadManifest, findService } from "./config/loader";
import { AtlassianAdapter } from "./adapters/atlassian";
import { buildTriagePack } from "./services/triageService";
import { makeTraceId } from "./security/tracing";
import { requireEnv } from "./security/vault";

const app = express();
app.use(express.json({ limit: "1mb" }));

const manifest = loadManifest();
let atlassian: AtlassianAdapter;

function requireInternalKey(req: express.Request, res: express.Response, next: express.NextFunction) {
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    project: manifest.project.name,
    maturity: manifest.project.maturity,
    atlassian_enabled: manifest.atlassian.enabled,
    github_enabled: manifest.github.enabled,
    time: new Date().toISOString()
  });
});

app.post("/api/v1/knowledge/search", requireInternalKey, async (req, res) => {
  const {
    incidentNumber = "INC-DEMO",
    shortDescription = "",
    ciName = "checkout-service",
    jiraIssueKey
  } = req.body || {};

  const traceId = makeTraceId(incidentNumber);
  const service = findService(manifest, ciName);

  if (!service) {
    return res.status(400).json({
      traceId,
      degrade: true,
      reason: "no_service_map",
      message: `No service map found for CI: ${ciName}`
    });
  }

  if (!manifest.atlassian.enabled) {
    return res.status(400).json({
      traceId,
      degrade: true,
      reason: "atlassian_disabled"
    });
  }

  const issueKey = jiraIssueKey || manifest.atlassian.default_jira_issue;

  try {
    console.log(`[bridge] Knowledge search started | traceId=${traceId} | issue=${issueKey}`);

    const triageContext = await atlassian.getTriageContextForJiraIssue(
      issueKey,
      traceId
    );

    const triagePack = buildTriagePack({
      incidentNumber,
      ciName,
      issueKey,
      contextPayload: triageContext.context,
      hydratedObjectsPayload: triageContext.hydratedObjects
    });

    console.log(`[bridge] Knowledge search completed | traceId=${traceId} | issue=${issueKey}`);

    res.json({
      traceId,
      degrade: false,
      incidentNumber,
      shortDescription,
      ciName,
      jiraIssueKey: issueKey,
      serviceEntry: service,
      objectAris: triageContext.objectAris,
      triagePack
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

async function start() {
  console.log(`[bridge] Starting project=${manifest.project.name}`);

  atlassian = new AtlassianAdapter(manifest);
  await atlassian.init();

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