import Anthropic from "@anthropic-ai/sdk";

// Best-effort AI enrichment for a prospect. From the page text (and a
// screenshot when available) it infers the industry, rough size, a
// professionalism rating, and — if there's a visible builder badge or credit —
// who made the site. Reads ANTHROPIC_API_KEY from the environment only; with
// no key it returns nothing rather than fabricating data.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export interface ProspectProfile {
  industry?: string;
  employees?: string;
  estimatedRevenue?: string;
  professionalism?: number; // 1-5
  professionalismNote?: string;
  builtBy?: string;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "assess_business",
  description: "Record the inferred business profile and website assessment.",
  input_schema: {
    type: "object",
    properties: {
      industry: {
        type: "string",
        description: "Best industry/vertical label, 1-4 words (e.g. 'Roofing contractor'). Empty string if unclear.",
      },
      employees: {
        type: "string",
        description: "Rough employee-count range best-guess (e.g. '1–10', '11–50'). Empty string if no basis.",
      },
      estimatedRevenue: {
        type: "string",
        description: "Rough annual revenue band best-guess (e.g. '<$1M', '$1M–$5M'). Empty string if no basis.",
      },
      professionalism: {
        type: "integer",
        description:
          "How professional the site LOOKS, 1-5. 1 = amateur/DIY template, thin or dated; 3 = decent small-business site; 5 = polished, modern, custom. Judge from the screenshot if provided, else from structure/content.",
      },
      professionalismNote: {
        type: "string",
        description: "One short, specific sentence on the design quality (what's dated/weak or strong). No fluff.",
      },
      builtBy: {
        type: "string",
        description:
          "Who built the site, ONLY if there's a clear signal (a visible 'Powered by X' / 'Website by X' badge or credit, or an obvious builder). Empty string if not evident.",
      },
    },
    required: ["industry", "employees", "estimatedRevenue", "professionalism", "professionalismNote", "builtBy"],
  },
};

export async function inferProspectProfile(input: {
  businessName?: string;
  url: string;
  text: string;
  screenshot?: string; // data: URL (JPEG)
  platformHint?: string; // deterministic platform detection, if any
  creditHint?: string; // "powered by …" phrase found on the page, if any
}): Promise<ProspectProfile> {
  if (!process.env.ANTHROPIC_API_KEY) return {};

  const client = new Anthropic();
  try {
    const contextLines = [
      `Business name: ${input.businessName || "(unknown)"}`,
      `Website: ${input.url}`,
      input.platformHint ? `Detected site builder: ${input.platformHint}` : "",
      input.creditHint ? `Credit found on page: ${input.creditHint}` : "",
      "",
      "Website text:",
      input.text.slice(0, 5000),
    ]
      .filter(Boolean)
      .join("\n");

    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: contextLines }];
    if (input.screenshot?.startsWith("data:image/")) {
      const base64 = input.screenshot.split(",")[1] || "";
      if (base64) {
        content.unshift({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: base64 },
        });
      }
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "You assess small/local-business websites for a web agency. Give a confident industry label and reasonable best-guess size ranges (these are estimates). Judge how professional the site looks. Identify who built it only when there's a clear on-page signal — never guess a specific agency name.",
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "assess_business" },
      messages: [{ role: "user", content }],
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) return {};
    const raw = toolUse.input as Record<string, unknown>;
    const str = (v: unknown, max = 60) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const rating = typeof raw.professionalism === "number" ? Math.min(5, Math.max(1, Math.round(raw.professionalism))) : undefined;
    return {
      industry: str(raw.industry),
      employees: str(raw.employees),
      estimatedRevenue: str(raw.estimatedRevenue),
      professionalism: rating,
      professionalismNote: str(raw.professionalismNote, 200),
      builtBy: str(raw.builtBy, 80),
    };
  } catch {
    return {};
  }
}
