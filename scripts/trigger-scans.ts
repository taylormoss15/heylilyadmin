// Standalone CLI runner for the weekly accessibility scan sweep — an
// alternative to hitting POST /api/cron/accessibility-scan over HTTP, for
// environments where a plain crontab entry calling `npm run scan:run` is
// simpler than keeping the app server reachable for cron.
//
// Usage: npm run scan:run

import { prisma } from "../lib/prisma";
import { getClientsDueForScan, scanClientAndPersist } from "../lib/integrations/accessibility-scanner";

async function main() {
  const due = await getClientsDueForScan();
  console.log(`${due.length} client(s) due for an accessibility scan.`);

  for (const client of due) {
    process.stdout.write(`Scanning ${client.name} (${client.domain ?? client.siteUrl ?? "no URL"})... `);
    const scan = await scanClientAndPersist(client);
    console.log(scan.status === "COMPLETED" ? `done — score ${scan.score}` : `FAILED — ${scan.errorMessage}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
