"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleScan() {
    setLoading(true);
    await fetch(`/api/clients/${clientId}/scan`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={handleScan} className="btn-secondary text-sm" disabled={loading}>
      {loading ? "Scanning…" : "Run scan now"}
    </button>
  );
}
