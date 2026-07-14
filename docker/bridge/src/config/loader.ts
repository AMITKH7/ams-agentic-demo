import fs from "fs";
import yaml from "js-yaml";

export interface ServiceEntry {
  ci: string;
  github_repo: string;
  jira_project: string;
  confluence_space: string;
  owning_team: string;
}

export interface AiEnhanceRefineConfig {
  servicenow_triage_notes: boolean;
  github_handoff_issue: boolean;
  copilot_guardrails: boolean;
}

export interface Manifest {
  project: {
    name: string;
    environment: string;
    region: string;
    maturity: string;
  };

  servicenow: {
    instance: string;
    confidence_threshold: number;
    similar_incident_first: boolean;
    system_of_record: boolean;
  };

  atlassian: {
    enabled: boolean;
    rovo_mcp_url: string;
    cloud_id: string;
    jira_project: string;
    confluence_space: string;
    dynamic_search: {
      enabled: boolean;
      max_results: number;
      max_jira_results: number;
      max_confluence_results: number;
      fallback_jira_issue: string;
      query_boost_terms: string[];
    };
  };

  ai_enhance: {
    enabled: boolean;
    provider: string;
    model: string;
    timeout_ms: number;
    max_words: number;
    fallback_on_error: boolean;
    refine?: AiEnhanceRefineConfig;
  };

  github_handoff: {
    enabled: boolean;
    provider: string;
    repo: string;
    human_gate_required: boolean;
    duplicate_protection: boolean;
  };

  observability: {
    trace_header: string;
  };

  service_map: ServiceEntry[];
}

export function loadManifest(): Manifest {
  const path = process.env.MANIFEST_PATH || "./manifests/demo.yaml";

  if (!fs.existsSync(path)) {
    throw new Error(`Manifest not found at ${path}`);
  }

  const raw = fs.readFileSync(path, "utf8");
  const manifest = yaml.load(raw) as Manifest;

  manifest.ai_enhance.refine = {
    servicenow_triage_notes:
      manifest.ai_enhance.refine?.servicenow_triage_notes ?? true,
    github_handoff_issue:
      manifest.ai_enhance.refine?.github_handoff_issue ?? true,
    copilot_guardrails:
      manifest.ai_enhance.refine?.copilot_guardrails ?? true
  };

  return manifest;
}

export function findService(manifest: Manifest, ciName: string): ServiceEntry | undefined {
  return manifest.service_map.find(
    service => service.ci.toLowerCase() === ciName.toLowerCase()
  );
}