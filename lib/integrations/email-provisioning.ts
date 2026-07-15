import { prisma } from "@/lib/prisma";
import type { EmailProvider } from "@/lib/types";

// Google Workspace and Microsoft 365 seat provisioning. Both require real
// admin-console credentials (a Workspace domain-wide-delegation service
// account, or a Microsoft Graph app registration with Directory.ReadWrite
// consent) that this repo doesn't have yet. Rather than block the rest of
// the system on that setup, this runs in "dry run" mode until the relevant
// env vars are present: it still creates/updates the EmailSeat record (so
// billing and the dashboard work end-to-end), it just doesn't call out to
// Google/Microsoft's admin APIs.
//
// Wiring up the real calls later means implementing `callGoogleAdminApi`
// and `callMicrosoftGraphApi` below — the seat lifecycle logic and DB
// bookkeeping around them doesn't need to change.

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL);
}

function microsoftConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_GRAPH_TENANT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_ID &&
      process.env.MICROSOFT_GRAPH_CLIENT_SECRET
  );
}

async function callGoogleAdminApi(action: "create" | "suspend" | "delete", seatEmail: string) {
  // TODO: implement with googleapis `admin_directory_v1`, authenticated via
  // a service account JSON key with domain-wide delegation scoped to
  // https://www.googleapis.com/auth/admin.directory.user.
  throw new Error("Google Workspace Admin API integration not yet implemented");
}

async function callMicrosoftGraphApi(action: "create" | "suspend" | "delete", seatEmail: string) {
  // TODO: implement with Microsoft Graph `/users` endpoint, authenticated
  // via client-credentials flow (@azure/msal-node) with
  // User.ReadWrite.All application permission.
  throw new Error("Microsoft Graph API integration not yet implemented");
}

export async function provisionSeat(clientId: string, provider: EmailProvider, seatEmail: string) {
  const isConfigured = provider === "GOOGLE_WORKSPACE" ? googleConfigured() : microsoftConfigured();

  if (isConfigured) {
    try {
      if (provider === "GOOGLE_WORKSPACE") await callGoogleAdminApi("create", seatEmail);
      else await callMicrosoftGraphApi("create", seatEmail);
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Seat provisioning failed",
      };
    }
  }

  const seat = await prisma.emailSeat.create({
    data: { clientId, provider, seatEmail, status: "ACTIVE" },
  });

  return { ok: true as const, seat, dryRun: !isConfigured };
}

export async function deprovisionSeat(seatId: string) {
  const seat = await prisma.emailSeat.findUnique({ where: { id: seatId } });
  if (!seat) return { ok: false as const, error: "Seat not found" };

  const isConfigured =
    seat.provider === "GOOGLE_WORKSPACE" ? googleConfigured() : microsoftConfigured();

  if (isConfigured) {
    try {
      if (seat.provider === "GOOGLE_WORKSPACE") await callGoogleAdminApi("delete", seat.seatEmail);
      else await callMicrosoftGraphApi("delete", seat.seatEmail);
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Seat deprovisioning failed",
      };
    }
  }

  const updated = await prisma.emailSeat.update({
    where: { id: seatId },
    data: { status: "DEPROVISIONED", deprovisionedAt: new Date() },
  });

  return { ok: true as const, seat: updated, dryRun: !isConfigured };
}

export const emailProviderConfigured = { google: googleConfigured, microsoft: microsoftConfigured };
