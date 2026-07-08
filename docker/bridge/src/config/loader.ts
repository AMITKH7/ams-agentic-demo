import fs from "fs";
import yaml from "js-yaml";

export interface ServiceEntry {
  ci: string;
  github_repo: string;
  jira_project: string;
  confluence_space: string;
  owning_team: string;
}

export interface Manifest {
  project: {
    name: string;
    environment: string;
    region: string;
    maturity: string;
  };
  atlassian: {
    enabled: boolean;
    rovo_mcp_url: string;
    cloud_id: string;
    default_jira_issue: string;
  };
  github: {
    enabled: boolean;
    org: string;
    repo: string;
  };
  servicenow: {
    instance: string;
    confidence_threshold: number;
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
  return yaml.load(raw) as Manifest;
}

export function findService(manifest: Manifest, ciName: string): ServiceEntry | undefined {
  return manifest.service_map.find(
    service => service.ci.toLowerCase() === ciName.toLowerCase()
  );
}
