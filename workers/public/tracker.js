/**
 * ============================================================
 * Swarme Edge Tracker — Phase 16: CRO Telemetry Beacon
 * ============================================================
 *
 * A zero-dependency, lightweight (~1.2 KB gzipped) script that
 * tracks user engagement on published articles and silently
 * beacons the data to the Swarme edge network when the user
 * navigates away.
 *
 * Tracked signals:
 *   1. Scroll Depth — max percentage of the page scrolled
 *   2. Dwell Time   — seconds the tab was actively visible
 *   3. CTA Clicks   — clicks on any element with .swarm-cta
 *
 * Usage:
 *   <script
 *     src="https://edge.swarme.io/tracker.js"
 *     data-asset-id="asset_xxx"
 *     data-endpoint="https://edge.swarme.io/api/telemetry/ingest"
 *     defer
 *   ></script>
 *
 * Privacy: No cookies. No fingerprinting. No PII.
 * GDPR: Checks window.userConsentGranted before beaconing.
 *        If the flag is absent or false, telemetry is silently suppressed.
 * Transport: navigator.sendBeacon (non-blocking, fire-and-forget)
 * ============================================================
 */
(function () {
  "use strict";

  // ── Config from script tag attributes ──
  var script = document.currentScript;
  if (!script) return;

  var assetId = script.getAttribute("data-asset-id");
  var endpoint =
    script.getAttribute("data-endpoint") || "/api/telemetry/ingest";

  if (!assetId) {
    console.warn("[Swarme Tracker] Missing data-asset-id attribute.");
    return;
  }

  // ── State ──
  var maxScrollDepth = 0;
  var dwellStart = Date.now();
  var dwellAccumulated = 0;
  var isVisible = !document.hidden;
  var ctaClicks = 0;
  var sent = false;

  // ── Scroll Depth Tracking ──
  function computeScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var winHeight = window.innerHeight;
    var scrollable = docHeight - winHeight;

    if (scrollable <= 0) return 100;

    var depth = Math.round((scrollTop / scrollable) * 100);
    return Math.min(100, Math.max(0, depth));
  }

  function onScroll() {
    var depth = computeScrollDepth();
    if (depth > maxScrollDepth) {
      maxScrollDepth = depth;
    }
  }

  // ── Dwell Time Tracking (only counts visible time) ──
  function onVisibilityChange() {
    if (document.hidden) {
      // Tab went hidden — pause dwell clock
      if (isVisible) {
        dwellAccumulated += Date.now() - dwellStart;
        isVisible = false;
      }
    } else {
      // Tab became visible — restart dwell clock
      dwellStart = Date.now();
      isVisible = true;
    }
  }

  // ── CTA Click Tracking ──
  function onCtaClick(e) {
    var el = e.target;
    // Walk up to 5 parents to find .swarm-cta
    for (var i = 0; i < 5 && el && el !== document; i++) {
      if (el.classList && el.classList.contains("swarm-cta")) {
        ctaClicks++;
        return;
      }
      el = el.parentElement;
    }
  }

  // ── Beacon sender ──
  function sendBeacon() {
    if (sent) return;
    sent = true;

    // ── GDPR Consent Gate ──
    // If a Cookie Consent Manager has been loaded, it sets
    // window.userConsentGranted = true when the user accepts
    // analytics cookies. If the flag is absent or false, we
    // silently suppress telemetry to comply with GDPR.
    if (typeof window.userConsentGranted !== "undefined" && !window.userConsentGranted) {
      return;
    }

    // Finalize dwell time
    if (isVisible) {
      dwellAccumulated += Date.now() - dwellStart;
    }

    var dwellSeconds = Math.round(dwellAccumulated / 1000);

    var payload = JSON.stringify({
      asset_id: assetId,
      scroll_depth: maxScrollDepth,
      dwell_time_seconds: dwellSeconds,
      cta_clicks: ctaClicks,
      timestamp: new Date().toISOString(),
    });

    // navigator.sendBeacon is non-blocking and survives page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload);
    } else {
      // Fallback for older browsers: synchronous XHR
      var xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, false); // synchronous
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    }
  }

  // ── Attach event listeners ──
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("click", onCtaClick);

  // Fire beacon on both pagehide (preferred) and beforeunload (fallback)
  window.addEventListener("pagehide", sendBeacon);
  window.addEventListener("beforeunload", sendBeacon);

  // Also fire on visibilitychange to hidden (mobile tab switching)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      sendBeacon();
    }
  });
})();
