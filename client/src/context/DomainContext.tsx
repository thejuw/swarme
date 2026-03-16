/**
 * DomainContext.tsx — Phase 47: Multi-Domain State Management
 *
 * Provides the active domain_id to the entire app.
 * Switching domains triggers:
 *   1. queryClient.clear() — wipes all cached data
 *   2. Fresh GET for the new domain's data
 *   3. Loading skeleton during the switch
 *
 * CRITICAL: The AI must NEVER query tables using just user_id.
 * Always use the domainId from this context.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getDomains, queryKeys } from "@/lib/api";
import type { Domain } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────

interface DomainContextValue {
  /** All domains belonging to the authenticated user */
  domains: Domain[];
  /** Currently active domain, or null if none selected */
  activeDomain: Domain | null;
  /** ID of the active domain for query scoping */
  activeDomainId: string | null;
  /** Whether domains are still loading */
  isLoading: boolean;
  /** Whether we're in the middle of a domain switch (skeleton state) */
  isSwitching: boolean;
  /** Switch to a different domain — clears cache, triggers reload */
  switchDomain: (domainId: string) => void;
}

const DomainContext = createContext<DomainContextValue>({
  domains: [],
  activeDomain: null,
  activeDomainId: null,
  isLoading: true,
  isSwitching: false,
  switchDomain: () => {},
});

// ─────────────────────────────────────────────────────────────
// Module-level ref for active domain ID
// (survives re-renders, same pattern as AuthContext)
// ─────────────────────────────────────────────────────────────

let _storedDomainId: string | null = null;

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [activeDomainId, setActiveDomainId] = useState<string | null>(
    _storedDomainId
  );
  const [isSwitching, setIsSwitching] = useState(false);

  // Fetch domains list
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.domains(),
    queryFn: () => getDomains(),
    staleTime: 60_000,
  });

  const domains = data?.domains ?? [];

  // Auto-select first domain if none is active
  const activeDomain = useMemo(() => {
    if (!domains.length) return null;
    const found = domains.find((d) => d.id === activeDomainId);
    if (found) return found;
    // Auto-select first domain
    const first = domains[0];
    _storedDomainId = first.id;
    setActiveDomainId(first.id);
    return first;
  }, [domains, activeDomainId]);

  const switchDomain = useCallback(
    (domainId: string) => {
      if (domainId === activeDomainId) return;

      setIsSwitching(true);

      // 1. Clear all cached query data (prevents cross-domain bleed)
      queryClient.clear();

      // 2. Set new domain
      _storedDomainId = domainId;
      setActiveDomainId(domainId);

      // 3. Re-fetch domains list to keep it in cache
      queryClient
        .refetchQueries({ queryKey: queryKeys.domains() })
        .finally(() => {
          setIsSwitching(false);
        });
    },
    [activeDomainId]
  );

  const value = useMemo<DomainContextValue>(
    () => ({
      domains,
      activeDomain,
      activeDomainId: activeDomain?.id ?? null,
      isLoading,
      isSwitching,
      switchDomain,
    }),
    [domains, activeDomain, isLoading, isSwitching, switchDomain]
  );

  return (
    <DomainContext.Provider value={value}>{children}</DomainContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useDomain() {
  return useContext(DomainContext);
}
