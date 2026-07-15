# Website Builder + AI Editor — Build Plan

Status: **planning only — no builder code written yet.** This document is for review before implementation.

The existing repo today is the backend admin service (compliance scanning, uptime, GHL sync, admin dashboard). This plan adds a **site-generation subsystem**: a generator that produces mobile-friendly, fast-loading, compliance-baked-in HTML, plus an AI editor that designs and refines it in natural language, with live previews.

Two decisions are already made (your calls):

- **Every client gets custom-generated HTML** (not just a custom-design tier) — we lean less on GHL's native drag-drop builder.
- **The AI editor uses live Anthropic API calls** (key supplied via environment variable at build time).

---

## 1. The "every client" decision — honest tradeoffs

Generating custom HTML for *every* client instead of using GHL's native builder is a real fork. It's a legitimate choice, but it moves work onto us that GHL otherwise gives for free. Making the tradeoffs explicit so they're chosen, not discovered later:

**What we give up / take on:**

| Area | Consequence of custom-HTML-for-all |
|---|---|
| Non-technical edits | Clients/staff lose GHL's drag-drop editor. **Every** content change now routes through *our* tool. Our editor has to be good enough to be the only editor. |
| Forms & CRM capture | A raw custom HTML page does **not** auto-capture into GHL's CRM. Every form must be explicitly wired to GHL (embed or API). This is the single biggest "gotcha" of the custom-HTML path. |
| Multi-page maintenance | GHL Custom HTML Pages have **no shared templating** — each page is a separate upload. Change a header → re-upload every page by hand. |
| Cross-browser / responsive | We own it. No GHL safety net. |
| Assets | GHL requires **absolute CDN URLs** for all images/CSS/JS. We need a CDN/object store. (See §6.) |
| Per-page limits | One self-contained HTML file per page, **5MB cap** each. |

**What the design does about it:**

- The **no-shared-templating** pain is exactly what a generator fixes: we hold one structured source of truth per site and *regenerate all pages* from it. A header change = regenerate + republish all pages, automatically. Doing "every client" **by hand** would be miserable; doing it through a generator is the thing that makes it viable.
- **Forms** get a first-class block type that renders a form wired to GHL's capture endpoint/API (design detail in §7, and a confirmed open question in §11).
- **The editor being the only editor** is why the AI editor + a solid manual editor both matter — covered in §4–§5.

Bottom line: "every client" is workable, but it makes **this subsystem load-bearing for the whole product**, and it adds a hard dependency on a CDN and on GHL form wiring. Worth confirming you're good with those two before we start.

---

## 2. Core architectural decision: edit a structured model, not raw HTML

This is the most important choice in the whole plan, because it's what lets "make it look awesome" coexist with "never breaks compliance."

**Rejected approach:** store raw HTML per page; let the AI (and humans) edit the HTML directly. This is fragile — one AI rewrite can silently drop alt text, break heading order, or strip the compliance badge, and there's no reliable way to stop it.

**Chosen approach:** every page is stored as a **structured JSON representation (an "IR")** — a list of typed sections (hero, services, about, gallery, FAQ, contact form, …) plus a theme (palette, type scale, spacing) plus the client's business data (name, address, hours, services). A **deterministic renderer** turns IR → HTML.

- **Humans and the AI edit the IR, never the HTML.**
- The renderer is the *only* thing that emits markup, and it **always** emits semantic, accessible, schema-tagged, mobile-first HTML with the compliance pieces injected.
- The AI physically cannot produce non-compliant markup, because it never touches markup — it manipulates a constrained schema through typed operations, and the renderer guarantees the output.

Everything else in this plan hangs off that decision.

---

## 3. System components

```
┌─────────────────────────────────────────────────────────────┐
│  Admin dashboard (existing Next.js app)                      │
│                                                             │
│   Site editor UI ──────────┐                                │
│     • section/theme forms   │  edits                         │
│     • AI chat panel ────────┤────────────► Site IR (JSON)   │
│     • live iframe preview ◄─┘              (per page)        │
│                                                │             │
│                                    renderer(IR)│             │
│                                                ▼             │
│                                       self-contained HTML    │
│                                                │             │
│                        ┌───────────────────────┼──────────┐  │
│                        ▼                       ▼          ▼  │
│                  axe-core scan          size/link      GHL   │
│                  (reuse existing)       validation    publish│
└─────────────────────────────────────────────────────────────┘
        │                                          │
        ▼                                          ▼
   Asset CDN (images/fonts,               GoHighLevel
   absolute URLs)                         Custom HTML Pages
```

