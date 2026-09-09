"use client";

import { useEffect, useRef, useState } from "react";

// Build the bookmarklet source with the rep's token embedded. It captures the
// current page's HTML in the rep's own browser session (so bot blockers see a
// human, not our server) and posts it to the manual-scan endpoint.
function buildCode(token: string, base: string) {
  return `javascript:(function(){var t=${JSON.stringify(token)};function toast(m,c){var d=document.createElement('div');d.textContent=m;d.style.cssText='position:fixed;z-index:2147483647;top:16px;right:16px;max-width:340px;background:'+(c||'#7C3AED')+';color:#fff;font:600 14px system-ui,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35)';document.documentElement.appendChild(d);setTimeout(function(){d.remove();},7000);}toast('Hey Lily: scanning this page…');fetch(${JSON.stringify(base)}+'/api/public/manual-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,url:location.href,html:document.documentElement.outerHTML})}).then(function(r){return r.json();}).then(function(d){toast(d.ok?('\\u2713 Scored '+(d.businessName||d.url)+': '+d.trustScore+'/100 \\u2014 now in Prospecting'):('\\u2717 '+(d.error||'Scan failed')),d.ok?'#059669':'#dc2626');}).catch(function(){toast('\\u2717 Could not reach Hey Lily','#dc2626');});})();`;
}

export default function Bookmarklet({ initialToken, baseUrl }: { initialToken: string | null; baseUrl: string }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  const code = token ? buildCode(token, baseUrl) : "";

  // Set the javascript: href directly on the DOM node — React strips javascript:
  // URLs from href props, but a bookmarklet needs exactly that.
  useEffect(() => {
    if (linkRef.current && code) linkRef.current.setAttribute("href", code);
  }, [code]);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/account/capture-token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) setToken(data.token);
    setBusy(false);
  }

  return (
    <div className="card max-w-2xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Manual scanner (for bot-blocked sites)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Some sites (Cloudflare, etc.) block our automated scanner. This bookmarklet runs the scan from <em>your</em> browser instead —
          open the site, click the bookmark, and it scores the lead into your Prospecting board.
        </p>
      </div>

      {token ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">
              1. Drag this button to your bookmarks bar:&nbsp;
            </p>
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => e.preventDefault()}
              draggable
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
              title="Drag me to your bookmarks bar"
            >
              🌸 Hey Lily: Scan this site
            </a>
            <p className="mt-2 text-[11px] text-slate-400">
              2. On a site that won&apos;t scan, click the bookmark. You&apos;ll see the score pop up and the lead appears in Prospecting, assigned to you.
            </p>
          </div>

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Can&apos;t drag it? Copy the code and make a bookmark manually.</summary>
            <textarea readOnly value={code} className="input mt-2 h-24 w-full font-mono text-[11px]" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="btn-secondary mt-1 text-xs"
            >
              {copied ? "Copied!" : "Copy bookmarklet code"}
            </button>
            <p className="mt-1">Create a new bookmark and paste this as the URL/location.</p>
          </details>

          <button onClick={generate} disabled={busy} className="text-xs text-slate-400 hover:text-slate-700">
            {busy ? "Regenerating…" : "Regenerate token (invalidates the old bookmarklet)"}
          </button>
        </>
      ) : (
        <button onClick={generate} disabled={busy} className="btn text-sm">
          {busy ? "Generating…" : "Generate my scanner bookmarklet"}
        </button>
      )}
    </div>
  );
}
