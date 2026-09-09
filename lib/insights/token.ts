import { createHmac, timingSafeEqual } from "crypto";

// Signed, self-expiring token for the ephemeral client insights page. No login,
// no stored session: the emailed link carries an unguessable HMAC-signed token
// that names the client and an expiry. When it lapses, the link is dead — so a
// business's numbers can't be found by guessing a URL or after the window ends.
function secret(): string {
  return process.env.INSIGHTS_SECRET || process.env.SESSION_SECRET || "hey-lily-insights-dev-secret";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signInsightToken(clientId: string, ttlMs = 45 * 24 * 60 * 60 * 1000): string {
  const payload = b64url(JSON.stringify({ c: clientId, exp: Date.now() + ttlMs }));
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyInsightToken(token: string): { clientId: string } | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c?: string; exp?: number };
    if (!data.c || !data.exp || Date.now() > data.exp) return null;
    return { clientId: data.c };
  } catch {
    return null;
  }
}
