import express from "express";
import { Manifest } from "../config/loader";
import { TraceStore } from "./traceStore";
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
}