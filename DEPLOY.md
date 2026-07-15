# Deploying Hey Lily Admin on Coolify

This app deploys as a single Docker container (built from the `Dockerfile`) plus
a Postgres database. Coolify builds from your GitHub repo and redeploys on every
push to `main`. You iterate by pushing code — you never edit files on the server.

---

## One-time server setup

1. **Provision a VPS** — Ubuntu 22.04+, 2 GB RAM minimum (the Chromium-based
   scanner wants headroom; 4 GB is comfortable). Hetzner, DigitalOcean, etc.
2. **Install Coolify** (on the VPS):
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
   Then open `http://<server-ip>:8000` and create your admin account.
3. **Point DNS** — add an `A` record for `admin.heylily.ai` (or whatever host you
   want) pointing at the server's IP. Coolify provisions SSL automatically via
   Let's Encrypt once DNS resolves.

---

## Create the project in Coolify

### 1. Postgres database
- In your Coolify project → **+ New Resource → Database → PostgreSQL**.
- Create it. Coolify shows a connection string — you'll reference it in the app.
  Keep the database and the app in the **same Coolify project** so they share a
  network and can talk over the internal hostname.

### 2. The application
- **+ New Resource → Application → Public/Private Repository** → connect GitHub
  and pick `taylormoss15/heylilyadmin`, branch `main`.
- **Build Pack: Dockerfile** (Coolify auto-detects the `Dockerfile` in the repo).
- **Port: 3000**.
- Set the domain (e.g. `https://admin.heylily.ai`).

### 3. Environment variables (Application → Environment Variables)

Required:
| Variable | Value |
|---|---|
| `DATABASE_URL` | The Postgres connection string from step 1 (use the **internal** URL Coolify provides for app↔db). Append `?schema=public` if not present. |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Your admin login email (creates/updates the admin user on deploy) |
| `ADMIN_PASSWORD` | Your admin login password |
| `ADMIN_BASE_URL` | The app's public URL, e.g. `https://admin.heylily.ai` (used by the compliance badge embedded on client sites, and by local-fallback image URLs) |

Optional — integrations (leave unset to run in dry-run/mock/fallback mode):
| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | Live AI site editor (otherwise mock mode) |
| `ANTHROPIC_MODEL` | Override the model (default `claude-opus-4-8`) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 image hosting (otherwise local-disk fallback) |
| `GHL_API_TOKEN` | Live GHL writes (otherwise logged dry-run) |
| `GHL_UPTIME_ALERT_WORKFLOW_WEBHOOK_URL` | The internal "site down" alert workflow |
| `UPTIME_WEBHOOK_SECRET` | Shared secret for the uptime webhook receiver |
| `CRON_SECRET` | Shared secret for the scheduled-scan endpoint |
| `GOOGLE_WORKSPACE_*`, `MICROSOFT_GRAPH_*` | Live email-seat provisioning |

> Do **not** set `PLAYWRIGHT_EXECUTABLE_PATH` in production — the image installs
> Chromium via Playwright and finds it automatically. That variable is only for
> the sandboxed dev environment this was built in.

### 4. Deploy
Click **Deploy**. On boot the container runs `docker-entrypoint.sh`, which:
1. syncs the database schema (`prisma db push`),
2. creates/updates your admin user (from `ADMIN_EMAIL` / `ADMIN_PASSWORD`),
3. starts the server.

Visit your domain and log in.

---

## The iteration loop (how you "tweak the product")

```
edit code (locally, or ask Claude) → git push origin main → Coolify auto-redeploys
```

Enable **Auto Deploy** on the application in Coolify so every push to `main`
triggers a rebuild. A deploy takes ~2–4 minutes (the Chromium install is the
slow part; Coolify caches Docker layers so subsequent builds are faster).

---

## Scheduled accessibility scans

The weekly scan sweep is an HTTP endpoint, not an internal cron. Add a Coolify
**Scheduled Task** (or any external cron) that runs daily:

```bash
curl -X POST https://admin.heylily.ai/api/cron/accessibility-scan \
  -H "x-cron-secret: $CRON_SECRET"
```

It only rescans clients whose weekly cadence has elapsed, so a daily trigger is
correct.

---

## Persistent data & the image fallback

- **Database**: lives in the Postgres resource — durable across redeploys. Back
  it up in Coolify (Database → Backups).
- **Images**: once `R2_*` is set, uploads go to Cloudflare R2 (durable, CDN).
  Until then, the local-disk fallback writes to `.uploads/` **inside the
  container**, which is wiped on redeploy — fine for testing, but set up R2
  before real client sites depend on uploaded images.

---

## Notes

- **Schema changes**: the entrypoint uses `prisma db push`, which is additive-safe
  — a change that would drop data fails the deploy instead of destroying it.
  Before you accumulate irreplaceable client data (or need a destructive change),
  switch to Prisma migrations: run `npx prisma migrate dev --name <change>`
  locally against a Postgres, commit the generated `prisma/migrations/`, and
  change the entrypoint's `prisma db push` to `prisma migrate deploy`.
- **Resources**: the scanner launches headless Chromium per scan. On a 2 GB box,
  avoid running many concurrent scans; the daily cron sweep is sequential, so
  that's fine.
- **Local development** after the Postgres switch:
  ```bash
  docker compose -f docker-compose.dev.yml up -d   # local Postgres
  cp .env.example .env                             # fill in SESSION_SECRET etc.
  npm install
  npm run db:push
  npm run db:seed
  npm run dev
  ```
