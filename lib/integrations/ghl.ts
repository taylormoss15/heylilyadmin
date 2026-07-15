import { prisma } from "@/lib/prisma";

// Thin client for the GoHighLevel v2 API (services.leadconnectorhq.com).
// This backend never runs inside GHL — it only talks to it over this API to:
//   - write scan/uptime results into a contact's custom fields
//   - drop a note on the client's contact/opportunity record
//   - fire a workflow (e.g. the internal uptime-down alert workflow)
//
// Every call is logged to GhlSyncLog for debugging. If GHL_API_TOKEN isn't
// set, calls run in "dry run" mode: they log what would have happened and
// return success, so the rest of the system (scans, webhooks, dashboard)
// works end-to-end before real GHL credentials are wired in.

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

interface GhlCallOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  clientId?: string | null;
  action: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.GHL_API_TOKEN);
}

async function callGhl({ method, path, body, clientId, action }: GhlCallOptions): Promise<
  { ok: true; data: unknown } | { ok: false; error: string }
> {
  const token = process.env.GHL_API_TOKEN;

  if (!token) {
    await logSync({ clientId, action, payload: body, success: true, dryRun: true });
    return { ok: true, data: { dryRun: true } };
  }

  try {
    const res = await fetch(`${GHL_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMessage = `GHL API ${res.status}: ${JSON.stringify(data)}`;
      await logSync({ clientId, action, payload: body, success: false, errorMessage });
      return { ok: false, error: errorMessage };
    }

    await logSync({ clientId, action, payload: body, success: true });
    return { ok: true, data };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown GHL API error";
    await logSync({ clientId, action, payload: body, success: false, errorMessage });
    return { ok: false, error: errorMessage };
  }
}

async function logSync(opts: {
  clientId?: string | null;
  action: string;
  payload?: unknown;
  success: boolean;
  errorMessage?: string;
  dryRun?: boolean;
}) {
  await prisma.ghlSyncLog.create({
    data: {
      clientId: opts.clientId ?? null,
      action: opts.dryRun ? `${opts.action} (dry_run)` : opts.action,
      payload: opts.payload ? JSON.stringify(opts.payload) : null,
      success: opts.success,
      errorMessage: opts.errorMessage,
    },
  });
}

/** Update custom fields on a GHL contact — used to write scan/uptime status back into the client's record. */
export async function updateContactCustomFields(
  clientId: string,
  ghlContactId: string,
  customFields: Record<string, string | number | boolean>
) {
  return callGhl({
    method: "PUT",
    path: `/contacts/${ghlContactId}`,
    body: { customFields: Object.entries(customFields).map(([id, value]) => ({ id, value })) },
    clientId,
    action: "update_custom_fields",
  });
}

/** Add a note to a GHL contact — used for remediation notes and incident summaries. */
export async function addContactNote(clientId: string, ghlContactId: string, body: string) {
  return callGhl({
    method: "POST",
    path: `/contacts/${ghlContactId}/notes`,
    body: { body },
    clientId,
    action: "add_note",
  });
}

/**
 * Fire a GHL workflow via its inbound webhook URL. Used for the internal
 * "site is down" alert — per spec, uptime alerts are internal-only and
 * route through a GHL workflow to the team, not a public status page.
 */
export async function triggerWorkflow(
  clientId: string,
  workflowWebhookUrl: string,
  payload: Record<string, unknown>
) {
  if (!workflowWebhookUrl) {
    await logSync({
      clientId,
      action: "trigger_workflow",
      payload,
      success: false,
      errorMessage: "No workflow webhook URL configured",
    });
    return { ok: false as const, error: "No workflow webhook URL configured" };
  }

  if (!isConfigured() && process.env.GHL_DRY_RUN_ALLOW_WEBHOOK !== "true") {
    await logSync({ clientId, action: "trigger_workflow", payload, success: true, dryRun: true });
    return { ok: true as const, data: { dryRun: true } };
  }

  try {
    const res = await fetch(workflowWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const success = res.ok;
    await logSync({
      clientId,
      action: "trigger_workflow",
      payload,
      success,
      errorMessage: success ? undefined : `Webhook returned ${res.status}`,
    });
    return success
      ? { ok: true as const, data: {} }
      : { ok: false as const, error: `Webhook returned ${res.status}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown webhook error";
    await logSync({ clientId, action: "trigger_workflow", payload, success: false, errorMessage });
    return { ok: false as const, error: errorMessage };
  }
}

export const ghlConfigured = isConfigured;
