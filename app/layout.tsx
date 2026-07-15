import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hey Lily Admin",
  description: "Admin backend for Hey Lily's Mini-IT SaaS platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
