// Enum-like value sets for fields stored as plain strings in Prisma (SQLite
// doesn't support native enums — see the comment at the top of
// prisma/schema.prisma). Route handlers validate against these via zod;
// this file is the single source of truth for the value sets themselves.

export type Tier = "STARTER" | "PRO" | "PREMIUM";
export const TIERS: Tier[] = ["STARTER", "PRO", "PREMIUM"];

export type ClientStatus = "ACTIVE" | "AT_RISK" | "CHURNED";
export const CLIENT_STATUSES: ClientStatus[] = ["ACTIVE", "AT_RISK", "CHURNED"];

export type ScanStatus = "COMPLETED" | "FAILED";

export type EmailProvider = "GOOGLE_WORKSPACE" | "MICROSOFT_365";
export const EMAIL_PROVIDERS: EmailProvider[] = ["GOOGLE_WORKSPACE", "MICROSOFT_365"];

export type SeatStatus = "ACTIVE" | "SUSPENDED" | "DEPROVISIONED";
