/**
 * Hey Lily contact-form relay.
 *
 * Injected on every client site alongside the compliance badge. Static sites
 * (e.g. a Custom HTML page on GHL) have no backend, so this intercepts the
 * contact form's submit and relays the entry to the Hey Lily API, which emails
 * it to the business. Falls back to letting the form submit normally if the
 * relay can't be reached.
 *
 * Uses the same config the badge sets: window.HEYLILY_CLIENT_ID and
 * window.HEYLILY_API_BASE.
 */
(function () {
  "use strict";

  function init() {
    var clientId = window.HEYLILY_CLIENT_ID;
    var apiBase = window.HEYLILY_API_BASE;
    if (!clientId || !apiBase) return;

    var forms = document.querySelectorAll("form");
    Array.prototype.forEach.call(forms, function (form) {
      // Skip the accessibility badge modal or anything that opts out.
      if (form.hasAttribute("data-heylily-ignore")) return;

      // Add a honeypot the moment we take over the form.
      var hp = document.createElement("input");
      hp.type = "text";
      hp.name = "_hp";
      hp.tabIndex = -1;
      hp.autocomplete = "off";
      hp.setAttribute("aria-hidden", "true");
      hp.style.cssText = "position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0";
      form.appendChild(hp);

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        var data = {};
        var fd = new FormData(form);
        fd.forEach(function (value, key) {
          if (typeof value === "string") data[key] = value;
        });

        var btn = form.querySelector('button[type="submit"], input[type="submit"], button');
        var originalText = btn ? btn.textContent : null;
        if (btn) {
          btn.disabled = true;
          if (btn.tagName === "BUTTON") btn.textContent = "Sending…";
        }

        fetch(apiBase.replace(/\/$/, "") + "/api/forms/" + encodeURIComponent(clientId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("relay failed");
            showThanks(form);
          })
          .catch(function () {
            if (btn) {
              btn.disabled = false;
              if (btn.tagName === "BUTTON" && originalText) btn.textContent = originalText;
            }
            showError(form);
          });
      });
    });
  }

  function showThanks(form) {
    var msg = document.createElement("div");
    msg.setAttribute("role", "status");
    msg.style.cssText =
      "padding:18px 20px;border-radius:12px;background:#e7f6ee;color:#12633c;font:600 15px/1.5 system-ui,sans-serif;text-align:center";
    msg.textContent = "Thank you — your message has been sent. We'll be in touch shortly.";
    form.parentNode.replaceChild(msg, form);
    msg.focus && msg.focus();
  }

  function showError(form) {
    var existing = form.querySelector("[data-heylily-formerror]");
    if (existing) return;
    var err = document.createElement("p");
    err.setAttribute("data-heylily-formerror", "");
    err.setAttribute("role", "alert");
    err.style.cssText = "margin:10px 0 0;color:#b91c1c;font:14px system-ui,sans-serif";
    err.textContent = "Sorry — something went wrong sending your message. Please try again or call us.";
    form.appendChild(err);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
