import axios from "axios";
import { Manifest } from "../config/loader";

export type GitHubIssueRequest = {
  title: string;
  body: string;
  labels?: string[];
};

export type GitHubIssueResponse = {
  number: number;
  html_url: string;
  api_url: string;
  title: string;
};

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0 || value === "FILL_IN_LATER";
}

function parseRepo(repo: string): { owner: string; name: string } {
  const parts = repo.split("/").map(part => part.trim()).filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(`Invalid GitHub repo format. Expected owner/repo, got: ${repo}`);
  }

  return {
    owner: parts[0],
    name: parts[1]
  };
}

export class GitHubAdapter {
  constructor(private manifest: Manifest) {}

  private getToken(): string {
    const token = process.env.GITHUB_PAT;

    if (isMissing(token)) {
      throw new Error("GITHUB_PAT is missing or set to FILL_IN_LATER");
    }

    return token as string;
  }

  async createIssue(input: GitHubIssueRequest): Promise<GitHubIssueResponse> {
    const token = this.getToken();
    const repo = this.manifest.github_handoff.repo;
    const { owner, name } = parseRepo(repo);

    const response = await axios.post(
      `https://api.github.com/repos/${owner}/${name}/issues`,
      {
        title: input.title,
        body: input.body,
        labels: input.labels || []
      },
      {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `GitHub issue creation failed: HTTP ${response.status} ${JSON.stringify(response.data)}`
      );
    }

    return {
      number: response.data.number,
      html_url: response.data.html_url,
      api_url: response.data.url,
      title: response.data.title
    };
  }
}