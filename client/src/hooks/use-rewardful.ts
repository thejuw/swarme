/**
 * use-rewardful.ts — Phase 24: Rewardful Affiliate Tracking
 *
 * Dynamically injects the Rewardful tracking script when the
 * public config indicates an active affiliate program (rewardfulId === "active").
 *
 * Rewardful's script reads ?via=AFFILIATE_ID from the URL on first visit,
 * stores the referral in a first-party cookie, and exposes
 * window.rewardful('ready', callback) for reading the referral ID at signup.
 *
 * Usage:
 *   - Call useRewardful() once at the top-level layout (e.g. LayoutRouter).
 *   - Call getRewardfulReferralId() on the signup form to attach the referral.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicConfig } from "@/lib/api";

// Module-level ref to track injection state (survives re-renders)
let rewardfulInjected = false;

/** Global type augmentation for Rewardful */
declare global {
  interface Window {
    rewardful?: (event: string, callback?: (data: any) => void) => void;
    Rewardful?: {
      referral?: string;
      affiliate?: { id: string; name: string } | null;
    };
  }
}

/**
 * Hook: Injects the Rewardful tracking script once.
 * Should be called in the top-level layout component.
 */
export function useRewardful() {
  const injectedRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["/api/public/config"],
    queryFn: fetchPublicConfig,
    staleTime: 5 * 60_000,
  });

  const rewardfulActive = data?.config?.rewardfulId === "active";

  useEffect(() => {
    if (!rewardfulActive || rewardfulInjected || injectedRef.current) return;

    // Prevent double injection
    rewardfulInjected = true;
    injectedRef.current = true;

    // Rewardful bootstrap: set up the queue before the script loads
    (window as any).rewardful =
      (window as any).rewardful ||
      function (...args: any[]) {
        ((window as any).rewardful.q = (window as any).rewardful.q || []).push(
          args
        );
      };

    // Inject the Rewardful script
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://r.wdfl.co/rw.js";
    script.setAttribute("data-rewardful", "true");
    document.head.appendChild(script);
  }, [rewardfulActive]);
}

/**
 * Utility: Get the current Rewardful referral ID.
 * Returns the referral string or undefined if not available.
 *
 * Also checks URL params for ?via= as a direct fallback.
 */
export function getRewardfulReferralId(): string | undefined {
  // 1. Try the Rewardful SDK global
  if (window.Rewardful?.referral) {
    return window.Rewardful.referral;
  }

  // 2. Fallback: check URL search params for ?via=
  try {
    const params = new URLSearchParams(window.location.search);
    const via = params.get("via");
    if (via) return via;
  } catch (_) {
    // ignore
  }

  return undefined;
}
