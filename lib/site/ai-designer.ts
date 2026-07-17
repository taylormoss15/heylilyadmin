import Anthropic from "@anthropic-ai/sdk";
import type { BusinessData, PageIR } from "@/lib/site/ir";
import { finalizeCustomHtml } from "@/lib/site/finalize";
import { validateRender, type ValidationReport } from "@/lib/site/validate";

// The "world-class designer who codes" engine: Claude writes a full bespoke
// HTML page, then we finalize (inject the compliance layer) and run it
// through the SAME axe-core + size gate used at publish. If it doesn't pass,
// the violations go back to the model and it fixes them — up to a few tries.
// So "mind-blowing" and "fully compliant" both hold: the design is freeform,
// but the compliance is verified before it's ever stored as passing.
//
// Reads ANTHROPIC_API_KEY from the environment only. Mock mode (no key) still
// produces a real, compliant page so the whole flow is testable.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const MAX_FIX_ATTEMPTS = 3;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface DesignResult {
  html: string; // the AI's raw HTML (compliance is injected at render time)
  report: ValidationReport;
  summary: string;
  dryRun: boolean;
}

export interface DesignInput {
  business: BusinessData;
  ir: PageIR;
  instruction?: string;
  clientId: string;
  showCookieBanner: boolean;
  adminBaseUrl?: string;
}

const DESIGN_SYSTEM = `You are a world-class web designer and front-end engineer. You have designed and hand-coded some of the most beautiful, high-converting websites for local and small businesses in the world. Your work looks like a $10,000–$50,000 custom site, never a template.

You produce ONE self-contained HTML document: <!DOCTYPE html>, <html>, <head>, <body>, with ALL CSS inline in a single <style> tag and only minimal vanilla JS if genuinely needed (e.g. a mobile nav toggle). No external CSS/JS frameworks or libraries.

DESIGN BAR — make it genuinely impressive:
- Bold, modern, editorial layouts with strong visual hierarchy and generous, confident whitespace.
- Beautiful typography (a refined system-font stack, or at most ONE Google Fonts <link>). Large expressive headings, comfortable body measure.
- Tasteful depth: layered gradients, soft shadows, geometric or organic shapes, section rhythm and contrast. A memorable hero.
- Subtle, purposeful motion — hover states and gentle on-scroll reveals — wrapped in @media (prefers-reduced-motion: reduce) so it's disabled for users who ask.
- A cohesive, deliberate color system built around the business's character.

CONVERSION — every page drives ONE clear primary action:
- Make the primary action (usually call or request a quote) unmissable in the hero, and repeat it near the end before the footer.
- Action-oriented button copy: "Call now", "Get a free quote", "Book online", "Pay your bill".
- Wire CTAs to take action: tel:+15551234567, mailto:name@business.com, or #contact. Use the business's REAL phone/email from the data provided.

COMPLIANCE — this is validated automatically, so it is non-negotiable:
- Semantic HTML5 with landmarks (header, nav, main, footer) and exactly ONE <h1>; logical heading order.
- Every <img> has descriptive alt text. Every form control has an associated <label> (or aria-label).
- WCAG AA color contrast — verify text is readable on its background; never place low-contrast text.
- Keyboard-operable interactive elements with a visible :focus-visible style. Never convey meaning by color alone.

IMAGES — do NOT invent image URLs; broken images ruin the design. Prefer CSS-driven visuals (gradients, shapes, SVG, typography). Only use an <img> if a real absolute image URL was provided to you, always with descriptive alt.

DO NOT add a cookie banner, an accessibility/compliance badge, or JSON-LD schema — those are injected automatically. Focus entirely on the site itself.

Return your work by calling the write_site tool exactly once with the full HTML and a one-sentence summary.`;

const WRITE_SITE_TOOL: Anthropic.Tool = {
  name: "write_site",
  description: "Provide the complete, self-contained HTML document for the page.",
  input_schema: {
    type: "object",
    properties: {
      html: { type: "string", description: "The full HTML document, from <!DOCTYPE html> to </html>." },
      summary: { type: "string", description: "One sentence on the design direction you took." },
    },
    required: ["html", "summary"],
  },
};

function userPrompt(input: DesignInput): string {
  const direction = input.instruction?.trim()
    ? `\nStyle direction from the operator: ${input.instruction.trim()}`
    : "";
  return `Business details (use the real phone/email/address for CTAs and content):
${JSON.stringify(input.business)}

Existing page content to design around (headings, copy, services, FAQ — reuse and improve this real content; don't invent facts):
${JSON.stringify(input.ir.sections)}
${direction}

Design a stunning, high-converting home page for this business.`;
}

async function validate(rawHtml: string, input: DesignInput): Promise<ValidationReport> {
  const finalized = finalizeCustomHtml(rawHtml, {
    clientId: input.clientId,
    business: input.business,
    adminBaseUrl: input.adminBaseUrl,
    showCookieBanner: input.showCookieBanner,
  });
  return validateRender({ html: finalized, warnings: [] });
}

