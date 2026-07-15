import { NextRequest, NextResponse } from "next/server";
import { getClientsDueForScan, scanClientAndPersist } from "@/lib/integrations/accessibility-scanner";

// Meant to be hit by an external scheduler (Vercel Cron, a GitHub Actions
// schedule, or a plain cron job on the Lightsail box) on a daily cadence.
// Each client only actually gets rescanned once `scanCadenceDays` has
// elapsed (weekly by default per spec) — this endpoint just checks who's due.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await getClientsDueForScan();
  const results = [];
  for (const client of due) {
    const scan = await scanClientAndPersist(client);
    results.push({ clientId: client.id, scanId: scan.id, status: scan.status });
  }

  return NextResponse.json({ scanned: results.length, results });
}
