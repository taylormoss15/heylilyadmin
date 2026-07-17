import { z } from "zod";

// The structured representation ("IR") that humans and (later) the AI edit
// instead of raw HTML. The renderer (lib/site/renderer.ts) is the ONLY
// thing that turns this into markup, which is what lets us guarantee
// accessible, compliant output no matter what edits are made — nothing
// here can express "an image without alt text" or "broken heading order".

// ---- Theme ----

export const paletteSchema = z.object({
  primary: z.string(), // brand / heading accent
  accent: z.string(), // CTA / links
  ink: z.string(), // body text
  ground: z.string(), // page background
  paper: z.string(), // card / surface background
  muted: z.string(), // secondary text
});
export type Palette = z.infer<typeof paletteSchema>;

// Curated font pairings only (system-font stacks — no webfont CDN, so
// generated pages stay self-contained and load fast). The renderer maps
// these keys to concrete font-family stacks.
export const fontPairing = z.enum(["modern", "classic", "editorial"]);
export type FontPairing = z.infer<typeof fontPairing>;

export const themeSchema = z.object({
  palette: paletteSchema,
  fonts: fontPairing.default("modern"),
  radius: z.number().min(0).max(28).default(10),
});
export type Theme = z.infer<typeof themeSchema>;

// ---- Business data ----

export const businessDataSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional(),
  about: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postal: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  priceRange: z.string().optional(),
  // A booking/reservation URL (e.g. a Rezdy, FareHarbor, or Calendly page).
  // The designer wires "Book now" CTAs to it and can embed it inline.
  bookingUrl: z.string().optional(),
  hours: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  services: z.array(z.object({ name: z.string(), description: z.string().optional() })).default([]),
  social: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
});
export type BusinessData = z.infer<typeof businessDataSchema>;

// ---- Sections (discriminated union on `type`) ----

const imageSchema = z.object({
  url: z.string(),
  // alt is REQUIRED and non-empty — this is where "every image has alt
  // text" is enforced, structurally, before anything renders.
  alt: z.string().min(1, "Alt text is required for every image"),
});

export const heroSection = z.object({
  type: z.literal("hero"),
  heading: z.string().min(1),
  subheading: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  image: imageSchema.optional(),
});

export const aboutSection = z.object({
  type: z.literal("about"),
  heading: z.string().optional(),
  body: z.string().min(1),
});

export const servicesSection = z.object({
  type: z.literal("services"),
  heading: z.string().optional(),
  items: z.array(z.object({ name: z.string().min(1), description: z.string().optional() })).min(1),
});

export const gallerySection = z.object({
  type: z.literal("gallery"),
  heading: z.string().optional(),
  images: z.array(imageSchema).min(1),
});

export const faqSection = z.object({
  type: z.literal("faq"),
  heading: z.string().optional(),
  items: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1),
});

export const testimonialsSection = z.object({
  type: z.literal("testimonials"),
  heading: z.string().optional(),
  items: z.array(z.object({ quote: z.string().min(1), author: z.string().optional() })).min(1),
});

export const ctaSection = z.object({
  type: z.literal("cta"),
  heading: z.string().min(1),
  body: z.string().optional(),
  buttonLabel: z.string().min(1),
  buttonHref: z.string().min(1),
});

export const contactSection = z.object({
  type: z.literal("contact"),
  heading: z.string().optional(),
  body: z.string().optional(),
  // Phase A renders a semantic, accessible form shell. Wiring it to GHL's
  // CRM capture is Phase B — see docs/website-builder-plan.md §7.
  showForm: z.boolean().default(true),
});

export const sectionSchema = z.discriminatedUnion("type", [
  heroSection,
  aboutSection,
  servicesSection,
  gallerySection,
  faqSection,
  testimonialsSection,
  ctaSection,
  contactSection,
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];

export const pageIrSchema = z.object({
  sections: z.array(sectionSchema),
});
export type PageIR = z.infer<typeof pageIrSchema>;

export const SECTION_TYPES: { type: SectionType; label: string }[] = [
  { type: "hero", label: "Hero" },
  { type: "about", label: "About" },
  { type: "services", label: "Services" },
  { type: "gallery", label: "Gallery" },
  { type: "faq", label: "FAQ" },
  { type: "testimonials", label: "Testimonials" },
  { type: "cta", label: "Call to action" },
  { type: "contact", label: "Contact" },
];

// ---- Safe parsing helpers (DB stores these as JSON strings) ----

export function parseTheme(json: string): Theme {
  return themeSchema.parse(JSON.parse(json));
}
export function parseBusinessData(json: string): BusinessData {
  return businessDataSchema.parse(JSON.parse(json));
}
export function parsePageIR(json: string): PageIR {
  return pageIrSchema.parse(JSON.parse(json));
}

// ---- Defaults / starter content ----

export function defaultTheme(): Theme {
  return {
    palette: {
      primary: "#1f2937",
      accent: "#2f57b8",
      ink: "#1a1f2b",
      ground: "#ffffff",
      paper: "#f6f8fb",
      muted: "#5b6472",
    },
    fonts: "modern",
    radius: 10,
  };
}

export function newSectionOfType(type: SectionType): Section {
  switch (type) {
    case "hero":
      return { type, heading: "Your headline goes here", subheading: "A short supporting line.", ctaLabel: "Get in touch", ctaHref: "#contact" };
    case "about":
      return { type, heading: "About us", body: "Tell your story here." };
    case "services":
      return { type, heading: "What we do", items: [{ name: "Service one", description: "Describe it." }] };
    case "gallery":
      return { type, heading: "Gallery", images: [] as never };
    case "faq":
      return { type, heading: "Frequently asked questions", items: [{ question: "A question?", answer: "The answer." }] };
    case "testimonials":
      return { type, heading: "What clients say", items: [{ quote: "They were great.", author: "A happy client" }] };
    case "cta":
      return { type, heading: "Ready to get started?", body: "", buttonLabel: "Contact us", buttonHref: "#contact" };
    case "contact":
      return { type, heading: "Get in touch", body: "", showForm: true };
  }
}

/** Starter content for a brand-new site so the editor and preview are never blank. */
export function starterSite(businessName: string): {
  theme: Theme;
  businessData: BusinessData;
  homeIr: PageIR;
} {
  const businessData: BusinessData = {
    name: businessName,
    tagline: "Serving our community with care",
    about: `${businessName} is a local business dedicated to quality service and happy customers.`,
    phone: "",
    email: "",
    hours: [
      { label: "Mon–Fri", value: "9:00 AM – 5:00 PM" },
      { label: "Sat", value: "10:00 AM – 2:00 PM" },
    ],
    services: [
      { name: "Service one", description: "Describe your first service." },
      { name: "Service two", description: "Describe your second service." },
    ],
    social: [],
  };

  const homeIr: PageIR = {
    sections: [
      {
        type: "hero",
        heading: `Welcome to ${businessName}`,
        subheading: "Serving our community with care.",
        ctaLabel: "Get in touch",
        ctaHref: "#contact",
      },
      { type: "about", heading: "About us", body: businessData.about ?? "" },
      {
        type: "services",
        heading: "What we do",
        items: businessData.services.map((s) => ({ name: s.name, description: s.description })),
      },
      {
        type: "faq",
        heading: "Frequently asked questions",
        items: [
          { question: "Where are you located?", answer: "Add your address and service area here." },
          { question: "How do I book?", answer: "Reach out via the contact form below." },
        ],
      },
      { type: "contact", heading: "Get in touch", body: "We'd love to hear from you.", showForm: true },
    ],
  };

  return { theme: defaultTheme(), businessData, homeIr };
}
