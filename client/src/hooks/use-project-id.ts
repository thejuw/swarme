/**
 * useProjectId — Returns the active project ID for the current domain.
 *
 * Replaces hardcoded "proj_001" across all pages. Uses the DomainContext
 * to scope queries to the correct domain, then fetches the first project
 * for that domain from /api/projects.
 *
 * Falls back to the domain ID itself if no project is found, since many
 * backend endpoints use domain_id as the scoping key anyway.
 */

import { useQuery } from "@tanstack/react-query";
import { useDomain } from "@/context/DomainContext";
import { getProjects, queryKeys } from "@/lib/api";

export function useProjectId(): string {
  const { activeDomainId } = useDomain();

  const { data } = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => getProjects(),
    staleTime: 60_000,
  });

  // Find the first project that matches the active domain
  const projects = data?.projects ?? [];
  const match = projects.find(
    (p: any) => p.domain_id === activeDomainId || p.id === activeDomainId
  );

  // Return matched project ID, or active domain ID, or first project ID
  if (match) return match.id;
  if (activeDomainId) return activeDomainId;
  if (projects.length > 0) return projects[0].id;
  return "";
}
