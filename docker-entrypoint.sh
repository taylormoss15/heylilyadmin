#!/bin/sh
# Runtime entrypoint: sync the database schema, ensure the admin user exists,
# then start the server. Safe to run on every deploy — db push is idempotent
# and the seed upserts the admin user.
set -e

# db push is idempotent and additive-safe. It deliberately does NOT include
# --accept-data-loss: a schema change that would drop data fails the deploy
# loudly instead of silently destroying it. Before you have irreplaceable
# client data (or need a destructive change), switch to Prisma migrations —
# see DEPLOY.md.
echo "→ Syncing database schema..."
npx prisma db push --skip-generate

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "→ Ensuring admin user ($ADMIN_EMAIL)..."
  npx tsx prisma/seed.ts || echo "  (seed skipped/failed — continuing)"
else
  echo "→ ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed."
fi

echo "→ Starting server on port ${PORT:-3000}..."
exec npm run start
