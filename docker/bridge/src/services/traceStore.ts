import fs from "fs";
import path from "path";

export type TraceEvent = {
  timestamp: string;
  traceId?: string;
  action: string;
  status: "started" | "success" | "failure" | "skipped";
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
};

export type GitHubIssueTrace = {
  number: number;
  html_url: string;
  api_url?: string;
  title?: string;
};

export type GitHubPrTrace = {
  number: number;
  html_url: string;
  state?: string;
  draft?: boolean;
  branch?: string;
};

export type AmsTraceRecord = {
  incidentNumber: string;
  incidentSysId?: string;
  traceId?: string;
  ciName?: string;
  selectedJira?: string;
  githubIssue?: GitHubIssueTrace;
  githubPr?: GitHubPrTrace;
  status:
    | "TRIAGE_STARTED"
    | "TRIAGE_COMPLETED"
    | "GITHUB_HANDOFF_REQUESTED"
    | "GITHUB_ISSUE_CREATED"
    | "GITHUB_HANDOFF_REUSED"
    | "PR_CREATED"
    | "FAILED";
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  events: TraceEvent[];
};

type TraceStoreFile = {
  version: 1;
  records: AmsTraceRecord[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyStore(): TraceStoreFile {
  return {
    version: 1,
    records: []
  };
}

export class TraceStore {
  constructor(private readonly filePath: string) {
    this.ensureStore();
  }

  private ensureStore(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(emptyStore(), null, 2));
    }
  }

  private read(): TraceStoreFile {
    this.ensureStore();

    const raw = fs.readFileSync(this.filePath, "utf8").trim();

    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw) as Partial<TraceStoreFile>;

    return {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records : []
    };
  }

  private write(store: TraceStoreFile): void {
    fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2));
  }

  getByIncidentNumber(incidentNumber: string): AmsTraceRecord | undefined {
    const store = this.read();
    return store.records.find(record => record.incidentNumber === incidentNumber);
  }

  upsert(input: {
    incidentNumber: string;
    incidentSysId?: string;
    traceId?: string;
    ciName?: string;
    selectedJira?: string;
    githubIssue?: GitHubIssueTrace;
    githubPr?: GitHubPrTrace;
    status: AmsTraceRecord["status"];
    lastError?: string;
  }): AmsTraceRecord {
    const store = this.read();
    const existingIndex = store.records.findIndex(
      record => record.incidentNumber === input.incidentNumber
    );

    const timestamp = nowIso();

    if (existingIndex >= 0) {
      const existing = store.records[existingIndex];

      const updated: AmsTraceRecord = {
        ...existing,
        incidentSysId: input.incidentSysId || existing.incidentSysId,
        traceId: input.traceId || existing.traceId,
        ciName: input.ciName || existing.ciName,
        selectedJira: input.selectedJira || existing.selectedJira,
        githubIssue: input.githubIssue || existing.githubIssue,
        githubPr: input.githubPr || existing.githubPr,
        status: input.status,
        lastError: input.lastError,
        updatedAt: timestamp,
        events: existing.events || []
      };

      store.records[existingIndex] = updated;
      this.write(store);
      return updated;
    }

    const created: AmsTraceRecord = {
      incidentNumber: input.incidentNumber,
      incidentSysId: input.incidentSysId,
      traceId: input.traceId,
      ciName: input.ciName,
      selectedJira: input.selectedJira,
      githubIssue: input.githubIssue,
      githubPr: input.githubPr,
      status: input.status,
      lastError: input.lastError,
      createdAt: timestamp,
      updatedAt: timestamp,
      events: []
    };

    store.records.push(created);
    this.write(store);
    return created;
  }

  appendEvent(incidentNumber: string, event: TraceEvent): AmsTraceRecord {
    const existing = this.getByIncidentNumber(incidentNumber);

    const record = this.upsert({
      incidentNumber,
      traceId: existing?.traceId || event.traceId,
      incidentSysId: existing?.incidentSysId,
      ciName: existing?.ciName,
      selectedJira: existing?.selectedJira,
      githubIssue: existing?.githubIssue,
      githubPr: existing?.githubPr,
      status: existing?.status || "GITHUB_HANDOFF_REQUESTED",
      lastError: existing?.lastError
    });

    const store = this.read();
    const index = store.records.findIndex(item => item.incidentNumber === incidentNumber);

    if (index >= 0) {
      store.records[index].events = [
        ...(store.records[index].events || []),
        {
          timestamp: nowIso(),
          ...event
        }
      ];
      store.records[index].updatedAt = nowIso();
      this.write(store);
      return store.records[index];
    }

    return record;
  }

  list(): AmsTraceRecord[] {
    return this.read().records;
  }
}