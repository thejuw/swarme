/**
 * useCookieConsent — Phase 23: Cookiebot GDPR Cookie Consent Manager
 *
 * Dynamically injects the Cookiebot consent banner script when
 * COOKIE_CONSENT_ID is configured in the Infrastructure Vault.
 *
 * The banner handles:
 *   - Displaying a cookie consent UI to visitors
 *   - Managing opt-in/opt-out state per cookie category
 *   - Setting window.userConsentGranted for the edge telemetry tracker
 *
 * No-ops gracefully when the ID is empty (not configured yet).
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicConfig } from "@/lib/api";

// Extend Window for Cookiebot globals + our consent flag
declare global {
  interface Window {
    Cookiebot?: {
      consent?: {
        statistics?: boolean;
        marketing?: boolean;
      };
    };
    CookiebotCallback_OnAccept?: () => void;
    CookiebotCallback_OnDecline?: () => void;
    userConsentGranted?: boolean;
  }
}

/**
 * Syncs Cookiebot's consent state to window.userConsentGranted.
 * The edge telemetry tracker (tracker.js) reads this flag.
 */
function syncConsentFlag() {
  const consent = window.Cookiebot?.consent;
  // Grant telemetry if statistics cookies are accepted
  window.userConsentGranted = consent?.statistics === true;
}

export function useCookieConsent() {
  const injectedRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["/api/public/config"],
    queryFn: fetchPublicConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const cookieConsentId = data?.config?.cookieConsentId || "";

  useEffect(() => {
    if (!cookieConsentId || injectedRef.current) return;

    // Prevent double-injection
    if (document.getElementById("CookiebotDeclaration") || document.getElementById("Cookiebot")) return;

    injectedRef.current = true;

    // Default to no consent until the banner is accepted
    window.userConsentGranted = false;

    // Set up consent callbacks
    window.CookiebotCallback_OnAccept = syncConsentFlag;
    window.CookiebotCallback_OnDecline = syncConsentFlag;

    // Inject Cookiebot script
    const script = document.createElement("script");
    script.id = "Cookiebot";
    script.src = "https://consent.cookiebot.com/uc.js";
    script.setAttribute("data-cbid", cookieConsentId);
    script.setAttribute("data-blockingmode", "auto");
    script.type = "text/javascript";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      try {
        script.remove();
        delete window.Cookiebot;
        delete window.CookiebotCallback_OnAccept;
        delete window.CookiebotCallback_OnDecline;
        delete window.userConsentGranted;
        injectedRef.current = false;
      } catch (_) {
        // Graceful cleanup
      }
    };
  }, [cookieConsentId]);
}
