/**
 * Hey Lily accessibility compliance badge.
 *
 * Injected on every client site. A fixed footer badge that opens the site's
 * real accessibility audit trail — the most recent 30 days of automated WCAG
 * scans, each with its date, result, and what was checked. The badge only
 * says "compliant" when the latest audit genuinely passed (0 issues); it
 * never fabricates a result. This is the client-facing view of the same scan
 * history used internally, so it's verifiable, not a claim.
 *
 * Usage: set window.HEYLILY_CLIENT_ID and window.HEYLILY_API_BASE before
 * loading this script.
 */
(function () {
  "use strict";

  var SHIELD =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" style="flex:0 0 auto">' +
    '<path fill="currentColor" d="M12 2 4 5v6c0 4.4 3.1 8.5 8 11 4.9-2.5 8-6.6 8-11V5l-8-3z"/>' +
    '<path fill="#0f2a1e" d="m10.6 14.6-2.3-2.3 1.1-1.1 1.2 1.2 3-3 1.1 1.1-4.1 4.1z"/></svg>';

  function init() {
    var clientId = window.HEYLILY_CLIENT_ID;
    var apiBase = window.HEYLILY_API_BASE;
    if (!clientId || !apiBase) {
      console.warn("[heylily] Accessibility badge not loaded: set HEYLILY_CLIENT_ID and HEYLILY_API_BASE");
      return;
    }

    var badge = document.createElement("button");
    badge.type = "button";
    badge.id = "heylily-a11y-badge";
    badge.setAttribute("aria-haspopup", "dialog");
    badge.setAttribute("aria-label", "View this site's accessibility compliance audit");
    badge.innerHTML = SHIELD + '<span>Accessibility Compliant</span>';

    // Positioning uses !important so the host site's CSS can't dislodge it —
    // it stays fixed to the bottom of the viewport and never scrolls away.
    var style = document.createElement("style");
    style.textContent =
      "#heylily-a11y-badge{position:fixed!important;bottom:16px!important;left:16px!important;z-index:2147483000!important;" +
      "display:inline-flex!important;align-items:center;gap:8px;margin:0;" +
      "background:#123524;color:#eafff2;border:1px solid #2e5c46;border-radius:999px;" +
      "padding:9px 15px;font:600 13px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer;" +
      "box-shadow:0 3px 12px rgba(0,0,0,.22)}" +
      "#heylily-a11y-badge:hover{background:#184330}" +
      "#heylily-a11y-badge:focus-visible{outline:2px solid #4ade80;outline-offset:2px}" +
      "#heylily-a11y-modal{position:fixed;inset:0;z-index:2147483001;display:none;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}" +
      "#heylily-a11y-modal.open{display:flex}" +
      "#heylily-a11y-panel{background:#fff;color:#111;border-radius:14px;max-width:460px;width:100%;" +
      "max-height:82vh;overflow-y:auto;padding:22px;font:14px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
      "#heylily-a11y-panel h2{margin:0 0 4px;font-size:17px;display:flex;align-items:center;gap:8px;color:#123524}" +
      "#heylily-a11y-panel .sub{color:#556;font-size:12.5px;margin:0 0 16px}" +
      "#heylily-a11y-status{border-radius:10px;padding:12px 14px;font-size:13.5px;font-weight:600;margin-bottom:14px}" +
      "#heylily-a11y-status.ok{background:#e7f6ee;color:#12633c}" +
      "#heylily-a11y-status.warn{background:#fdf0e3;color:#8a5314}" +
      "#heylily-a11y-panel table{width:100%;border-collapse:collapse;font-size:13px}" +
      "#heylily-a11y-panel th,#heylily-a11y-panel td{text-align:left;padding:7px 4px;border-bottom:1px solid #eef}" +
      "#heylily-a11y-panel .checks-h{font-weight:600;margin:0 0 4px;font-size:13px}" +
      "#heylily-a11y-scope{margin-top:16px;padding-top:14px;border-top:1px solid #eef;font-size:12.5px;color:#556}" +
      "#heylily-a11y-scope ul{margin:6px 0 0;padding-left:18px}" +
      "#heylily-a11y-close{margin-top:16px;background:#123524;color:#fff;border:none;border-radius:9px;padding:9px 16px;cursor:pointer;font:600 13px system-ui,sans-serif}";

    var modal = document.createElement("div");
    modal.id = "heylily-a11y-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "heylily-a11y-title");
    modal.innerHTML =
      '<div id="heylily-a11y-panel">' +
      '<h2 id="heylily-a11y-title">' + SHIELD + "Accessibility Compliance</h2>" +
      '<p class="sub">Independently audited for accessibility on a weekly schedule.</p>' +
      '<div id="heylily-a11y-body">Loading…</div>' +
      '<button type="button" id="heylily-a11y-close">Close</button>' +
      "</div>";

    function closeModal() {
      modal.classList.remove("open");
      badge.focus();
    }
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
    });

    function fmtDate(iso) {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    function render(data) {
      var body = modal.querySelector("#heylily-a11y-body");
      var checks = data.checks || [];
      var latest = checks[0];
      var passing = latest && latest.status === "COMPLETED" && latest.violationCount === 0;

      var html = "";
      if (passing) {
        html +=
          '<div id="heylily-a11y-status" class="ok">✓ This site passed its most recent accessibility audit on ' +
          fmtDate(latest.checkedAt) + " with zero issues.</div>";
      } else if (latest) {
        html +=
          '<div id="heylily-a11y-status" class="warn">This site is actively monitored. The latest audit is under review and any items are being remediated.</div>';
      } else {
        html += '<div id="heylily-a11y-status" class="warn">Accessibility monitoring is being set up for this site.</div>';
      }

      if (checks.length) {
        html += '<p class="checks-h">Audit history (last 30 days)</p>';
        html += "<table><thead><tr><th>Date</th><th>Result</th></tr></thead><tbody>";
        html += checks
          .map(function (c) {
            var label =
              c.status === "COMPLETED"
                ? c.violationCount === 0
                  ? "Passed — 0 issues"
                  : c.violationCount + " issue(s) — remediating"
                : "Audit re-running";
            return "<tr><td>" + fmtDate(c.checkedAt) + "</td><td>" + label + "</td></tr>";
          })
          .join("");
        html += "</tbody></table>";
      }

      var standards = data.standards || ["WCAG 2.0 Level A", "WCAG 2.1 Level AA"];
      html +=
        '<div id="heylily-a11y-scope"><strong>What we check</strong> — an automated scan of the page against:' +
        "<ul>" + standards.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul>" +
        "Scanned " + (data.checkCadence || "weekly") + ".</div>";

      body.innerHTML = html;
    }

    badge.addEventListener("click", function () {
      modal.classList.add("open");
      var closeBtn = modal.querySelector("#heylily-a11y-close");
      closeBtn.addEventListener("click", closeModal, { once: true });
      closeBtn.focus();
      fetch(apiBase.replace(/\/$/, "") + "/api/compliance/" + encodeURIComponent(clientId) + "/log")
        .then(function (res) {
          if (!res.ok) throw new Error("failed");
          return res.json();
        })
        .then(render)
        .catch(function () {
          modal.querySelector("#heylily-a11y-body").innerHTML =
            "<p>Unable to load the compliance log right now. Please try again later.</p>";
        });
    });

    document.head.appendChild(style);
    document.body.appendChild(badge);
    document.body.appendChild(modal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
