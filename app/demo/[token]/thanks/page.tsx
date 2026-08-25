import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're in — Hey Lily",
  robots: { index: false },
};

export default async function ThanksPage({ params }: { params: { token: string } }) {
  const demo = await prisma.demo.findUnique({ where: { token: params.token } });
  const name = demo?.businessName || "your firm";
  const calendly = process.env.CALENDLY_URL || "https://calendly.com";

  const steps = [
    {
      n: "1",
      title: "We're building your new site",
      body: "Our team is finalizing your fully-compliant, high-converting website right now. Nothing for you to do.",
    },
    {
      n: "2",
      title: "Book your 10-minute kickoff",
      body: "Grab a quick call so we can confirm your details, phone number, and where you want leads to go.",
      cta: { label: "Book my kickoff call", href: calendly },
    },
    {
      n: "3",
      title: "Watch your inbox",
      body: "You'll get your live site link and your first monthly Digital Trust Score report from Hey Lily.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <div className="text-4xl">🎉</div>
          <h1 className="mt-3 text-2xl font-bold">You&apos;re in!</h1>
          <p className="mt-1 text-slate-600">
            Welcome aboard, {name}. Your payment went through and we&apos;re on it. Here&apos;s exactly what happens next.
          </p>

          <ol className="mt-6 space-y-4">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {s.n}
                </span>
                <div>
                  <div className="font-semibold text-slate-900">{s.title}</div>
                  <p className="text-sm text-slate-600">{s.body}</p>
                  {s.cta && (
                    <a
                      href={s.cta.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      {s.cta.label}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-xs text-slate-400">
            Questions? Just reply to any Hey Lily email — a real person will help.
          </p>
        </div>
      </div>
    </div>
  );
}
