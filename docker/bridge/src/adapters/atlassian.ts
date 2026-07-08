import axios from "axios";
import { Manifest } from "../config/loader";
import { withRetry } from "../resilience/retry";
import { addTraceHeader } from "../security/tracing";
import { requireEnv } from "../security/vault";

type JsonRpcBody = {
  jsonrpc: "2.0";
  id?: string;
  method: string;
  params?: Record<string, unknown>;
};

export class AtlassianAdapter {
  private authHeader = "";
  private sessionId = "";
  private mcpUrl = "";

  constructor(private manifest: Manifest) {}

  async init(): Promise<void> {
    const email = requireEnv("ATLASSIAN_EMAIL");
    const token = requireEnv("ATLASSIAN_TOKEN");

    this.mcpUrl =
      process.env.ATLASSIAN_MCP_URL ||
      this.manifest.atlassian.rovo_mcp_url ||
      "https://mcp.atlassian.com/v1/mcp";

    const basic = Buffer.from(`${email}:${token}`).toString("base64");
    this.authHeader = `Basic ${basic}`;

    await this.initializeSession();

    console.log("[atlassian] MCP adapter initialized");
    console.log(`[atlassian] Session ID: ${this.sessionId ? "available" : "missing"}`);
  }

  private baseHeaders(traceId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": this.authHeader
    };

    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    if (traceId) {
      return addTraceHeader(
        headers,
        this.manifest.observability.trace_header,
        traceId
      );
    }

    return headers;
  }

  private parseMcpResponse(data: unknown): any {
    if (typeof data !== "string") {
      return data;
    }

    const dataLines = data
      .split("\n")
      .filter(line => line.startsWith("data:"))
      .map(line => line.replace(/^data:\s*/, "").trim())
      .filter(Boolean);

    if (dataLines.length > 0) {
      return JSON.parse(dataLines[dataLines.length - 1]);
    }

    return JSON.parse(data);
  }

  private extractToolTextPayload(mcpResponse: any): any {
    const text = mcpResponse?.result?.content?.[0]?.text;

    if (!text) {
      return mcpResponse;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async initializeSession(): Promise<void> {
    const body: JsonRpcBody = {
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "ams-bridge",
          version: "1.0.0"
        }
      }
    };

    const response = await axios.post(this.mcpUrl, body, {
      headers: this.baseHeaders(),
      responseType: "text",
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `[atlassian] MCP initialize failed: HTTP ${response.status} ${response.data}`
      );
    }

    const headerSessionId =
      response.headers["mcp-session-id"] ||
      response.headers["Mcp-Session-Id"] ||
      response.headers["MCP-Session-ID"];

    this.sessionId = Array.isArray(headerSessionId)
      ? headerSessionId[0]
      : String(headerSessionId || "").trim();

    if (!this.sessionId) {
      throw new Error("[atlassian] MCP initialize did not return mcp-session-id");
    }

    await axios.post(
      this.mcpUrl,
      {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      },
      {
        headers: this.baseHeaders(),
        responseType: "text",
        validateStatus: () => true
      }
    );
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    traceId: string
  ): Promise<any> {
    const body: JsonRpcBody = {
      jsonrpc: "2.0",
      id: `${toolName}-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await withRetry(
      async () => {
        const result = await axios.post(this.mcpUrl, body, {
          headers: this.baseHeaders(traceId),
          responseType: "text",
          validateStatus: () => true
        });

        if (result.status < 200 || result.status >= 300) {
          throw new Error(`HTTP ${result.status}: ${result.data}`);
        }

        return result;
      },
      `atlassian-mcp-${toolName}-${traceId}`
    );

    const parsed = this.parseMcpResponse(response.data);

    if (parsed?.result?.isError) {
      const text = parsed?.result?.content?.[0]?.text || JSON.stringify(parsed);
      throw new Error(`[atlassian] Tool ${toolName} failed: ${text}`);
    }

    return parsed;
  }

  async getJiraWorkItemContext(
    issueKeyOrUrl: string,
    traceId: string,
    first = 20
  ): Promise<any> {
    const response = await this.callTool(
      "getTeamworkGraphContext",
      {
        cloudId: this.manifest.atlassian.cloud_id,
        objectType: "JiraWorkItem",
        objectIdentifier: issueKeyOrUrl,
        detailLevel: "full",
        first
      },
      traceId
    );

    return this.extractToolTextPayload(response);
  }

  async hydrateObjects(objects: string[], traceId: string): Promise<any> {
    const uniqueObjects = Array.from(new Set(objects)).slice(0, 25);

    const response = await this.callTool(
      "getTeamworkGraphObject",
      {
        cloudId: this.manifest.atlassian.cloud_id,
        objects: uniqueObjects
      },
      traceId
    );

    return this.extractToolTextPayload(response);
  }

  collectJiraObjectAris(contextPayload: any, limit = 5): string[] {
    const root = contextPayload?.data?.data;
    const aris: string[] = [];

    const primaryAri = root?.object?.ari;
    if (primaryAri) {
      aris.push(primaryAri);
    }

    const relationships = root?.relationships || [];

    for (const relationship of relationships) {
      const targets = relationship?.targets || [];

      for (const target of targets) {
        if (target?.type === "JiraWorkItem" && target?.ari) {
          aris.push(target.ari);
        }
      }
    }

    return Array.from(new Set(aris)).slice(0, limit);
  }

  async getTriageContextForJiraIssue(
    issueKeyOrUrl: string,
    traceId: string
  ): Promise<{
    context: any;
    hydratedObjects: any;
    objectAris: string[];
  }> {
    const context = await this.getJiraWorkItemContext(issueKeyOrUrl, traceId, 20);
    const objectAris = this.collectJiraObjectAris(context, 5);
    const hydratedObjects = await this.hydrateObjects(objectAris, traceId);

    return {
      context,
      hydratedObjects,
      objectAris
    };
  }
}