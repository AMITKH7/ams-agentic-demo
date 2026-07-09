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

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0 || value === "FILL_IN_LATER";
}

function buildOpenAiPrompt(input: AiEnhancementInput, maxWords: number): string {
  return `
You are an AMS incident triage assistant.

Rewrite the triage pack into a concise engineer-ready narrative.
Do not invent facts.
Use only the evidence already present in the triage pack.
Keep Jira keys, Confluence page titles, and recommended actions intact.
Return markdown only.

Target length: ${maxWords} words.

Required structure:
1. Executive Summary
2. Likely Cause
3. Evidence
4. Recommended Resolution Steps
5. Human Approval Gate

Incident Number: ${input.incidentNumber}
CI: ${input.ciName}
Short Description: ${input.shortDescription}
Analysis Mode: ${input.analysisMode}
Selected Jira: ${input.selectedJira}

Source Triage Pack:
${input.triagePack}
`;
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

export async function enhanceTriagePackIfEnabled(
  manifest: Manifest,
  input: AiEnhancementInput
): Promise<AiEnhancementResult> {
  if (!manifest.ai_enhance.enabled) {
    return {
      triagePack: input.triagePack,
      aiEnhanced: false,
      provider: "none"
    };
  }

  if (manifest.ai_enhance.provider !== "openai") {
    return {
      triagePack: input.triagePack,
      aiEnhanced: false,
      provider: manifest.ai_enhance.provider,
      error: `Unsupported ai_enhance provider: ${manifest.ai_enhance.provider}`
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (isMissing(apiKey)) {
    const error = "OPENAI_API_KEY is missing or set to FILL_IN_LATER";

    if (manifest.ai_enhance.fallback_on_error) {
      return {
        triagePack: input.triagePack,
        aiEnhanced: false,
        provider: "openai",
        error
      };
    }

    throw new Error(error);
  }

  try {
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
            content:
              "You create concise, evidence-grounded AMS incident triage summaries. Never invent evidence."
          },
          {
            role: "user",
            content: buildOpenAiPrompt(input, manifest.ai_enhance.max_words)
          }
        ],
        max_output_tokens: 900,
        temperature: 0.2,
        store: false
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
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

    const narrative = extractOpenAiText(response.data);

    if (!narrative) {
      throw new Error("OpenAI API returned empty narrative");
    }

    const enhancedPack = `${input.triagePack}

---

## OpenAI Enhanced Narrative

${narrative}
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