import { z } from "zod";

export const demoModeSchema = z.object({
  mode: z.enum(["new", "preserve"]).default("new"),
});

export const PRESERVE_DESIGN_INSTRUCTION = `Improve the Digital Trust Score of this existing website while preserving its visual design. This is a remediation job, not a redesign.
Keep the current layout, section order, typography, colors, spacing, imagery, branding, visible copy and working navigation. Use the attached original screenshot as a visual reference. Retain existing styles and make asset URLs absolute using the original page's base URL. Do not replace the site with a template.
Fix accessibility issues: semantic landmarks, heading hierarchy, descriptive image alternatives, form labels, keyboard access, focus indicators and contrast. Make only the smallest visible changes needed for accessibility and mobile usability.
Improve the measured search and trust signals: a descriptive title and meta description, one clear H1, viewport, accurate Open Graph tags and valid business structured data derived from the supplied content. Keep substantive content and real contact information.
Never invent business hours, addresses, services, testimonials, certifications or other business facts to increase a score. Do not hide issues, remove meaningful content or disable checks to improve a score. Keep unknown facts unknown.
Return the complete updated HTML with write_site and summarize the improvements. This is a concrete edit request, so do not reply with a discussion-only response.`;
