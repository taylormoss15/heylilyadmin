import Anthropic from "@anthropic-ai/sdk";

// Best-effort AI enrichment for a prospect: from the page's own text, infer the
// industry (confident) plus rough size estimates (clearly guesses the operator
// can edit). Reads ANTHROPIC_API_KEY from the environment only; with no key it
// returns nothing rather than fabricating data.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export interface ProspectProfile {
  industry?: string;
  employees?: string;
  estimatedRevenue?: string;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_business",
  description: "Record the inferred business profile.",
  input_schema: {
    type: "object",
    properties: {
      industry: {
        type: "string",
        description: "The single best industry/vertical label, 1-4 words (e.g. 'Roofing contractor', 'Dental practice', 'Boutique winery'). Empty string if genuinely unclear.",
      },
      employees: {
        type: "string",
        description: "Rough employee-count range as a best guess (e.g. '1–10', '11–50', '51–200'). Empty string if no basis to guess.",
      },
      estimatedRevenue: {
        type: "string",
        description: "Rough annual revenue band as a best guess (e.g. '<$1M', '$1M–$5M', '$5M–$20M'). Empty string if no basis to guess.",
      },
    },
    required: ["industry", "employees", "estimatedRevenue"],
  },
};

export async function inferProspectProfile(input: {
  businessName?: string;
  url: string;
  text: string;
}): Promise<ProspectProfile> {
  if (!process.env.ANTHROPIC_API_KEY) return {};

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "You classify small/local businesses from their website text. Give a confident industry label. For size and revenue, give a reasonable best-guess range for a business of this type — these are estimates, not facts. Never invent a specific named figure; only ranges.",
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_business" },
      messages: [
        {
          role: "user",
          content: `Business name: ${input.businessName || "(unknown)"}\nWebsite: ${input.url}\n\nWebsite text:\n${input.text.slice(0, 6000)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) return {};
    const raw = toolUse.input as { industry?: unknown; employees?: unknown; estimatedRevenue?: unknown };
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : undefined);
    return {
      industry: clean(raw.industry),
      employees: clean(raw.employees),
      estimatedRevenue: clean(raw.estimatedRevenue),
    };
  } catch {
    // Enrichment is best-effort — never fail the scan over it.
    return {};
  }
}
