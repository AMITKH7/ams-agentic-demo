import express from "express";
import { Manifest } from "../config/loader";
import { AmsTraceRecord, TraceStore } from "./traceStore";
import { metrics } from "./metricsService";

function isConfigured(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0 && value !== "FILL_IN_LATER");
}

function envCheck(name: string): { name: string; configured: boolean } {
  return {
    name,
    configured: isConfigured(process.env[name])
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function link(url: string | undefined, label: string): string {
  if (!url) {
    return `<span class="muted">Not available</span>`;
  }

  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function statusClass(status: string): string {
  if (status.includes("FAILED")) {
    return "status-failed";
  }

  if (status.includes("REUSED") || status.includes("PR_CREATED")) {
    return "status-good";
  }

  if (status.includes("CREATED") || status.includes("COMPLETED")) {
    return "status-good";
  }

  return "status-neutral";
}

function summarise(records: AmsTraceRecord[]) {
  return {
    totalTraces: records.length,
    githubIssues: records.filter(record => record.githubIssue?.html_url).length,
    githubPrs: records.filter(record => record.githubPr?.html_url).length,
    failed: records.filter(record => record.status === "FAILED").length,
    duplicateReused: records.filter(record => record.status === "GITHUB_HANDOFF_REUSED").length
  };
}

function renderTraceRows(records: AmsTraceRecord[]): string {
  if (records.length === 0) {
    return `
      <tr>
        <td colspan="8" class="muted">No trace records yet.</td>
      </tr>
    `;
  }

  return records
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(record => `
      <tr>
        <td><strong>${escapeHtml(record.incidentNumber)}</strong></td>
        <td>${escapeHtml(record.ciName || "not available")}</td>
        <td>${escapeHtml(record.selectedJira || "not available")}</td>
        <td><span class="pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
        <td>${link(record.githubIssue?.html_url, record.githubIssue ? `#${record.githubIssue.number}` : "Not available")}</td>
        <td>${link(record.githubPr?.html_url, record.githubPr ? `#${record.githubPr.number}` : "Not available")}</td>
        <td>${escapeHtml(record.updatedAt)}</td>
        <td>${escapeHtml(record.traceId || "not available")}</td>
      </tr>
    `)
    .join("\n");
}

function renderEventRows(records: AmsTraceRecord[]): string {
  const events = records
    .flatMap(record =>
      (record.events || []).map(event => ({
        incidentNumber: record.incidentNumber,
        ...event
      }))
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 12);

  if (events.length === 0) {
    return `
      <tr>
        <td colspan="5" class="muted">No recent events yet.</td>
      </tr>
    `;
  }

  return events
    .map(event => `
      <tr>
        <td>${escapeHtml(event.timestamp)}</td>
        <td><strong>${escapeHtml(event.incidentNumber)}</strong></td>
        <td>${escapeHtml(event.action)}</td>
        <td><span class="pill ${event.status === "failure" ? "status-failed" : "status-good"}">${escapeHtml(event.status)}</span></td>
        <td>${escapeHtml(event.message || "")}</td>
      </tr>
    `)
    .join("\n");
}

function renderDashboard(manifest: Manifest, traceStore: TraceStore): string {
  const records = traceStore.list();
  const summary = summarise(records);
  const now = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AMS Agentic Bridge Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #17202a;
      background: #f5f7fb;
    }

    body {
      margin: 0;
      padding: 28px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
    }

    h2 {
      margin: 28px 0 12px 0;
      font-size: 18px;
    }

    .subtitle {
      color: #52616f;
      font-size: 14px;
      line-height: 1.5;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }

    .card {
      background: white;
      border: 1px solid #e1e7ef;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }

    .metric-label {
      color: #64748b;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 28px;
      font-weight: 700;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid #e1e7ef;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }

    th, td {
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid #edf2f7;
      font-size: 13px;
      vertical-align: top;
    }

    th {
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    tr:last-child td {
      border-bottom: none;
    }

    a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }

    a:hover {
      text-decoration: underline;
    }

    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .status-good {
      background: #e8f7ee;
      color: #166534;
    }

    .status-failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .status-neutral {
      background: #e5e7eb;
      color: #374151;
    }

    .muted {
      color: #64748b;
    }

    .top-links {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .top-links a {
      background: white;
      border: 1px solid #e1e7ef;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
    }

    .footer {
      margin-top: 24px;
      color: #64748b;
      font-size: 12px;
    }

    @media (max-width: 900px) {
      .grid {
        grid-template-columns: repeat(2, minmax(140px, 1fr));
      }

      .header {
        display: block;
      }

      .top-links {
        justify-content: flex-start;
        margin-top: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>AMS Agentic Bridge Dashboard</h1>
      <div class="subtitle">
        Project: <strong>${escapeHtml(manifest.project.name)}</strong> ·
        Maturity: <strong>${escapeHtml(manifest.project.maturity)}</strong> ·
        Generated: <strong>${escapeHtml(now)}</strong>
      </div>
      <div class="subtitle">
        Local observability view for incident triage, GitHub handoff, Copilot PR traceability, and duplicate prevention.
      </div>
    </div>

    <div class="top-links">
      <a href="/health" target="_blank">Health</a>
      <a href="/ready" target="_blank">Readiness</a>
      <a href="/metrics" target="_blank">Metrics</a>
      <a href="/live" target="_blank">Liveness</a>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="metric-label">Trace records</div>
      <div class="metric-value">${summary.totalTraces}</div>
    </div>
    <div class="card">
      <div class="metric-label">GitHub issues</div>
      <div class="metric-value">${summary.githubIssues}</div>
    </div>
    <div class="card">
      <div class="metric-label">Copilot PRs</div>
      <div class="metric-value">${summary.githubPrs}</div>
    </div>
    <div class="card">
      <div class="metric-label">Duplicates prevented</div>
      <div class="metric-value">${summary.duplicateReused}</div>
    </div>
    <div class="card">
      <div class="metric-label">Failed traces</div>
      <div class="metric-value">${summary.failed}</div>
    </div>
  </div>

  <h2>Trace records</h2>
  <table>
    <thead>
      <tr>
        <th>Incident</th>
        <th>CI / Service</th>
        <th>Jira</th>
        <th>Status</th>
        <th>GitHub Issue</th>
        <th>Copilot PR</th>
        <th>Updated</th>
        <th>Trace ID</th>
      </tr>
    </thead>
    <tbody>
      ${renderTraceRows(records)}
    </tbody>
  </table>

  <h2>Recent events</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Incident</th>
        <th>Action</th>
        <th>Status</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody>
      ${renderEventRows(records)}
    </tbody>
  </table>

  <div class="footer">
    Local dashboard only. Production observability should move to Grafana Cloud, Azure Monitor, or the client-approved observability platform.
  </div>
</body>
</html>`;
}

export function registerObservabilityRoutes(
  app: express.Express,
  manifest: Manifest,
  traceStore: TraceStore
): void {
  app.get("/live", (_req, res) => {
    res.json({
      status: "alive",
      service: "ams-bridge",
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString()
    });
  });

  app.get("/ready", (_req, res) => {
    const checks = [
      {
        name: "manifest_loaded",
        configured: Boolean(manifest?.project?.name)
      },
      {
        name: "trace_store_available",
        configured: Array.isArray(traceStore.list())
      },
      envCheck("BRIDGE_INTERNAL_KEY"),
      envCheck("SNOW_INSTANCE"),
      envCheck("SNOW_USER"),
      envCheck("SNOW_PASSWORD"),
      envCheck("ATLASSIAN_EMAIL"),
      envCheck("ATLASSIAN_TOKEN"),
      envCheck("ATLASSIAN_CLOUD_ID"),
      envCheck("GITHUB_PAT")
    ];

    const ready = checks.every(check => check.configured);

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      service: "ams-bridge",
      project: manifest.project.name,
      traceRecords: traceStore.list().length,
      checks,
      time: new Date().toISOString()
    });
  });

  app.get("/metrics", (_req, res) => {
    metrics.setGauge("ams_trace_records_total", traceStore.list().length);
    metrics.setGauge("ams_process_uptime_seconds", Math.round(process.uptime()));

    res.type("text/plain");
    res.send(metrics.toPrometheus());
  });

  app.get("/dashboard", (_req, res) => {
    res.type("html");
    res.send(renderDashboard(manifest, traceStore));
  });
}