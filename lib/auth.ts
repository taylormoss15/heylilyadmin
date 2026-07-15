import { cookies } from "next/headers";

// Uses Web Crypto (globalThis.crypto.subtle) rather than Node's `crypto`
// module so this works in both the Edge runtime (middleware) and the
// Node runtime (route handlers) without a separate implementation.

const SESSION_COOKIE = "heylily_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it to .env."
    );
  }
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string): Promise<string> {
  const key = await importKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

export async function createSessionToken(userId: string): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const signature = await sign(payload);
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export async function verifySessionToken(token: string): Promise<{ userId: string } | null> {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [userId, expiresStr, signature] = parts;
    if (!userId || !expiresStr || !signature) return null;

    const expected = await sign(`${userId}.${expiresStr}`);
    if (!timingSafeEqual(expected, signature)) return null;

    if (Date.now() > Number(expiresStr)) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<{ userId: string } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const sessionCookieName = SESSION_COOKIE;
export const sessionMaxAgeSeconds = SESSION_TTL_MS / 1000;
