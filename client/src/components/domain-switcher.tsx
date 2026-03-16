/**
 * DomainSwitcher — Phase 47: Global Context Switcher
 *
 * Renders a compact dropdown in the header bar that lets
 * the user switch between their connected domains.
 *
 * On switch:
 *   - queryClient.clear() wipes all cached data
 *   - Fresh data loads for the selected domain
 *   - Loading skeleton shown during transition
 *
 * Placement: Header bar, between HeaderLabel and SwarmControlToggle.
 */

import { useDomain } from "@/context/DomainContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️",
  wordpress: "📝",
  woocommerce: "🛒",
  ghost: "👻",
  magento: "🔶",
  wix: "🌐",
  squarespace: "◼️",
  joomla: "🔧",
  drupal: "💧",
  prestashop: "🏪",
  opencart: "🛍️",
  easywp: "📝",
  weebly: "🌐",
  godaddy: "🌐",
  custom: "⚙️",
};

export function DomainSwitcher() {
  const {
    domains,
    activeDomain,
    isLoading,
    isSwitching,
    switchDomain,
  } = useDomain();

  // Loading state — show skeleton
  if (isLoading) {
    return <Skeleton className="h-8 w-36" data-testid="skeleton-domain-switcher" />;
  }

  // No domains yet — show nothing
  if (!domains.length) {
    return null;
  }

  // Switching state — show spinner
  if (isSwitching) {
    return (
      <div
        className="flex items-center gap-1.5 h-8 px-2 text-xs text-muted-foreground"
        data-testid="domain-switching-indicator"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Switching...</span>
      </div>
    );
  }

  return (
    <Select
      value={activeDomain?.id ?? ""}
      onValueChange={(value) => switchDomain(value)}
    >
      <SelectTrigger
        className="h-8 w-auto min-w-[140px] max-w-[220px] gap-1.5 text-xs border-dashed"
        data-testid="select-domain-switcher"
      >
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Select domain" />
      </SelectTrigger>
      <SelectContent align="start">
        {domains.map((domain) => (
          <SelectItem
            key={domain.id}
            value={domain.id}
            data-testid={`option-domain-${domain.id}`}
          >
            <span className="flex items-center gap-1.5">
              <span className="text-sm">
                {PLATFORM_ICONS[domain.platform_type] ?? "🌐"}
              </span>
              <span className="truncate">
                {domain.label || domain.domain_url}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
