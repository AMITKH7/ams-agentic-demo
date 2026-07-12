import express from "express";

type Labels = Record<string, string | number | boolean | undefined>;

type MetricPoint = {
  value: number;
  labels: Record<string, string>;
};

function normaliseLabels(labels: Labels = {}): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(labels)) {
    if (value !== undefined) {
      result[key] = String(value);
    }
  }

  return result;
}

function labelsKey(labels: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(labels)
      .sort()
      .reduce<Record<string, string>>((acc, key) => {
        acc[key] = labels[key];
        return acc;
      }, {})
  );
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return "";
  }

  const rendered = entries
    .map(([key, value]) => `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");

  return `{${rendered}}`;
}

class MetricsService {
  private counters = new Map<string, MetricPoint>();
  private gauges = new Map<string, MetricPoint>();
  private observations = new Map<string, MetricPoint>();

  constructor() {
    this.initialiseDefaults();
  }

  private initialiseDefaults(): void {
    [
      "ams_triage_requests_total",
      "ams_triage_success_total",
      "ams_triage_failure_total",
      "ams_github_handoff_requests_total",
      "ams_github_handoff_failure_total",
      "ams_github_issue_created_total",
      "ams_github_duplicate_prevented_total",
      "ams_servicenow_update_success_total",
      "ams_servicenow_update_failure_total",
      "ams_rovo_search_success_total",
      "ams_rovo_search_failure_total",
      "ams_webhook_received_total",
      "ams_webhook_failure_total"
    ].forEach(name => this.increment(name, {}, 0));
  }

  increment(name: string, labels: Labels = {}, amount = 1): void {
    const safeLabels = normaliseLabels(labels);
    const key = `${name}:${labelsKey(safeLabels)}`;
    const existing = this.counters.get(key);

    this.counters.set(key, {
      value: (existing?.value || 0) + amount,
      labels: safeLabels
    });
  }

  setGauge(name: string, value: number, labels: Labels = {}): void {
    const safeLabels = normaliseLabels(labels);
    const key = `${name}:${labelsKey(safeLabels)}`;

    this.gauges.set(key, {
      value,
      labels: safeLabels
    });
  }

  observe(name: string, value: number, labels: Labels = {}): void {
    const safeLabels = normaliseLabels(labels);

    const countKey = `${name}_count:${labelsKey(safeLabels)}`;
    const sumKey = `${name}_sum:${labelsKey(safeLabels)}`;
    const maxKey = `${name}_max:${labelsKey(safeLabels)}`;

    const count = this.observations.get(countKey);
    const sum = this.observations.get(sumKey);
    const max = this.observations.get(maxKey);

    this.observations.set(countKey, {
      value: (count?.value || 0) + 1,
      labels: safeLabels
    });

    this.observations.set(sumKey, {
      value: (sum?.value || 0) + value,
      labels: safeLabels
    });

    this.observations.set(maxKey, {
      value: Math.max(max?.value || 0, value),
      labels: safeLabels
    });
  }

  recordAuditAction(action: string, status: string, latencyMs?: number): void {
    if (action === "TRIAGE_STARTED") {
      this.increment("ams_triage_requests_total");
    }

    if (action === "TRIAGE_COMPLETED") {
      this.increment("ams_triage_success_total");
    }

    if (action === "TRIAGE_FAILED") {
      this.increment("ams_triage_failure_total");
    }

    if (action === "GITHUB_HANDOFF_REQUESTED") {
      this.increment("ams_github_handoff_requests_total");
    }

    if (action === "GITHUB_HANDOFF_FAILED") {
      this.increment("ams_github_handoff_failure_total");
    }

    if (action === "GITHUB_ISSUE_CREATED") {
      this.increment("ams_github_issue_created_total");
    }

    if (action === "GITHUB_DUPLICATE_PREVENTED") {
      this.increment("ams_github_duplicate_prevented_total");
    }

    if (action === "SERVICENOW_UPDATE_COMPLETED") {
      this.increment("ams_servicenow_update_success_total");
    }

    if (action === "SERVICENOW_UPDATE_FAILED") {
      this.increment("ams_servicenow_update_failure_total");
    }

    if (action === "GITHUB_WEBHOOK_RECEIVED") {
      this.increment("ams_webhook_received_total");
    }

    if (action === "GITHUB_WEBHOOK_FAILED") {
      this.increment("ams_webhook_failure_total");
    }

    if (latencyMs !== undefined) {
      this.observe("ams_audit_action_latency_ms", latencyMs, {
        action,
        status
      });
    }
  }

  httpMiddleware(): express.RequestHandler {
    return (req, res, next) => {
      const startedAt = Date.now();

      res.on("finish", () => {
        const latencyMs = Date.now() - startedAt;

        this.increment("ams_http_requests_total", {
          method: req.method,
          path: req.path,
          status_code: res.statusCode
        });

        this.observe("ams_http_request_latency_ms", latencyMs, {
          method: req.method,
          path: req.path,
          status_code: res.statusCode
        });
      });

      next();
    };
  }

  toPrometheus(): string {
    const lines: string[] = [];

    lines.push("# HELP ams_bridge_info AMS Bridge static info");
    lines.push("# TYPE ams_bridge_info gauge");
    lines.push('ams_bridge_info{service="ams-bridge"} 1');

    for (const [key, metric] of this.counters.entries()) {
      const name = key.split(":")[0];
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${renderLabels(metric.labels)} ${metric.value}`);
    }

    for (const [key, metric] of this.gauges.entries()) {
      const name = key.split(":")[0];
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${renderLabels(metric.labels)} ${metric.value}`);
    }

    for (const [key, metric] of this.observations.entries()) {
      const name = key.split(":")[0];
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${renderLabels(metric.labels)} ${metric.value}`);
    }

    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsService();