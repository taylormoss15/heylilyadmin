// What "fully live / implemented" means for an account, and how much of it the
// app can verify automatically. A paid account that isn't live yet is the
// highest-priority work in the business — the Launchpad surfaces exactly where
// each one is blocked.

export interface ImplStep {
  key: string;
  label: string;
  done: boolean;
  auto: boolean; // true = the app checks this automatically
  hint?: string; // what to do when it's not done
}

export interface Implementation {
  paid: boolean;
  steps: ImplStep[];
  doneCount: number;
  total: number;
  live: boolean; // every implementation step complete
  blockedAt: string | null; // the first incomplete step (after paid)
}

export interface ImplInputs {
  paidAt: Date | null;
  hasDesign: boolean; // a custom site design exists
  domainActive: boolean; // Cloudflare zone is active
  deployed: boolean; // site pushed live to Cloudflare
  customDomain: boolean; // live on the client's own domain (not just workers.dev)
  formRouted: boolean; // contact-form notification email set
  hasMonitorScan: boolean; // a live-site compliance scan has run
  monitorClean: boolean; // ...and it passed with 0 issues
}

export function computeImplementation(i: ImplInputs): Implementation {
  const steps: ImplStep[] = [
    {
      key: "design",
      label: "Website built",
      done: i.hasDesign,
      auto: true,
      hint: "Generate the site design in the builder.",
    },
    {
      key: "domain",
      label: "Domain connected",
      done: i.domainActive,
      auto: true,
      hint: "Connect the domain to Cloudflare and repoint nameservers (Business details).",
    },
    {
      key: "deploy",
      label: "Deployed live",
      done: i.deployed && i.customDomain,
      auto: true,
      hint: i.deployed
        ? "Deployed, but not yet on the client's own domain — deploy again once the domain is active."
        : "Deploy the site live (needs a clean validation).",
    },
    {
      key: "form",
      label: "Contact form routed",
      done: i.formRouted,
      auto: true,
      hint: "Set the contact-form notification email (Business details).",
    },
    {
      key: "monitor",
      label: "Compliance verified live",
      done: i.monitorClean,
      auto: true,
      hint: i.hasMonitorScan
        ? "The live scan found issues — fix and re-scan."
        : "Awaiting the first live-site compliance scan.",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const live = steps.every((s) => s.done);
  const blockedAt = steps.find((s) => !s.done)?.label ?? null;

  return { paid: Boolean(i.paidAt), steps, doneCount, total: steps.length, live, blockedAt };
}

// Derive the raw inputs from a client row loaded with `implementationInclude`.
export function inputsFromClient(client: {
  paidAt: Date | null;
  cfZoneStatus: string | null;
  notificationEmail: string | null;
  sites: { cfDeployedAt: Date | null; cfDomain: string | null; pages: { customHtml: string | null }[] }[];
  accessibilityScans: { violationCount: number; status: string }[];
}): ImplInputs {
  const monitor = client.accessibilityScans[0];
  return {
    paidAt: client.paidAt,
    hasDesign: client.sites.some((s) => s.pages.some((p) => p.customHtml)),
    domainActive: client.cfZoneStatus === "active",
    deployed: client.sites.some((s) => s.cfDeployedAt),
    customDomain: client.sites.some((s) => s.cfDomain),
    formRouted: Boolean(client.notificationEmail),
    hasMonitorScan: Boolean(monitor),
    monitorClean: Boolean(monitor && monitor.status === "COMPLETED" && monitor.violationCount === 0),
  };
}

// Prisma include that gathers everything computeImplementation needs.
export const implementationInclude = {
  sites: { select: { cfDeployedAt: true, cfDomain: true, pages: { select: { customHtml: true } } } },
  accessibilityScans: {
    where: { kind: "monitor" },
    orderBy: { scannedAt: "desc" as const },
    take: 1,
    select: { violationCount: true, status: true },
  },
} as const;
