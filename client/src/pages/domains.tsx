/**
 * Domains — Full-page Domain Management view at /#/domains
 *
 * Wraps the existing DomainManagementCard component in a full-page layout
 * with additional context and instructions.
 */

import { DomainManagementCard } from "@/components/domain-management-card";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function DomainsPage() {
  return (
    <div className="h-full flex flex-col" data-testid="page-domains">
      <div className="p-4 pb-0">
        <h2 className="text-lg font-semibold tracking-tight">Domains</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect and manage your storefronts. Each domain is fully isolated with its own credentials vault.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <DomainManagementCard />
      </ScrollArea>
    </div>
  );
}
