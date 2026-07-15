import Anthropic from "@anthropic-ai/sdk";
import {
  newSectionOfType,
  pageIrSchema,
  themeSchema,
  type BusinessData,
  type PageIR,
  type Theme,
} from "@/lib/site/ir";

// Natural-language site editing, powered by Claude. The model never emits
// HTML — it returns a structured IR (the same shape humans edit), which we
// validate with the exact zod schemas the manual editor uses before
// applying. That validation is the guardrail: an edit that would drop alt
// text, break a section shape, or otherwise violate the compliance rules is
// rejected and the model is asked to fix it, so "make it awesome" can never
// produce a non-compliant page.
//
// Reads ANTHROPIC_API_KEY from the environment only (server-side). When
// it's unset, runs in mock mode so the whole flow is testable without a key.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const MAX_VALIDATION_RETRIES = 3;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface AiEditResult {
  ir: PageIR;
  theme?: Theme;
  summary: string;
  dryRun: boolean;
}

interface AiEditInput {
  instruction: string;
  currentIr: PageIR;
  theme: Theme;
  business: BusinessData;
}

// Describes the exact IR the model may produce. Kept in sync with lib/site/ir.ts.
const IR_GUIDE = `
You edit a small-business website represented as a JSON "IR": an ordered list of
typed sections, plus an optional theme. You never write HTML — a deterministic
renderer turns your IR into an accessible, mobile-first page.

Each section is an object with a "type" and type-specific fields:
- hero:         { type:"hero", heading, subheading?, ctaLabel?, ctaHref?, image?: {url, alt} }
- about:        { type:"about", heading?, body }
- services:     { type:"services", heading?, items: [{ name, description? }] }   (>=1 item)
- gallery:      { type:"gallery", heading?, images: [{ url, alt }] }             (>=1 image)
- faq:          { type:"faq", heading?, items: [{ question, answer }] }          (>=1 item)
- testimonials: { type:"testimonials", heading?, items: [{ quote, author? }] }   (>=1 item)
- cta:          { type:"cta", heading, body?, buttonLabel, buttonHref }
- contact:      { type:"contact", heading?, body?, showForm }

Theme (optional to change): {
  palette: { primary, accent, ink, ground, paper, muted } (all hex colors),
  fonts: "modern" | "classic" | "editorial",
  radius: number 0-28
}

RULES — the edit is rejected if you break any:
1. EVERY image MUST have non-empty "alt" text describing the image. Never invent
   an image URL — only keep or reference image URLs already present in the input.
2. Return the COMPLETE updated "sections" array in the intended order, not a diff.
3. Preserve existing content the user did not ask to change; only change what the
   instruction asks for.
4. Keep copy realistic and specific to the business; no placeholder like "lorem ipsum".
`.trim();

function systemPrompt(business: BusinessData): string {
  return `You are a website design assistant for "${business.name}", a local business.
${IR_GUIDE}

Call the write_page tool exactly once with the full updated page. Include a one-
sentence summary of what you changed.`;
}

function userPrompt(input: AiEditInput): string {
  return `Current theme:
${JSON.stringify(input.theme)}

Business details:
${JSON.stringify(input.business)}

Current page sections:
${JSON.stringify(input.currentIr.sections)}

Instruction: ${input.instruction}`;
}

const WRITE_PAGE_TOOL: Anthropic.Tool = {
  name: "write_page",
  description: "Write the complete updated page (sections and optional theme).",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One sentence describing what changed." },
      sections: {
        type: "array",
        items: { type: "object" },
        description: "The full ordered list of section objects for the page.",
      },
      theme: {
        type: "object",
        description: "Optional updated theme. Omit to keep the current theme.",
      },
    },
    required: ["summary", "sections"],
  },
};

export async function runAiEdit(input: AiEditInput): Promise<AiEditResult> {
  if (!isAiConfigured()) {
    return mockEdit(input);
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(input) }];

  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(input.business),
      tools: [WRITE_PAGE_TOOL],
      tool_choice: { type: "tool", name: "write_page" },
      messages,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) {
      throw new Error("The assistant did not return a page edit.");
    }

    const raw = toolUse.input as { summary?: unknown; sections?: unknown; theme?: unknown };
    const irParsed = pageIrSchema.safeParse({ sections: raw.sections });
    const themeParsed =
      raw.theme === undefined ? { success: true as const, data: undefined } : themeSchema.safeParse(raw.theme);

    if (irParsed.success && themeParsed.success) {
      return {
        ir: irParsed.data,
        theme: themeParsed.success ? themeParsed.data : undefined,
        summary: typeof raw.summary === "string" ? raw.summary : "Updated the page.",
        dryRun: false,
      };
    }

    // Feed the validation errors back and let the model correct itself.
    const errorMessage = [
      !irParsed.success ? `sections invalid: ${JSON.stringify(irParsed.error.flatten())}` : "",
      !themeParsed.success ? `theme invalid: ${JSON.stringify(themeParsed.error.flatten())}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `The page was not valid and was not saved. Fix these problems and call write_page again: ${errorMessage}`,
        },
      ],
    });
  }

  throw new Error("The assistant could not produce a valid page after several attempts.");
}

// Mock mode (no API key): make one small, valid, visible change so the full
// edit → validate → preview flow is testable end to end. Clearly labeled.
function mockEdit(input: AiEditInput): AiEditResult {
  const hasTestimonials = input.currentIr.sections.some((s) => s.type === "testimonials");
  const sections = hasTestimonials
    ? input.currentIr.sections
    : [...input.currentIr.sections, newSectionOfType("testimonials")];

  return {
    ir: { sections },
    summary:
      "Mock mode (no ANTHROPIC_API_KEY set): added a sample testimonials section. Set the key in your environment to enable real AI editing.",
    dryRun: true,
  };
}
