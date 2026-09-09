import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const FIELD: Record<string, "pageviews" | "telTaps" | "formFills"> = {
  pageview: "pageviews",
  tel: "telTaps",
  form: "formFills",
};

// First-party analytics beacon from client sites (public/widget/track.js).
// Increments a daily per-client counter. No cookies, no PII — just counts.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const clientId = typeof body?.c === "string" ? body.c.slice(0, 40) : "";
  const field = FIELD[typeof body?.e === "string" ? body.e : ""];
  if (!clientId || !field) return new NextResponse(null, { status: 204, headers: CORS });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  try {
    await prisma.siteMetric.upsert({
      where: { clientId_date: { clientId, date } },
      create: {
        clientId,
        date,
        pageviews: field === "pageviews" ? 1 : 0,
        telTaps: field === "telTaps" ? 1 : 0,
        formFills: field === "formFills" ? 1 : 0,
      },
      update: { [field]: { increment: 1 } },
    });
  } catch {
    /* never surface an error to the client site */
  }
  return new NextResponse(null, { status: 204, headers: CORS });
}
