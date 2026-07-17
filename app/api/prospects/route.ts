import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProspectUrl } from "@/lib/prospecting/scan";

const bodySchema = z.object({
  // One or many; the UI sends a textarea split into lines.
  urls: z.array(z.string()).min(1).max(500),
});

export async function GET() {
  const prospects = await prisma.prospect.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ prospects });
}

// Bulk-add prospect URLs. Normalizes each, drops blanks/invalid, dedupes
// within the batch AND against existing rows, then creates PENDING prospects
// to be scanned. Returns how many were added vs skipped as duplicates.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  let invalid = 0;
  for (const raw of parsed.data.urls) {
    const url = normalizeProspectUrl(raw);
    if (!url) {
      if (raw.trim()) invalid += 1;
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
  }

  if (normalized.length === 0) {
    return NextResponse.json({ added: 0, duplicates: 0, invalid, prospects: [] }, { status: 200 });
  }

  const existing = await prisma.prospect.findMany({
    where: { url: { in: normalized } },
    select: { url: true },
  });
  const existingSet = new Set(existing.map((e) => e.url));
  const toCreate = normalized.filter((u) => !existingSet.has(u));

  if (toCreate.length) {
    await prisma.prospect.createMany({ data: toCreate.map((url) => ({ url })) });
  }

  const prospects = await prisma.prospect.findMany({
    where: { url: { in: toCreate } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    { added: toCreate.length, duplicates: existingSet.size, invalid, prospects },
    { status: 201 }
  );
}
