import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import UnsubButton from "./unsub-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe — Hey Lily", robots: { index: false } };

export default async function UnsubscribePage({ params }: { params: { id: string } }) {
  const prospect = await prisma.prospect.findUnique({
    where: { id: params.id },
    select: { businessName: true, email: true, leadEmail: true, unsubscribedAt: true },
  });
  const already = Boolean(prospect?.unsubscribedAt);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-bold text-brand-600">Hey Lily</div>
        {already ? (
          <>
            <h1 className="mt-3 text-xl font-semibold">You&apos;re unsubscribed</h1>
            <p className="mt-1 text-sm text-slate-500">You won&apos;t receive any more emails from us.</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-semibold">Unsubscribe?</h1>
            <p className="mt-1 text-sm text-slate-500">
              We&apos;ll stop emailing {prospect?.businessName || "you"}. This can&apos;t be undone.
            </p>
            <div className="mt-5">
              <UnsubButton id={params.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
