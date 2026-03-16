/**
 * useSupportWidget — Phase 23: Dynamic Crisp Chat Widget Injection
 *
 * Injects the Crisp customer support chat widget into the DOM only when
 * SUPPORT_APP_ID is configured in the Infrastructure Vault.
 *
 * Authenticates the widget with the logged-in user's email so the
 * admin operator can identify who they are chatting with.
 *
 * No-ops gracefully when the ID is empty (widget not configured yet).
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicConfig } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Extend Window to include Crisp globals
declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
  }
}

export function useSupportWidget() {
  const injectedRef = useRef(false);
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["/api/public/config"],
    queryFn: fetchPublicConfig,
    staleTime: 5 * 60_000, // cache 5 min
    retry: false,
  });

  const supportAppId = data?.config?.supportAppId || "";

  useEffect(() => {
    // Only inject once, and only if a support app ID is configured
    if (!supportAppId || injectedRef.current) return;

    // Prevent double-injection on HMR / re-renders
    if (window.CRISP_WEBSITE_ID) return;

    injectedRef.current = true;

    // Initialize Crisp globals
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = supportAppId;

    // If user is logged in, set their email for identification
    if (user?.email) {
      window.$crisp.push(["set", "user:email", [user.email]]);
    }

    // Inject Crisp script tag
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount (rare — mostly for dev HMR)
      try {
        script.remove();
        delete window.$crisp;
        delete window.CRISP_WEBSITE_ID;
        injectedRef.current = false;
      } catch (_) {
        // Graceful cleanup
      }
    };
  }, [supportAppId, user?.email]);
}
