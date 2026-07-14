import axios from "axios";
import { Manifest } from "../config/loader";

export type AiEnhancementResult = {
  triagePack: string;
  aiEnhanced: boolean;
  provider: string;
  error?: string;
};

export type AiEnhancementInput = {
  incidentNumber: string;
  shortDescription: string;
  ciName: string;
  analysisMode: string;
  selectedJira: string;
  triagePack: string;
};

export type GitHubHandoffBodyEnhancementInput = {
  incidentNumber: string;
  shortDescription: string;
  ciName: string;
  selectedJira: string;
  approvedBy: string;
  triagePack: string;
  originalBody: string;
};

export type GitHubHandoffBodyEnhancementResult = {
  body: string;
  aiEnhanced: boolean;
  provider: string;
  error?: string;
};

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0 || value === "FILL_IN_LATER";
}

function shouldUseOpenAiForServiceNowTriage(manifest: Manifest): boolean {
  return (
    manifest.ai_enhance.enabled === true &&
    manifest.ai_enhance.refine?.servicenow_triage_notes !== false
  );
}

function shouldUseOpenAiForGitHubHandoff(manifest: Manifest): boolean {
  return (
    manifest.ai_enhance.enabled === true &&
    manifest.ai_enhance.refine?.github_handoff_issue !== false
  );
}

function validateOpenAiConfig(manifest: Manifest): string | undefined {
  if (!manifest.ai_enhance.enabled) {
    return undefined;
  }

  if (manifest.ai_enhance.provider !== "openai") {
    return `Unsupported ai_enhance provider: ${manifest.ai_enhance.provider}`;
  }

  if (isMissing(process.env.OPENAI_API_KEY)) {
    return "OPENAI_API_KEY is missing or set to FILL_IN_LATER";
  }

  return undefined;
}

function extractOpenAiText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = payload?.output || [];
  const parts: string[] = [];

  for (const item of output) {
    const content = item?.content || [];

    for (const block of content) {
      if (block?.type === "output_text" && block?.text) {
        parts.push(block.text);
      }
    }
  }

  return parts.join("\n").trim();
}

async function callOpenAi(
  manifest: Manifest,
  developerInstruction: string,
  userPrompt: string,
  maxOutputTokens = 1000
): Promise<string> {
  const model =
    process.env.OPENAI_MODEL ||
    manifest.ai_enhance.model ||
    "gpt-5.5";

  const response = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model,
      input: [
        {
          role: "developer",
          content: developerInstruction
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_output_tokens: maxOutputTokens,
      temperature: 0.2,
      store: false
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      timeout: manifest.ai_enhance.timeout_ms,
      validateStatus: () => true
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `OpenAI API failed: HTTP ${response.status} ${JSON.stringify(response.data)}`
    );
  }

  const text = extractOpenAiText(response.data);

  if (!text) {
    throw new Error("OpenAI API returned empty response");
  }

  return text;
}

function buildServiceNowTriagePrompt(input: AiEnhancementInput, maxWords: number): string {
  return `
You are refining an AMS incident triage note for ServiceNow work notes.

Rules:
- Do not invent facts.
- Use only the evidence already present in the source triage pack.
- Preserve Jira keys, Confluence page titles, confidence, and recommended actions.
- Keep the note concise, professional, and engineer-readable.
- Do not remove source evidence.
- Do not claim that remediation is completed unless the source says so.
- Make it clear that human approval is required before code remediation.
- Return markdown only.

Target length for the refined summary: ${maxWords} words.

Required structure:
## AI-Refined Summary
## Likely Cause
## Evidence Used
## Recommended Next Action
## Governance / Human Gate

Incident Number: ${input.incidentNumber}
CI / Service: ${input.ciName}
Short Description: ${input.shortDescription}
Analysis Mode: ${input.analysisMode}
Selected Jira: ${input.selectedJira}

Source Triage Pack:
${input.triagePack}
`;
}