export async function generateCustomSite(input: DesignInput): Promise<DesignResult> {
  if (!isAiConfigured()) {
    const html = mockDesign(input.business);
    const report = await validate(html, input);
    return { html, report, summary: "Mock mode (no ANTHROPIC_API_KEY): generated a sample custom design.", dryRun: true };
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(input) }];
  let last: { html: string; summary: string; report: ValidationReport } | null = null;

  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: DESIGN_SYSTEM,
      tools: [WRITE_SITE_TOOL],
      tool_choice: { type: "tool", name: "write_site" },
      messages,
    });
    const response = await stream.finalMessage();

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("The designer did not return a page.");

    const raw = toolUse.input as { html?: unknown; summary?: unknown };
    const html = typeof raw.html === "string" ? raw.html : "";
    const summary = typeof raw.summary === "string" ? raw.summary : "Generated a custom design.";
    const report = await validate(html, input);
    last = { html, summary, report };

    if (report.ok) {
      return { html, report, summary, dryRun: false };
    }

    // Feed the specific failures back so the model fixes them and re-submits.
    const problems = [
      ...report.blockers,
      ...report.violations.slice(0, 8).map((v) => `${v.impact ?? "minor"}: ${v.help} (${v.nodeCount} element(s))`),
    ].join("\n- ");
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `The page did not pass the accessibility/size checks and was not saved. Fix ALL of these and call write_site again with the corrected full HTML — keep the design, just make it compliant:\n- ${problems}`,
        },
      ],
    });
  }

  // Return the best attempt even if it still has issues — the caller surfaces
  // the report, and the publish gate will still block a non-compliant page.
  return { html: last!.html, report: last!.report, summary: last!.summary, dryRun: false };
}

// A real, compliant sample page for mock mode (no API key). Modern gradient
// hero, semantic structure, labeled form, strong contrast — passes the gate.
function mockDesign(b: BusinessData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tel = b.phone ? b.phone.replace(/[^\d+]/g, "") : "";
  const services = b.services.length ? b.services : [{ name: "Our services", description: "" }];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)}</title>
<style>
*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f1720;line-height:1.6}
a{color:inherit}main section{padding:72px 24px}.wrap{max-width:1040px;margin:0 auto}
.hero{background:linear-gradient(135deg,#0f2a43,#1b4f72 60%,#2f7d5b);color:#fff;text-align:center;padding:110px 24px}
.hero h1{font-size:clamp(34px,6vw,60px);margin:0 0 16px;letter-spacing:-.02em}
.hero p{font-size:clamp(17px,2.4vw,22px);opacity:.92;max-width:40ch;margin:0 auto 30px}
.btn{display:inline-block;background:#ffd166;color:#12202e;font-weight:700;padding:15px 30px;border-radius:999px;text-decoration:none}
.btn:focus-visible{outline:3px solid #fff;outline-offset:3px}
.grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:34px}
.card{background:#f5f8fb;border:1px solid #e3ebf2;border-radius:16px;padding:26px}
.card h3{margin:0 0 8px;color:#0f2a43}
h2{font-size:clamp(26px,4vw,38px);color:#0f2a43;letter-spacing:-.01em}
form{max-width:520px;display:flex;flex-direction:column;gap:14px}
label{font-weight:600}input,textarea{font:inherit;padding:12px;border:1px solid #b9c6d3;border-radius:10px}
footer{background:#0f2a43;color:#fff;padding:40px 24px;text-align:center}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header class="hero">
<h1>${esc(b.name)}</h1>
<p>${esc(b.tagline || "Trusted local service, done right the first time.")}</p>
${tel ? `<a class="btn" href="tel:${esc(tel)}">Call now</a>` : `<a class="btn" href="#contact">Get a free quote</a>`}
</header>
<main>
<section><div class="wrap">
<h2>What we do</h2>
<div class="grid">
${services.map((s) => `<div class="card"><h3>${esc(s.name)}</h3><p>${esc(s.description || "Reliable, professional service you can count on.")}</p></div>`).join("")}
</div>
</div></section>
<section id="contact" style="background:#f5f8fb"><div class="wrap">
<h2>Get in touch</h2>
<form method="post" action="#" aria-label="Contact form">
<label for="cn">Name</label><input id="cn" name="name" type="text" autocomplete="name" required>
<label for="cp">Phone</label><input id="cp" name="phone" type="tel" autocomplete="tel" required>
<label for="cm">How can we help?</label><textarea id="cm" name="message" rows="4" required></textarea>
<button class="btn" type="submit">Request a quote</button>
</form>
</div></section>
</main>
<footer><p>${esc(b.name)}${b.phone ? ` · ${esc(b.phone)}` : ""}</p></footer>
</body>
</html>`;
}
