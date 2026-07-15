/**
 * Hey Lily accessibility compliance badge.
 *
 * Injected via GHL custom code (site-wide code injection, or inlined into
 * a Custom HTML Page) on every client site. Renders a small footer badge;
 * clicking it opens the last 30 days of accessibility checks, pulled live
 * from the backend compliance service — this is the client-facing view of
 * the same audit trail used internally, not a static claim.
 *
 * Usage: set window.HEYLILY_CLIENT_ID and window.HEYLILY_API_BASE before
 * loading this script, e.g.:
 *   <script>
 *     window.HEYLILY_CLIENT_ID = "clxxxxxx";
 *     window.HEYLILY_API_BASE = "https://admin.heylily.ai";
 *   </script>
 *   <script src="https://admin.heylily.ai/widget/accessibility-badge.js" defer></script>
 */
(function () {
  "use strict";

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
    badge.setAttribute("aria-label", "View accessibility compliance log");
    badge.textContent = "✓ Accessibility Compliance";

    var style = document.createElement("style");
    style.textContent =
      "#heylily-a11y-badge{position:fixed;bottom:16px;left:16px;z-index:2147483000;" +
      "background:#1b3a2f;color:#eafff2;border:1px solid #2e5c46;border-radius:999px;" +
      "padding:8px 14px;font:600 13px/1.2 system-ui,sans-serif;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.18)}" +
      "#heylily-a11y-badge:hover{background:#234a3b}" +
      "#heylily-a11y-badge:focus-visible{outline:2px solid #4ade80;outline-offset:2px}" +
      "#heylily-a11y-modal{position:fixed;inset:0;z-index:2147483001;display:none;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}" +
      "#heylily-a11y-modal.open{display:flex}" +
      "#heylily-a11y-panel{background:#fff;color:#111;border-radius:12px;max-width:480px;" +
      "width:100%;max-height:80vh;overflow-y:auto;padding:20px;font:14px/1.4 system-ui,sans-serif}" +
      "#heylily-a11y-panel h2{margin:0 0 4px;font-size:16px}" +
      "#heylily-a11y-panel .subtitle{color:#555;font-size:12px;margin-bottom:14px}" +
      "#heylily-a11y-panel table{width:100%;border-collapse:collapse;font-size:13px}" +
      "#heylily-a11y-panel th,#heylily-a11y-panel td{text-align:left;padding:6px 4px;" +
      "border-bottom:1px solid #eee}" +
      "#heylily-a11y-close{margin-top:14px;background:#1b3a2f;color:#fff;border:none;" +
      "border-radius:8px;padding:8px 14px;cursor:pointer;font:600 13px system-ui,sans-serif}";

    var modal = document.createElement("div");
    modal.id = "heylily-a11y-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "heylily-a11y-title");
    modal.innerHTML =
      '<div id="heylily-a11y-panel">' +
      '<h2 id="heylily-a11y-title">Accessibility Compliance Log</h2>' +
      '<div class="subtitle">Automated WCAG checks, most recent 30 days (weekly cadence)</div>' +
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

    function renderLog(data) {
      var body = modal.querySelector("#heylily-a11y-body");
      if (!data.checks || data.checks.length === 0) {
        body.innerHTML = "<p>No checks recorded yet in the last 30 days.</p>";
        return;
      }

      var rows = data.checks
        .map(function (check) {
          var date = new Date(check.checkedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          var statusLabel =
            check.status === "COMPLETED"
              ? check.violationCount === 0
                ? "No issues found"
                : check.violationCount + " issue(s) found"
              : "Check failed";
          return "<tr><td>" + date + "</td><td>" + statusLabel + "</td></tr>";
        })
        .join("");

      body.innerHTML =
        "<table><thead><tr><th>Date</th><th>Result</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }

    badge.addEventListener("click", function () {
      modal.classList.add("open");
      var closeBtn = modal.querySelector("#heylily-a11y-close");
      closeBtn.addEventListener("click", closeModal, { once: true });
      closeBtn.focus();

      fetch(apiBase.replace(/\/$/, "") + "/api/compliance/" + encodeURIComponent(clientId) + "/log")
        .then(function (res) {
          if (!res.ok) throw new Error("Request failed");
          return res.json();
        })
        .then(renderLog)
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
