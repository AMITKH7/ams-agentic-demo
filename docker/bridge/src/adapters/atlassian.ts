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

export type AtlassianSearchResult = {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  type?: string;
  metadata?: Record<string, unknown>;
};

export type FetchedAtlassianResult = {
  source: AtlassianSearchResult;
  payload?: any;
  error?: string;
};

export type DynamicAtlassianContext = {
  query: string;
  results: AtlassianSearchResult[];
  jiraResults: AtlassianSearchResult[];
  confluenceResults: AtlassianSearchResult[];
  fetchedConfluence: FetchedAtlassianResult[];
  bestJiraIssueKey: string;
  bestJiraSource?: AtlassianSearchResult;
  graphContext?: any;
  hydratedObjects?: any;
  objectAris: string[];
  usedFallbackJira: boolean;
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

  buildIncidentSearchQuery(params: {
    shortDescription?: string;
    description?: string;
    ciName?: string;
  }): string {
    const boostTerms = this.manifest.atlassian.dynamic_search.query_boost_terms || [];

    const raw = [
      params.ciName || "",
      params.shortDescription || "",
      params.description || "",
      ...boostTerms
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return raw.slice(0, 500);
  }

  async searchAtlassian(
    query: string,
    traceId: string
  ): Promise<AtlassianSearchResult[]> {
    const response = await this.callTool(
      "searchAtlassian",
      {
        cloudId: this.manifest.atlassian.cloud_id,
        query
      },
      traceId
    );

    const payload = this.extractToolTextPayload(response);
    const results = payload?.results || [];

    return Array.isArray(results) ? results : [];
  }

  async fetchAtlassian(
    source: AtlassianSearchResult,
    traceId: string
  ): Promise<FetchedAtlassianResult> {
    try {
      const response = await this.callTool(
        "fetchAtlassian",
        {
          cloudId: this.manifest.atlassian.cloud_id,
          id: source.id
        },
        traceId
      );

      return {
        source,
        payload: this.extractToolTextPayload(response)
      };
    } catch (error) {
      return {
        source,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private isJiraResult(result: AtlassianSearchResult): boolean {
    return (
      result.type === "issue" ||
      result.id?.includes(":jira:") ||
      Boolean(result.url?.includes("/browse/"))
    );
  }

  private isConfluenceResult(result: AtlassianSearchResult): boolean {
    return (
      result.type === "page" ||
      result.id?.includes(":confluence:") ||
      Boolean(result.url?.includes("/wiki/"))
    );
  }

  private extractJiraKey(result: AtlassianSearchResult): string | undefined {
    const fromUrl = result.url?.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)?.[1];
    if (fromUrl) {
      return fromUrl;
    }

    const fromTitle = result.title?.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
    if (fromTitle) {
      return fromTitle;
    }

    const fromText = result.text?.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
    return fromText;
  }
  
  private buildJiraJql(params: {
    shortDescription?: string;
    description?: string;
    ciName?: string;
  }): string {
    const project = this.manifest.atlassian.jira_project || "KAN";

    const combined = [
      params.ciName || "",
      params.shortDescription || "",
      params.description || ""
    ]
      .join(" ")
      .replace(/CI:\s*[a-zA-Z0-9._-]+/gi, " ")
      .replace(/[^a-zA-Z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    let searchPhrase = "checkout payment timeout";

    if (combined.includes("payment") && combined.includes("timeout")) {
      searchPhrase = "payment timeout";
    } else if (combined.includes("checkout") && combined.includes("timeout")) {
      searchPhrase = "checkout timeout";
    } else if (params.ciName) {
      searchPhrase = params.ciName;
    }

    return `project = ${project} AND text ~ "${searchPhrase}" ORDER BY updated DESC`;
  }

  private normaliseJiraSearchPayload(payload: any): AtlassianSearchResult[] {
    const rawIssues =
      payload?.issues ||
      payload?.data?.issues ||
      payload?.result?.issues ||
      payload?.data?.data?.issues ||
      [];

    if (!Array.isArray(rawIssues)) {
      return [];
    }

    return rawIssues.map((issue: any): AtlassianSearchResult => {
      const key = issue.key || issue.issueKey || issue.id || "UNKNOWN";
      const fields = issue.fields || issue;

      const summary =
        fields.summary ||
        issue.summary ||
        issue.title ||
        key;

      const description =
        fields.description ||
        issue.description ||
        issue.text ||
        "";

      const url =
        issue.url ||
        issue.webUrl ||
        (key !== "UNKNOWN"
          ? `https://${this.manifest.atlassian.cloud_id}/browse/${key}`
          : undefined);

      return {
        id: issue.id || key,
        title: `${key}: ${summary}`,
        text: typeof description === "string" ? description : JSON.stringify(description),
        url,
        type: "issue",
        metadata: {
          source: "searchJiraIssuesUsingJql",
          key
        }
      };
    });
  }

  async searchJiraIssuesUsingJql(
    jql: string,
    traceId: string
  ): Promise<AtlassianSearchResult[]> {
    const response = await this.callTool(
      "searchJiraIssuesUsingJql",
      {
        cloudId: this.manifest.atlassian.cloud_id,
        jql,
        maxResults: this.manifest.atlassian.dynamic_search.max_jira_results,
        fields: [
          "summary",
          "description",
          "status",
          "issuetype",
          "priority",
          "labels",
          "components",
          "assignee",
          "reporter",
          "created",
          "updated",
          "resolution",
          "project",
          "comment"
        ],
        responseContentFormat: "markdown"
      },
      traceId
    );

    const payload = this.extractToolTextPayload(response);
    return this.normaliseJiraSearchPayload(payload);
  } 

  async getDynamicAtlassianContext(params: {
    shortDescription?: string;
    description?: string;
    ciName?: string;
    traceId: string;
  }): Promise<DynamicAtlassianContext> {
    const query = this.buildIncidentSearchQuery({
      shortDescription: params.shortDescription,
      description: params.description,
      ciName: params.ciName
    });

    const allResults = await this.searchAtlassian(query, params.traceId);

    const maxResults = this.manifest.atlassian.dynamic_search.max_results;
    const maxJira = this.manifest.atlassian.dynamic_search.max_jira_results;
    const maxConfluence = this.manifest.atlassian.dynamic_search.max_confluence_results;

    const results = allResults.slice(0, maxResults);

    let jiraResults = results
      .filter(result => this.isJiraResult(result))
      .slice(0, maxJira);

    const confluenceResults = results
      .filter(result => this.isConfluenceResult(result))
      .slice(0, maxConfluence);
    

    if (jiraResults.length === 0) {
      const jql = this.buildJiraJql({
        shortDescription: params.shortDescription,
        description: params.description,
        ciName: params.ciName
      });

      console.log(
        `[atlassian] No Jira issue returned by searchAtlassian. Running Jira JQL fallback: ${jql}`
      );

      try {
        jiraResults = await this.searchJiraIssuesUsingJql(jql, params.traceId);
      } catch (error) {
        console.warn(
          `[atlassian] Jira JQL fallback failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const fetchedConfluence: FetchedAtlassianResult[] = [];

    for (const page of confluenceResults) {
      fetchedConfluence.push(await this.fetchAtlassian(page, params.traceId));
    }

    const fallbackJira = this.manifest.atlassian.dynamic_search.fallback_jira_issue;
    const bestJiraSource = jiraResults[0];
    const bestJiraIssueKey = bestJiraSource
      ? this.extractJiraKey(bestJiraSource) || fallbackJira
      : fallbackJira;

    const usedFallbackJira = !bestJiraSource;

    let graphContext: any;
    let hydratedObjects: any;
    let objectAris: string[] = [];

    try {
      graphContext = await this.getJiraWorkItemContext(
        bestJiraIssueKey,
        params.traceId,
        20
      );

      objectAris = this.collectJiraObjectAris(graphContext, 5);

      if (objectAris.length > 0) {
        hydratedObjects = await this.hydrateObjects(objectAris, params.traceId);
      }
    } catch (error) {
      console.warn(
        `[atlassian] Teamwork Graph expansion failed for ${bestJiraIssueKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      query,
      results,
      jiraResults,
      confluenceResults,
      fetchedConfluence,
      bestJiraIssueKey,
      bestJiraSource,
      graphContext,
      hydratedObjects,
      objectAris,
      usedFallbackJira
    };
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