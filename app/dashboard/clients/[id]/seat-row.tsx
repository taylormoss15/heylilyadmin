"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SeatRow({
  clientId,
  seatId,
  seatEmail,
  provider,
  status,
}: {
  clientId: string;
  seatId: string;
  seatEmail: string;
  provider: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDeprovision() {
    setLoading(true);
    await fetch(`/api/clients/${clientId}/seats`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 pr-4">{seatEmail}</td>
      <td className="py-2 pr-4 text-slate-500">{provider === "GOOGLE_WORKSPACE" ? "Google Workspace" : "Microsoft 365"}</td>
      <td className="py-2 pr-4">
        <span className={status === "ACTIVE" ? "text-emerald-600" : "text-slate-400"}>{status.toLowerCase()}</span>
      </td>
      <td className="py-2 text-right">
        {status === "ACTIVE" && (
          <button onClick={handleDeprovision} disabled={loading} className="text-xs text-red-600 hover:underline">
            {loading ? "Removing…" : "Deprovision"}
          </button>
        )}
      </td>
    </tr>
  );
}
