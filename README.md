# Hey Lily Admin

Backend admin service for Hey Lily's Mini-IT SaaS platform (`app.heylily.ai`). This is the
piece that sits **outside** GoHighLevel and does the things GHL doesn't natively provide:

- A real, dated **accessibility compliance audit trail** (axe-core scans, not an overlay claim)
- **Uptime monitoring** intake — receives webhooks from an external monitor and routes internal alerts into GHL
- The **client-facing compliance badge/log** every client site embeds
- A thin **GHL API client** for writing scan/incident results back into contact records and firing workflows
- **Managed email seat** tracking for Google Workspace / Microsoft 365 (billing pass-through)
- An internal **admin dashboard** to see all clients, their tier, health status, and compliance/uptime history

## What this is *not*

Most of the build spec's "Foundation" phase — agency white-labeling, SaaS Configurator tiers,
Snapshot templates, sub-account provisioning, menu-visibility toggles — is GoHighLevel account
configuration done in GHL's own web UI. There's no code for that; it's operational setup inside
GHL itself. This repo is the backend service GHL talks to over its API, not a replacement for GHL.

## Stack

Next.js 14 (App Router, TypeScript) for both the admin dashboard UI and the API routes, Prisma
(Postgres), Playwright + axe-core for real accessibility scans, Tailwind for the dashboard UI.

To **deploy** (Coolify, Docker, Postgres, env vars), see **[DEPLOY.md](./DEPLOY.md)**.

## Getting started (local)

```bash
docker compose -f docker-compose.dev.yml up -d   # local Postgres
npm install
cp .env.example .env
# fill in SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD at minimum
npm run db:push       # creates the schema
npm run db:seed       # creates your admin login
npm run dev            # http://localhost:3000
```

Everything else (`GHL_API_TOKEN`, uptime/cron secrets, Workspace/M365 credentials) is optional —
those integrations run in **dry-run mode** when unset, so the dashboard, scan history, and
incident tracking all work end-to-end before real credentials are wired in. Dry-run GHL calls are
still recorded in `GhlSyncLog` (visible on each client's detail page) so you can see what *would*
have been sent.

## Core pieces

### Accessibility scanning (`lib/integrations/accessibility-scanner.ts`)

Runs axe-core (WCAG 2.0/2.1 AA rule set) against a client's live site via headless Chromium,
scores it, and stores every violation. This is the actual audit trail — the compliance
positioning decision was "ongoing monitoring with a documented history," and this is what
generates that history.

- On-demand: the "Run scan now" button on a client's dashboard page, or `POST /api/clients/:id/scan`
- Scheduled: `POST /api/cron/accessibility-scan` (header `X-Cron-Secret`), meant to be hit daily by
  an external scheduler — it only actually rescans clients whose `scanCadenceDays` (7, by default)
  has elapsed. Alternatively, run `npm run scan:run` directly from a plain crontab entry if you'd
  rather not keep the app server reachable for cron.

### Client-facing compliance badge (`public/widget/accessibility-badge.js`)

The footer badge + 30-day log described in the spec's compliance-positioning decision. Inject it
into the GHL Snapshot's site-wide custom code (or a Custom HTML Page):

```html
<script>
  window.HEYLILY_CLIENT_ID = "<the client's id in this system>";
  window.HEYLILY_API_BASE = "https://admin.heylily.ai"; // wherever this app is deployed
</script>
<script src="https://admin.heylily.ai/widget/accessibility-badge.js" defer></script>
```

It renders a small "✓ Accessibility Compliance" button; clicking it fetches
`GET /api/compliance/:clientId/log` (public, CORS-enabled, no auth) and shows the last 30 days of
checks. **Legal review of this exact language is still an open item per the spec** — don't ship
copy changes to the badge without that sign-off.

### Uptime monitoring (`lib/integrations/uptime.ts`)

Point UptimeRobot's or Better Stack's alert webhook at:

```
POST https://admin.heylily.ai/api/webhooks/uptime?provider=uptimerobot&secret=<UPTIME_WEBHOOK_SECRET>
```

Register the client's monitor first (there's no dashboard UI for this yet — insert directly via
Prisma Studio or a script) so incoming events can be matched to a client:

```ts
await prisma.uptimeMonitor.create({
  data: { clientId, provider: "uptimerobot", externalMonitorId: "...", url: "https://client-site.com" },
});
```

A "down" event creates an `UptimeIncident` and fires `GHL_UPTIME_ALERT_WORKFLOW_WEBHOOK_URL` — per
the spec's decision, this is **internal-only**, there's no client-facing status page.

### GHL sync (`lib/integrations/ghl.ts`)

Every write to GHL (custom field updates, notes, workflow triggers) goes through this client and is
logged to `GhlSyncLog`, visible per-client in the dashboard. Set `GHL_API_TOKEN` to a Private
Integration token scoped to the sub-accounts this backend manages.

### Managed email seats (`lib/integrations/email-provisioning.ts`)

Tracks Google Workspace / Microsoft 365 seats per client for billing pass-through. The actual
Admin API calls (`callGoogleAdminApi` / `callMicrosoftGraphApi`) are stubbed — they need a
Workspace domain-wide-delegation service account or a Microsoft Graph app registration,
respectively, neither of which exist yet. Until then, provisioning still creates the `EmailSeat`
record (so the dashboard and billing math work), it just doesn't call out to Google/Microsoft.

## Data model

See `prisma/schema.prisma`. Key models: `Client` (sub-account record, tier, status),
`AccessibilityScan` + `RemediationNote` (the audit trail), `UptimeMonitor` + `UptimeIncident`,
`EmailSeat`, `GhlSyncLog`, `AdminUser`.

## Admin dashboard

`/dashboard` — client list with tier, health status (active/at-risk/churned), last scan score,
uptime status. `/dashboard/clients/:id` — full detail: scan history, remediation notes, uptime
incidents, email seats, recent GHL sync activity. Gated by a simple session-cookie login
(`/login`) backed by `AdminUser` — see `npm run db:seed`.

## Deploying

See **[DEPLOY.md](./DEPLOY.md)** for the full Coolify walkthrough. In short: it ships as a
Docker container (the `Dockerfile` bundles Chromium for the scanner) plus a Postgres database,
and redeploys on every push to `main`. The container entrypoint (`docker-entrypoint.sh`) syncs
the schema and seeds the admin user on boot.

## Relationship to the build spec's phases

| Phase | What's covered here |
|---|---|
| 1. Foundation | Not in scope — GHL account/Snapshot setup happens in GHL's UI |
| 2. Compliance layer | ✅ Scanning, audit trail, badge widget |
| 3. Monitoring layer | ✅ Uptime webhook receiver → GHL alert workflow |
| 4. Feature-gating | Not in scope — GHL menu/role config happens in GHL's UI; `lib/tier-config.ts` keeps this backend's tier logic in sync with what GHL's SaaS Configurator enforces |
| 5. Onboarding automation | Partial — this backend exposes `POST /api/clients` for programmatic client creation; wiring Stripe → auto-create-client → Snapshot clone is not yet built |