function buildGitHubHandoffPrompt(
  input: GitHubHandoffBodyEnhancementInput,
  maxWords: number
): string {
  return `
You are refining a GitHub issue body for GitHub Copilot remediation.

Rules:
- Do not invent facts.
- Use only the incident context and source triage pack already provided.
- Preserve ServiceNow incident number, selected Jira key, and CI/service.
- Keep the issue body highly actionable for Copilot.
- Keep remediation bounded and safe.
- Make it clear that auto-merge is not allowed.
- Require a human-reviewed pull request.
- Require tests and build validation.
- Do not remove the source triage pack section.
- Return markdown only.

Target length before the source triage pack: ${maxWords} words.

Required structure:
# AMS GitHub / Copilot Handoff
## Human Gate 1
## Incident Context
## Engineering Problem
## Copilot Remediation Instructions
## Acceptance Criteria
## Validation Required
## Source Triage Pack

Incident Number: ${input.incidentNumber}
CI / Service: ${input.ciName}
Short Description: ${input.shortDescription}
Selected Jira: ${input.selectedJira}
Approved By: ${input.approvedBy}

Original Deterministic GitHub Issue Body:
${input.originalBody}

Source Triage Pack:
${input.triagePack}
`;
}

export async function enhanceTriagePackIfEnabled(
  manifest: Manifest,
  input: AiEnhancementInput
): Promise<AiEnhancementResult> {
  if (!shouldUseOpenAiForServiceNowTriage(manifest)) {
    return {
      triagePack: input.triagePack,
      aiEnhanced: false,
      provider: "none"
    };
  }

  const configError = validateOpenAiConfig(manifest);

  if (configError) {
    if (manifest.ai_enhance.fallback_on_error) {
      return {
        triagePack: input.triagePack,
        aiEnhanced: false,
        provider: manifest.ai_enhance.provider,
        error: configError
      };
    }

    throw new Error(configError);
  }

  try {
    const narrative = await callOpenAi(
      manifest,
      "You create concise, evidence-grounded AMS incident triage summaries for ServiceNow. Never invent evidence.",
      buildServiceNowTriagePrompt(input, manifest.ai_enhance.max_words),
      1000
    );

    const enhancedPack = `${narrative}

---

## Source-Grounded Triage Pack

${input.triagePack}
`;

    return {
      triagePack: enhancedPack,
      aiEnhanced: true,
      provider: "openai"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (manifest.ai_enhance.fallback_on_error) {
      return {
        triagePack: input.triagePack,
        aiEnhanced: false,
        provider: "openai",
        error: message
      };
    }

    throw error;
  }
}

export async function refineGitHubHandoffBodyIfEnabled(
  manifest: Manifest,
  input: GitHubHandoffBodyEnhancementInput
): Promise<GitHubHandoffBodyEnhancementResult> {
  if (!shouldUseOpenAiForGitHubHandoff(manifest)) {
    return {
      body: input.originalBody,
      aiEnhanced: false,
      provider: "none"
    };
  }

  const configError = validateOpenAiConfig(manifest);

  if (configError) {
    if (manifest.ai_enhance.fallback_on_error) {
      return {
        body: input.originalBody,
        aiEnhanced: false,
        provider: manifest.ai_enhance.provider,
        error: configError
      };
    }

    throw new Error(configError);
  }

  try {
    const refinedBody = await callOpenAi(
      manifest,
      "You create safe, source-grounded GitHub issue bodies for Copilot remediation. Never invent evidence.",
      buildGitHubHandoffPrompt(input, manifest.ai_enhance.max_words),
      1300
    );

    return {
      body: refinedBody,
      aiEnhanced: true,
      provider: "openai"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (manifest.ai_enhance.fallback_on_error) {
      return {
        body: input.originalBody,
        aiEnhanced: false,
        provider: "openai",
        error: message
      };
    }

    throw error;
  }
}