import type { Metadata } from "next";
import ScanApp from "./scan-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free Website Health Scan — Hey Lily",
  description: "Scan your site free for accessibility (ADA/WCAG) risk and search/SEO gaps in seconds.",
};

export default function ScanPage() {
  const ctaUrl = process.env.DEMO_CTA_URL || "https://heylily.ai";
  return <ScanApp ctaUrl={ctaUrl} />;
}
