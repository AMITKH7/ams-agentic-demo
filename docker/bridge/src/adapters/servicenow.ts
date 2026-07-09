import axios from "axios";
import { addTraceHeader } from "../security/tracing";
import { requireEnv } from "../security/vault";

export type ServiceNowIncident = {
  sys_id: string;
  number: string;
  short_description?: string;
  description?: string;
  cmdb_ci?: unknown;
  impact?: string;
  urgency?: string;
  priority?: string;
  state?: string;
  incident_state?: string;
  opened_at?: string;
  work_notes?: string;
};

export class ServiceNowAdapter {
  private instanceUrl: string;
  private authHeader: string;

  constructor(private traceHeaderName: string) {
    this.instanceUrl = requireEnv("SNOW_INSTANCE").replace(/\/$/, "");

    const user = requireEnv("SNOW_USER");
    const password = requireEnv("SNOW_PASSWORD");
    const basic = Buffer.from(`${user}:${password}`).toString("base64");

    this.authHeader = `Basic ${basic}`;
  }

  private headers(traceId: string): Record<string, string> {
    return addTraceHeader(
      {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": this.authHeader
      },
      this.traceHeaderName,
      traceId
    );
  }

  async getIncidentByNumber(
    incidentNumber: string,
    traceId: string
  ): Promise<ServiceNowIncident> {
    const response = await axios.get(`${this.instanceUrl}/api/now/table/incident`, {
      headers: this.headers(traceId),
      params: {
        sysparm_query: `number=${incidentNumber}`,
        sysparm_limit: "1",
        sysparm_fields: [
          "sys_id",
          "number",
          "short_description",
          "description",
          "cmdb_ci",
          "impact",
          "urgency",
          "priority",
          "state",
          "incident_state",
          "opened_at",
          "work_notes"
        ].join(",")
      },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `[servicenow] Incident lookup failed: HTTP ${response.status} ${JSON.stringify(response.data)}`
      );
    }

    const incident = response.data?.result?.[0];

    if (!incident) {
      throw new Error(`[servicenow] Incident not found: ${incidentNumber}`);
    }

    return incident as ServiceNowIncident;
  }

  async updateWorkNotes(
    sysId: string,
    workNotes: string,
    traceId: string
  ): Promise<ServiceNowIncident> {
    const response = await axios.patch(
      `${this.instanceUrl}/api/now/table/incident/${sysId}`,
      {
        work_notes: workNotes
      },
      {
        headers: this.headers(traceId),
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `[servicenow] Work notes update failed: HTTP ${response.status} ${JSON.stringify(response.data)}`
      );
    }

    return response.data?.result as ServiceNowIncident;
  }
}