import { prisma } from "@/lib/prisma";
import { triggerWorkflow } from "@/lib/integrations/ghl";
import type { Client, UptimeMonitor } from "@prisma/client";

// External uptime monitors (UptimeRobot, Better Stack, etc.) aren't native
// to GHL, so this receives their webhooks, records the incident, and fires
// the internal GHL alert workflow so the team fixes it before the client
// ever notices. Per spec this is internal-only — no client-facing status
// page — so nothing here writes anything publicly visible.

export interface NormalizedUptimeEvent {
  externalMonitorId: string;
  status: "down" | "up";
  reason?: string;
  occurredAt: Date;
}

/**
 * UptimeRobot and Better Stack use different payload shapes. This
 * normalizes both into one event shape; add more providers here as needed.
 */
export function normalizeUptimeWebhook(
  provider: string,
  payload: Record<string, unknown>
): NormalizedUptimeEvent | null {
  if (provider === "uptimerobot") {
    const monitorId = payload.monitorID ?? payload.monitorId;
    const alertType = String(payload.alertType ?? payload.alert_type ?? "");
    if (!monitorId) return null;
    return {
      externalMonitorId: String(monitorId),
      status: alertType === "1" || alertType.toLowerCase() === "down" ? "down" : "up",
      reason: typeof payload.alertDetails === "string" ? payload.alertDetails : undefined,
      occurredAt: new Date(),
    };
  }

  if (provider === "betterstack") {
    const monitorId = payload.monitor_id ?? (payload as any).data?.relationships?.monitor?.data?.id;
    const statusValue = String(
      (payload as any).status_change?.new_status ?? payload.status ?? ""
    ).toLowerCase();
    if (!monitorId) return null;
    return {
      externalMonitorId: String(monitorId),
      status: statusValue.includes("down") ? "down" : "up",
      reason: typeof payload.cause === "string" ? payload.cause : undefined,
      occurredAt: new Date(),
    };
  }

  return null;
}

export async function handleUptimeEvent(
  provider: string,
  event: NormalizedUptimeEvent,
  rawPayload: Record<string, unknown>
) {
  const monitor = await prisma.uptimeMonitor.findFirst({
    where: { provider, externalMonitorId: event.externalMonitorId },
    include: { client: true },
  });

  if (!monitor) {
    return { ok: false as const, reason: "No client is registered for this monitor" };
  }

  if (event.status === "down") {
    const incident = await prisma.uptimeIncident.create({
      data: {
        clientId: monitor.clientId,
        provider,
        startedAt: event.occurredAt,
        reason: event.reason,
        rawPayload: JSON.stringify(rawPayload),
      },
    });

    await notifyInternalTeam(monitor.client, monitor, incident.reason ?? "Site is down");
    await prisma.uptimeIncident.update({ where: { id: incident.id }, data: { ghlNotified: true } });
    return { ok: true as const, incidentId: incident.id };
  }

  // "up" event — resolve the most recent open incident for this client.
  const openIncident = await prisma.uptimeIncident.findFirst({
    where: { clientId: monitor.clientId, resolvedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (openIncident) {
    await prisma.uptimeIncident.update({
      where: { id: openIncident.id },
      data: { resolvedAt: event.occurredAt },
    });
  }

  return { ok: true as const, resolvedIncidentId: openIncident?.id ?? null };
}

async function notifyInternalTeam(client: Client, monitor: UptimeMonitor, reason: string) {
  const webhookUrl = process.env.GHL_UPTIME_ALERT_WORKFLOW_WEBHOOK_URL ?? "";
  await triggerWorkflow(client.id, webhookUrl, {
    event: "site_down",
    clientId: client.id,
    clientName: client.name,
    url: monitor.url,
    reason,
    occurredAt: new Date().toISOString(),
  });
}
