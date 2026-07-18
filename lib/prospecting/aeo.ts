// On-page / AEO (Answer Engine Optimization) signals gathered in the same
// quick prospect scan, plus site-builder detection. All pure — fed by the raw
// signals collected in the browser (see scan.ts).

export interface TechSignals {
  generator: string; // <meta name="generator">
  title: string;
  description: string;
  hasCanonical: boolean;
  hasViewport: boolean;
  lang: string;
  hasFavicon: boolean;
  robots: string;
  ogTitle: boolean;
  ogImage: boolean;
  twitterCard: boolean;
  h1Count: number;
  headingCount: number;
  imgTotal: number;
  imgWithAlt: number;
  jsonLdTypes: string[];
  words: number;
  hasAnalytics: boolean;
  hasWpContent: boolean;
  hosts: string[];
  credit: string; // "powered by / website by …" phrase, if any
}

export interface AeoCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export interface AeoResult {
  score: number; // 0-100
  checks: AeoCheck[];
}

// Detect the website builder / CMS from the generator meta and asset hosts.
export function detectPlatform(t: TechSignals): string | undefined {
  const gen = t.generator.toLowerCase();
  const hosts = t.hosts.join(" ").toLowerCase();

  const byGen: [RegExp, string][] = [
    [/wix/, "Wix"],
    [/squarespace/, "Squarespace"],
    [/wordpress/, "WordPress"],
    [/shopify/, "Shopify"],
    [/duda/, "Duda"],
    [/weebly/, "Weebly"],
    [/webflow/, "Webflow"],
    [/joomla/, "Joomla"],
    [/drupal/, "Drupal"],
    [/godaddy/, "GoDaddy Website Builder"],
    [/hubspot/, "HubSpot"],
    [/framer/, "Framer"],
  ];
  for (const [re, name] of byGen) if (re.test(gen)) return name;

  const byHost: [RegExp, string][] = [
    [/wixstatic\.com|parastorage\.com/, "Wix"],
    [/squarespace-cdn\.com|sqspcdn/, "Squarespace"],
    [/cdn\.shopify\.com/, "Shopify"],
    [/assets\.website-files\.com|webflow\.com/, "Webflow"],
    [/irp\.cdn-website\.com|dudamobile|multiscreensite\.com/, "Duda"],
    [/editmysite\.com|weebly\.com/, "Weebly"],
    [/img1\.wsimg\.com|wsimg\.com/, "GoDaddy Website Builder"],
    [/framerusercontent\.com/, "Framer"],
    [/hs-sites\.com|hubspot/, "HubSpot"],
  ];
  for (const [re, name] of byHost) if (re.test(hosts)) return name;

  if (t.hasWpContent) return "WordPress";
  return undefined;
}

// A small, honest on-page/AEO scorecard — the things that decide whether a
// site shows up (and answers well) in search and AI answer engines.
export function computeAeo(t: TechSignals, url: string): AeoResult {
  const isHttps = url.startsWith("https://");
  const titleLen = t.title.trim().length;
  const descLen = t.description.trim().length;
  const altPct = t.imgTotal > 0 ? Math.round((t.imgWithAlt / t.imgTotal) * 100) : 100;
  const hasSchema = t.jsonLdTypes.length > 0;
  const localSchema = t.jsonLdTypes.some((x) => /LocalBusiness|Organization|Store|Restaurant/i.test(x));
  const noindex = /noindex/i.test(t.robots);

  const checks: AeoCheck[] = [
    {
      label: "Title tag",
      pass: titleLen >= 10 && titleLen <= 65,
      detail: titleLen === 0 ? "Missing" : `${titleLen} chars${titleLen > 65 ? " (too long)" : titleLen < 10 ? " (too short)" : ""}`,
    },
    {
      label: "Meta description",
      pass: descLen >= 50 && descLen <= 160,
      detail: descLen === 0 ? "Missing — search engines guess your snippet" : `${descLen} chars`,
    },
    {
      label: "Single clear H1",
      pass: t.h1Count === 1,
      detail: t.h1Count === 0 ? "No H1 headline" : t.h1Count === 1 ? "One H1" : `${t.h1Count} H1s (should be one)`,
    },
    {
      label: "Mobile-friendly viewport",
      pass: t.hasViewport,
      detail: t.hasViewport ? "Set" : "Missing — mobile visitors see a shrunken desktop page",
    },
    {
      label: "Secure (HTTPS)",
      pass: isHttps,
      detail: isHttps ? "Yes" : "No — browsers flag it 'Not secure'",
    },
    {
      label: "Structured data (schema)",
      pass: localSchema,
      detail: localSchema
        ? `Yes (${t.jsonLdTypes.slice(0, 3).join(", ")})`
        : hasSchema
        ? "Some, but no LocalBusiness/Organization"
        : "None — AI answer engines can't read your business details",
    },
    {
      label: "Social share tags (Open Graph)",
      pass: t.ogTitle && t.ogImage,
      detail: t.ogTitle && t.ogImage ? "Present" : "Missing — links share as bare text",
    },
    {
      label: "Image alt text",
      pass: altPct >= 80,
      detail: t.imgTotal === 0 ? "No images" : `${altPct}% of ${t.imgTotal} images described`,
    },
    {
      label: "Indexable by search",
      pass: !noindex,
      detail: noindex ? "BLOCKED (noindex) — invisible to Google" : "Yes",
    },
    {
      label: "Meaningful content",
      pass: t.words >= 250,
      detail: `${t.words} words${t.words < 250 ? " (thin)" : ""}`,
    },
    {
      label: "Analytics installed",
      pass: t.hasAnalytics,
      detail: t.hasAnalytics ? "Yes" : "None detected — they're flying blind on traffic",
    },
  ];

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  return { score, checks };
}
