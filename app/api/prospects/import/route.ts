import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProspectUrl } from "@/lib/prospecting/scan";

const rowSchema = z.object({
  url: z.string().min(1),
  businessName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  estimatedRevenue: z.string().optional().nullable(),
  employees: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedin: z.string().optional().nullable(),
  emailStatus: z.string().optional().nullable(),
});
const bodySchema = z.object({ rows: z.array(rowSchema).max(5000) });

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Bulk import a lead list (parsed CSV rows) with contact details. Upserts by
// normalized URL — new leads are created; existing ones get any missing fields
// filled in without overwriting what's already there.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid file" }, { status: 400 });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of parsed.data.rows) {
    const url = normalizeProspectUrl(row.url);
    if (!url) {
      skipped++;
      continue;
    }
    const existing = await prisma.prospect.findUnique({ where: { url } });
    const fields = {
      businessName: clean(row.businessName),
      email: clean(row.email),
      phone: clean(row.phone),
      leadName: clean(row.name),
      contactTitle: clean(row.title),
      industry: clean(row.industry),
      estimatedRevenue: clean(row.estimatedRevenue),
      employees: clean(row.employees),
      location: clean(row.location),
      contactLinkedin: clean(row.linkedin),
      emailStatus: clean(row.emailStatus),
    };

    if (existing) {
      await prisma.prospect.update({
        where: { id: existing.id },
        data: {
          businessName: existing.businessName ?? fields.businessName,
          email: existing.email ?? fields.email,
          phone: existing.phone ?? fields.phone,
          leadName: existing.leadName ?? fields.leadName,
          contactTitle: existing.contactTitle ?? fields.contactTitle,
          industry: existing.industry ?? fields.industry,
          estimatedRevenue: existing.estimatedRevenue ?? fields.estimatedRevenue,
          employees: existing.employees ?? fields.employees,
          location: existing.location ?? fields.location,
          contactLinkedin: existing.contactLinkedin ?? fields.contactLinkedin,
          // Deliverability can change between list pulls — always take the latest.
          emailStatus: fields.emailStatus ?? existing.emailStatus,
        },
      });
      updated++;
    } else {
      await prisma.prospect.create({ data: { url, source: "manual", ...fields } });
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, updated, skipped });
}
