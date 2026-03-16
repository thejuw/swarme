/**
 * usePublicSettings — Phase 31: Dynamic frontend hydration
 *
 * Fetches /api/public/settings on app boot.
 * - Updates document.title from site settings
 * - Updates favicon from site settings
 * - Exposes maintenance_mode flag for gating
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

interface PublicSettings {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  maintenance_mode: boolean;
  seo_metadata: {
    title: string;
    description: string;
    og_image: string;
  };
}

export function usePublicSettings() {
  const query = useQuery<{ success: boolean; settings: PublicSettings }>({
    queryKey: ["/api/public/settings"],
    staleTime: 60_000, // refetch every minute
    refetchInterval: 60_000,
  });

  const settings = query.data?.settings;

  // Dynamic title
  useEffect(() => {
    if (settings?.seo_metadata?.title) {
      document.title = settings.seo_metadata.title;
    }
  }, [settings?.seo_metadata?.title]);

  // Dynamic favicon
  useEffect(() => {
    if (settings?.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.favicon_url;
    }
  }, [settings?.favicon_url]);

  // Dynamic meta description
  useEffect(() => {
    if (settings?.seo_metadata?.description) {
      let meta = document.querySelector("meta[name='description']") as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = settings.seo_metadata.description;
    }
  }, [settings?.seo_metadata?.description]);

  return {
    settings,
    isLoading: query.isLoading,
    maintenanceMode: settings?.maintenance_mode ?? false,
    siteName: settings?.site_name ?? "Swarme",
  };
}