### 3a. The renderer (deterministic, pure)
`render(ir, theme, businessData) → { html: string }`. Guarantees, every time:
- Semantic HTML5 landmarks (`header`/`nav`/`main`/`footer`), exactly one `H1`, logical heading nesting.
- Alt text on every image (the image block **requires** an `alt` field — validation blocks save without it).
- JSON-LD (`LocalBusiness`, `FAQPage`, etc.) generated from business data.
- Mobile-first inline critical CSS with phone/tablet/desktop breakpoints; touch-friendly targets.
- Compliance badge script + conditional cookie banner injected in the footer.
- All asset references rewritten to **absolute CDN URLs**.
- Output is a **single self-contained file** (inlined CSS, minimal vanilla JS) — satisfies GHL's constraints and loads fast by construction.

### 3b. Manual editor UI
Forms in the dashboard to add/reorder/remove sections, edit copy, pick theme/palette/fonts, set business data, upload images. Writes to the IR. This is the fallback + fine-control path that must exist because clients no longer have GHL's builder.

### 3c. AI editor
Natural language → structured edits to the IR (§5). Two modes: **generate from scratch** (business info + industry → full IR) and **refine** ("bolder hero", "warmer palette", "add a testimonials section").

### 3d. Live preview
Renderer output dropped into a sandboxed `iframe`, with a **device-width toggle** (phone/tablet/desktop) — the spec explicitly notes GHL has *no* device preview for uploaded pages, so we provide our own. Instant, because rendering is local and deterministic.

### 3e. Validation gate (reuses existing work)
Before publish, each page runs through: **axe-core** (the scanner already built for the compliance product — direct reuse), **size check** (<5MB), and **link/asset check** (all absolute, all resolve). Fail → block publish with a report.

### 3f. Publish
Generate final HTML per page → validate → push to GHL Custom HTML Pages (§7). On publish, auto-register the page URL with the accessibility scanner and (optionally) the uptime monitor — so a newly built site is immediately under the compliance + uptime umbrella already built.

---

## 4. Data model (additions to the existing Prisma schema)

```
Site
  id, clientId (→ Client), name, status (draft|published),
  theme (JSON), businessData (JSON), createdAt, updatedAt
Page
  id, siteId (→ Site), path ("/", "/services"), title,
  ir (JSON — the ordered section list), isHome
PageVersion
  id, pageId (→ Page), ir (JSON snapshot), html (rendered snapshot),
  createdBy, createdAt          # every generate/edit snapshots here → undo + audit
SiteAsset
  id, siteId (→ Site), kind (image|font), cdnUrl, alt, bytes, createdAt
PublishRecord
  id, pageId (→ Page), target ("ghl"), externalRef, status,
  a11yScore, sizeBytes, publishedAt, error
```

Storing the **IR** (not just HTML) is what makes pages re-editable and re-generatable. `PageVersion` gives undo and a design audit trail; `PublishRecord` ties a live page back to its validation results.

---

## 5. AI editor design

Implemented as an **Anthropic tool-use loop**, not free-text HTML generation.

- Claude is given the current page IR + business data, and a set of **typed tools**: `setTheme`, `addSection`, `editSection`, `reorderSections`, `removeSection`, `setBusinessInfo`, `generateCopy`, etc. Each has a strict JSON schema mirroring the IR.
- Claude proposes tool calls → we apply them to the IR → renderer re-renders → preview updates → validation runs. Claude sees results and can iterate.
- Because Claude only ever emits IR operations through these schemas, **it cannot produce invalid or non-compliant markup**. The guardrail is structural, not prompt-based hope.
- **Generate-from-scratch**: same tools, seeded with business info + an industry starter (see §9), producing a full multi-section IR + copy + palette in one pass, then refine via chat.

**Model & cost:** default to `claude-opus-4-8` for design quality; offer `claude-sonnet-5` for faster/cheaper iterative edits. Each edit is an API round-trip — token cost scales with edit volume, so we cache the IR/business context and send diffs where possible.

**Key handling:** `ANTHROPIC_API_KEY` read from the environment only. Never in the repo, never in the client-facing bundle — all Claude calls happen server-side in the admin app.

**Optional later:** AI image generation for hero/section imagery → stored to the asset CDN. Not in the initial build; flagged so the asset pipeline (§6) is designed to accommodate it.

---

## 6. Asset pipeline / CDN (hard dependency)

