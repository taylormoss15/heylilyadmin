"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DesignChatContext } from "@/lib/site/design-chat";

export default function AdminPreviewBanner({ prospectId, recipients, reviewStatus, blocked, aiConfigured, children }: {
  children: React.ReactNode;
  prospectId: string;
  recipients: string[];
  reviewStatus: string;
  blocked: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<DesignChatContext["history"]>([]);
  const [screenshots, setScreenshots] = useState<DesignChatContext["screenshots"]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(reviewStatus === "APPROVED");

  async function act(edit: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/${edit ? "demo/edit" : "review"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit ? { instruction, chat: true, history: history.slice(-12).map((turn, i, recent) => ({ ...turn, screenshots: i >= recent.length - 2 ? turn.screenshots : undefined })), screenshots } : { status: "APPROVED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed. Please try again.");
      if (edit) {
        setHistory((turns) => [...turns, { role: "user", text: instruction, screenshots }, { role: "assistant", text: data.summary }].slice(-12) as DesignChatContext["history"]);
        setInstruction("");
        setScreenshots([]);
        if (data.changed) {
          setApproved(false);
          // Refresh the server report and current iframe without losing chat state.
          document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
            const url = new URL(frame.src);
            if (url.origin === window.location.origin && url.pathname.endsWith("/site")) {
              url.searchParams.set("revision", String(Date.now()));
              frame.src = url.toString();
            }
          });
          router.refresh();
        }
      } else {
        setApproved(true);
        setMessage("Approved and queued for sending. No email has been sent.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
    <section aria-label="Admin website review" className="border-b border-indigo-200 bg-indigo-50 px-4 py-3 text-slate-900 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">AI website changes</h2>
          <p className="break-words text-xs">Send to: {recipients.length ? recipients.join(", ") : "No recipient email — add one in the dashboard."}</p>
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="btn-secondary text-sm">{open ? "Hide design chat" : "Open design chat"}</button>
        <button onClick={() => void act(false)} disabled={busy || uploading || approved || Boolean(blocked) || Boolean(instruction.trim()) || Boolean(screenshots.length)} className="btn text-sm disabled:opacity-50">{approved ? "Approved — queued" : "Approve & Queue"}</button>
      </div>
      <div aria-live="polite" className="mx-auto max-w-7xl text-xs">
        {!aiConfigured && <p className="mt-2">AI editing is not configured for this environment.</p>}
        {blocked && <p className="mt-2">{blocked}</p>}
        {instruction.trim() && <p className="mt-2">Send your message or clear the text before approving.</p>}
        {message && <p className="mt-2">{message}</p>}
      </div>
    </section>
    <div className="flex flex-col-reverse items-start lg:flex-row">
      <main className="min-w-0 w-full flex-1">{children}</main>
      {open && <aside aria-label="AI design chat" className="w-full shrink-0 space-y-3 border-l border-indigo-200 bg-indigo-50 p-4 lg:sticky lg:top-0 lg:h-screen lg:w-[400px] lg:overflow-y-auto print:hidden">
        <div className="flex items-center justify-between"><h2 className="font-semibold">AI design chat</h2><button onClick={() => setOpen(false)} className="text-sm underline">Close chat</button></div>
        <div role="log" aria-label="Design conversation" aria-live="polite" className="max-h-64 space-y-2 overflow-y-auto">
          {!history.length && <p className="text-sm">Tell me what to change, ask a design question, or attach a reference screenshot. Follow up to refine the result.</p>}
          {history.map((turn, i) => <div key={i} className="rounded-lg bg-white p-3 text-sm">
            <p className="font-semibold">{turn.role === "user" ? "You" : "AI designer"}</p>
            <p className="whitespace-pre-wrap">{turn.text}</p>
            {turn.screenshots?.map((shot, j) => <img key={j} alt="Attached design reference" src={`data:${shot.mediaType};base64,${shot.data}`} className="mt-2 max-h-32 rounded" />)}
          </div>)}
          {busy && <p role="status" className="text-sm">Working on your message…</p>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void act(true); }} className="space-y-2">
          <label htmlFor="ai-preview-change" className="sr-only">Message the AI designer</label>
          <textarea id="ai-preview-change" value={instruction} maxLength={8000} onChange={(e) => setInstruction(e.target.value)} placeholder="Make the header look like this screenshot, but keep our colors…" disabled={busy || !aiConfigured} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">Attach screenshots
              <input type="file" aria-label="Attach screenshots" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || uploading || !aiConfigured} onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (screenshots.length + files.length > 2 || files.some((f) => f.size > 3 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(f.type))) {
                  setMessage("Attach up to two PNG, JPEG or WebP screenshots, 3 MB each."); return;
                }
                setUploading(true);
                try {
                  const shots = await Promise.all(files.map((file) => new Promise<DesignChatContext["screenshots"][number]>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ mediaType: file.type as "image/png" | "image/jpeg" | "image/webp", data: String(reader.result).split(",")[1] });
                    reader.onerror = () => reject(new Error("Could not read screenshot."));
                    reader.readAsDataURL(file);
                  })));
                  setScreenshots((current) => [...current, ...shots]);
                  setMessage("");
                } catch { setMessage("Could not read screenshot. Please try again."); }
                finally { setUploading(false); }
              }} className="ml-2 text-xs" />
            </label>
            <button disabled={busy || uploading || !aiConfigured || !instruction.trim()} className="btn text-sm disabled:opacity-50">{busy ? "Working…" : "Send message"}</button>
            <button type="button" disabled={busy} onClick={() => { setHistory([]); setMessage(""); }} className="text-xs underline">Clear conversation</button>
          </div>
          <div className="flex flex-wrap gap-2">{screenshots.map((shot, i) => <div key={i}>
            <img alt={`Screenshot ${i + 1}`} src={`data:${shot.mediaType};base64,${shot.data}`} className="h-20 rounded" />
            <button type="button" disabled={busy} onClick={() => setScreenshots((shots) => shots.filter((_, j) => j !== i))} className="text-xs underline">Remove screenshot {i + 1}</button>
          </div>)}</div>
          <p className="text-xs text-slate-500">Conversation stays in this tab until you reload. Screenshots are sent to the AI with your message.</p>
        </form>
      </aside>}
    </div>
    </div>
  );
}
