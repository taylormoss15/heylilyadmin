/**
 * Hey Lily site analytics — first-party, cookieless.
 *
 * Counts three things per client site so we can email the business a simple
 * monthly report: page views, taps on phone (tel:) links/buttons, and contact
 * form submissions. No cookies, no personal data, no cross-site tracking — just
 * daily counts. Uses window.HEYLILY_CLIENT_ID / window.HEYLILY_API_BASE (set by
 * the badge/contact widgets).
 */
(function () {
  "use strict";
  var cid = window.HEYLILY_CLIENT_ID;
  var base = window.HEYLILY_API_BASE;
  if (!cid || !base) return;

  function send(event) {
    try {
      var url = base.replace(/\/$/, "") + "/api/track";
      var body = JSON.stringify({ c: cid, e: event, p: location.pathname });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
      }
    } catch (e) {
      /* never break the host page */
    }
  }

  // Page view (once per load).
  send("pageview");

  // Phone taps — tel: links and anything marked data-hl-call.
  document.addEventListener(
    "click",
    function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest('a[href^="tel:"], [data-hl-call]') : null;
      if (el) send("tel");
    },
    true
  );

  // Contact form submissions.
  document.addEventListener(
    "submit",
    function (ev) {
      if (ev.target && ev.target.tagName === "FORM") send("form");
    },
    true
  );
})();