GHL Custom HTML Pages require **absolute URLs** for every asset, so custom-HTML-for-all forces a CDN/object store. Recommended: **Cloudflare R2** (or any S3-compatible bucket) fronted by a CDN — fits the existing Lightsail/Cloudflare footprint mentioned in the spec.

Flow: image uploaded in the editor (or AI-generated) → stored to the bucket → absolute CDN URL recorded on `SiteAsset` → renderer injects that URL. Fonts: prefer system font stacks (fastest, zero requests); if a brand font is needed, self-host a subset on the CDN.

**Decision needed from you:** which bucket/CDN (§11).

---

## 7. GHL publish integration

The generated page has to land in GHL as a Custom HTML Page under the client's domain/SSL. **Open unknown:** whether GHL exposes an **API** to create/update Custom HTML Pages, or whether it's a **manual UI paste** only. This materially changes the publish step:

- **If an API exists:** fully automated publish (generate → validate → push → record). Ideal.
- **If manual only:** publish = generate the validated file + a one-click "download for GHL" + documented paste step; we still store and validate everything, we just can't push the last inch automatically.

I will verify GHL's actual API surface for Custom HTML Pages before building §7 rather than assume. Same investigation covers **form capture** — how a form in a custom HTML page posts back into GHL's CRM (native form embed vs. GHL API endpoint). Until confirmed, form blocks are designed against GHL's documented form/webhook capture.

---

## 8. Compliance-by-default — how it's guaranteed *and* verified

"Injected by default" is stronger here than a claim, because it's enforced in two places:

1. **Structurally** — the renderer is the only markup source, and it always emits the semantic structure, alt-text-required images, JSON-LD, cookie banner, and the compliance badge (pointing at the already-built `/api/compliance/:clientId/log`). There's no code path that produces a page *without* these.
2. **Verified** — every publish runs the existing **axe-core scanner** against the generated HTML and records the score on `PublishRecord`. A page that regresses accessibility is blocked from publishing. So "compliance baked in" is provable per page, and it feeds the same audit trail the compliance product already sells.

This is a genuine reuse win: the site builder and the compliance product share one scanner and one audit trail.

---

## 9. Templates / industry starters

A library of starter IRs per industry (restaurant, salon, contractor, dental, fitness, …) — matches the spec's "industry-specific starting point." Generate-from-scratch seeds from the closest starter, then the AI/manual editor refines. Starters are just IR JSON, so they're cheap to add and maintain.

---

## 10. Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| **A. Renderer core** | Data model (Site/Page/IR) + deterministic renderer + compliance injection + validation (axe + size) + iframe preview with device toggle. Usable with hand-authored or form-authored IR — **no AI yet**. | — |
| **B. Manual editor UI** | Dashboard site editor: section/theme/business-data forms, image upload → CDN, live preview, export/publish-ready file. | A, CDN chosen |
| **C. AI editor** | Anthropic tool-use loop: generate-from-scratch + natural-language refinement, guardrailed to the IR. | A, B, API key in env |
| **D. GHL publish** | Automated or assisted publish to Custom HTML Pages + auto-register new pages with scanner/uptime. | GHL API verified |
| **E. Library & polish** | Industry starters, multi-page management, optional AI imagery. | A–D |

Phase A is the foundation everything else sits on and is independently demoable (generate a compliant page, preview it across device widths, see its a11y score) — recommended first build once this plan is approved.

---

## 11. Open questions / things I need from you or must verify

1. **CDN/object store** for site assets — Cloudflare R2, S3, or something on the existing Lightsail box? (Required before Phase B.)
2. **GHL Custom HTML Pages API** — does it support programmatic create/update, or manual paste only? *(I'll verify before Phase D.)*
3. **GHL form capture** — confirmed mechanism for custom-HTML forms → GHL CRM. *(I'll verify; affects the form block in Phase B.)*
4. **Confirm the two "every client" dependencies are acceptable:** clients lose GHL's native drag-drop editing (all edits go through this tool), and every form needs explicit GHL wiring.
5. **Brand assets per client** — logo, brand fonts, palette source? Affects theme defaults.
6. **Legal sign-off** on the compliance badge/copy is still the open item from the original spec — unchanged here.

---

## 12. Recommendation

Approve **Phase A** as the first build: the renderer + IR data model + compliance injection + validation + device-toggle preview. It's the load-bearing foundation, needs no external credentials (no API key, no CDN yet), and produces something you can see and judge — a real generated page, compliant and fast, previewed across breakpoints — before we invest in the AI layer and the GHL publish plumbing on top of it.
