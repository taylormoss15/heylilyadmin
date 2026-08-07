// Push a finished site live on Cloudflare — instant global hosting + free SSL,
// one API call, no manual pasting. We deploy each site as a tiny Cloudflare
// Worker that serves the finalized HTML (the HTML is base64-embedded so there
// are no escaping pitfalls), enable its workers.dev URL for instant preview,
// and — if the client's domain is already a zone on the Cloudflare account —
// attach the custom domain automatically.
//
// Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment
// only. Token needs Workers Scripts:Edit and (for custom domains) Zone + DNS.

const API = "https://api.cloudflare.com/client/v4";

export function isCloudflareConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

function cfg() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error("Cloudflare is not configured (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID).");
  return { token, account, auth: { Authorization: `Bearer ${token}` } };
}

interface CfResult<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: T;
}

async function cfJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as CfResult<T>;
  if (!res.ok || !data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || `Cloudflare API ${res.status}`;
    throw new Error(msg);
  }
  return data.result as T;
}

// A valid Worker script name: lowercase, alphanumeric + dashes, ≤ 54 chars.
export function scriptNameForSite(siteId: string): string {
  return `hl-${siteId}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 54);
}

function workerModule(html: string): string {
  const b64 = Buffer.from(html, "utf8").toString("base64");
  return (
    `const B64=${JSON.stringify(b64)};` +
    `const HTML=new TextDecoder().decode(Uint8Array.from(atob(B64),c=>c.charCodeAt(0)));` +
    `export default{fetch(){return new Response(HTML,{headers:{"content-type":"text/html; charset=utf-8"}})}};`
  );
}

async function uploadWorker(name: string, html: string): Promise<void> {
  const { account, auth } = cfg();
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify({ main_module: "worker.js", compatibility_date: "2024-11-01" })], { type: "application/json" })
  );
  form.append("worker.js", new Blob([workerModule(html)], { type: "application/javascript+module" }), "worker.js");
  const res = await fetch(`${API}/accounts/${account}/workers/scripts/${name}`, { method: "PUT", headers: auth, body: form });
  await cfJson(res);
}

async function enableWorkersDev(name: string): Promise<string | null> {
  const { account, auth } = cfg();
  await fetch(`${API}/accounts/${account}/workers/scripts/${name}/subdomain`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  }).catch(() => null);

  const subRes = await fetch(`${API}/accounts/${account}/workers/subdomain`, { headers: auth });
  const sub = await cfJson<{ subdomain?: string }>(subRes).catch(() => ({ subdomain: undefined }));
  return sub.subdomain ? `https://${name}.${sub.subdomain}.workers.dev` : null;
}

interface ZoneRecord {
  id: string;
  status: string;
  name_servers?: string[];
}

async function findZone(domain: string): Promise<ZoneRecord | null> {
  const { auth } = cfg();
  const res = await fetch(`${API}/zones?name=${encodeURIComponent(domain)}`, { headers: auth });
  const zones = await cfJson<ZoneRecord[]>(res).catch(() => [] as ZoneRecord[]);
  return zones && zones[0] ? zones[0] : null;
}

async function findZoneId(domain: string): Promise<string | null> {
  const zone = await findZone(domain);
  return zone ? zone.id : null;
}

export function cleanDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

export interface ZoneInfo {
  zoneId: string;
  nameServers: string[]; // the two Cloudflare nameservers to set at the registrar
  status: string; // "pending" until nameservers propagate, then "active"
  alreadyExisted: boolean;
}

// Add the client's domain to Cloudflare (or find it if already there) so the
// client can keep their registrar and just repoint nameservers. Returns the
// exact nameservers to set and the current activation status.
export async function ensureZone(domain: string): Promise<ZoneInfo> {
  const name = cleanDomain(domain);
  if (!name.includes(".")) throw new Error("Enter a valid domain (e.g. example.com).");

  const existing = await findZone(name);
  if (existing) {
    return { zoneId: existing.id, nameServers: existing.name_servers ?? [], status: existing.status, alreadyExisted: true };
  }

  const { account, auth } = cfg();
  const res = await fetch(`${API}/zones`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name, account: { id: account }, type: "full" }),
  });
  const zone = await cfJson<ZoneRecord>(res);
  return { zoneId: zone.id, nameServers: zone.name_servers ?? [], status: zone.status, alreadyExisted: false };
}

async function attachCustomDomain(name: string, hostname: string, zoneId: string): Promise<void> {
  const { account, auth } = cfg();
  const res = await fetch(`${API}/accounts/${account}/workers/domains`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ hostname, service: name, environment: "production", zone_id: zoneId }),
  });
  await cfJson(res);
}

export interface PublishResult {
  scriptName: string;
  previewUrl: string | null; // workers.dev URL
  customDomain: string | null; // attached custom domain, if any
  domainNote?: string; // guidance when the domain couldn't be auto-attached
}

export async function publishToCloudflare(input: {
  siteId: string;
  html: string;
  domain?: string | null;
}): Promise<PublishResult> {
  const scriptName = scriptNameForSite(input.siteId);
  await uploadWorker(scriptName, input.html);
  const previewUrl = await enableWorkersDev(scriptName);

  let customDomain: string | null = null;
  let domainNote: string | undefined;
  const domain = input.domain?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (domain && domain.includes(".")) {
    try {
      const zoneId = await findZoneId(domain);
      if (zoneId) {
        await attachCustomDomain(scriptName, domain, zoneId);
        customDomain = domain;
      } else {
        domainNote = `${domain} isn't a zone on this Cloudflare account yet — add the domain to Cloudflare, then deploy again to attach it automatically.`;
      }
    } catch (err) {
      domainNote = err instanceof Error ? err.message : "Could not attach the custom domain.";
    }
  }

  return { scriptName, previewUrl, customDomain, domainNote };
}
