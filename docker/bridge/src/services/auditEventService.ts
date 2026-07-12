import { metrics } from "./metricsService";
import { TraceEvent, TraceStore } from "./traceStore";

export class AuditEventService {
  constructor(private readonly traceStore: TraceStore) {}

  emit(input: {
    incidentNumber?: string;
    traceId?: string;
    action: string;
    status: TraceEvent["status"];
    message?: string;
    latencyMs?: number;
    details?: Record<string, unknown>;
  }): void {
    const event: TraceEvent = {
      timestamp: new Date().toISOString(),
      traceId: input.traceId,
      action: input.action,
      status: input.status,
      message: input.message,
      latencyMs: input.latencyMs,
      details: input.details
    };

    metrics.recordAuditAction(input.action, input.status, input.latencyMs);

    console.log(JSON.stringify({
      timestamp: event.timestamp,
      level: input.status === "failure" ? "error" : "info",
      traceId: input.traceId,
      incidentNumber: input.incidentNumber,
      action: input.action,
      status: input.status,
      message: input.message,
      latencyMs: input.latencyMs,
      details: input.details
    }));

    if (input.incidentNumber) {
      try {
        this.traceStore.appendEvent(input.incidentNumber, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          traceId: input.traceId,
          incidentNumber: input.incidentNumber,
          action: "AUDIT_EVENT_WRITE_FAILED",
          status: "failure",
          message
        }));
      }
    }
  }
}