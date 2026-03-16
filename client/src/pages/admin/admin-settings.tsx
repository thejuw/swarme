/**
 * AdminSettings — Phase 31.3a + Phase 31.5
 *
 * Left sidebar tab navigation (8 tabs) + right content area.
 * Tabs: Brand & CMS, Communications, Security & Operations,
 *        Feature Flags, Audit Log, Analytics & Logs,
 *        Support Center, Financial Ledger.
 */

import { useState } from "react";
import {
  Palette,
  MessageCircle,
  ShieldCheck,
  BarChart3,
  LifeBuoy,
  Wallet,
  Flag,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { BrandCmsTab } from "./settings/brand-cms-tab";
import { CommunicationsTab } from "./settings/communications-tab";
import { SecurityOpsTab } from "./settings/security-ops-tab";
import { FeatureFlagsTab } from "./settings/feature-flags-tab";
import { AuditLogTab } from "./settings/audit-log-tab";
import { AnalyticsLogsTab } from "./settings/analytics-logs-tab";
import { SupportTab } from "./settings/support-tab";
import { FinancialTab } from "./settings/financial-tab";

interface SettingsTab {
  id: string;
  label: string;
  icon: LucideIcon;
  component: () => JSX.Element;
  /** Optional grouping separator before this tab */
  separator?: string;
}

const TABS: SettingsTab[] = [
  { id: "brand-cms", label: "Brand & CMS", icon: Palette, component: BrandCmsTab },
  { id: "communications", label: "Communications", icon: MessageCircle, component: CommunicationsTab },
  { id: "feature-flags", label: "Feature Flags", icon: Flag, component: FeatureFlagsTab, separator: "Infrastructure" },
  { id: "security-ops", label: "Security & Ops", icon: ShieldCheck, component: SecurityOpsTab },
  { id: "audit-log", label: "Audit Log", icon: ScrollText, component: AuditLogTab },
  { id: "analytics-logs", label: "Analytics & Logs", icon: BarChart3, component: AnalyticsLogsTab, separator: "Monitoring" },
  { id: "support", label: "Support Center", icon: LifeBuoy, component: SupportTab },
  { id: "financial", label: "Financial Ledger", icon: Wallet, component: FinancialTab },
];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState("brand-cms");
  const current = TABS.find((t) => t.id === activeTab) || TABS[0];
  const ActiveComponent = current.component;

  return (
    <div className="flex h-full" data-testid="admin-settings">
      {/* Left tab nav */}
      <nav className="w-52 shrink-0 border-r border-border/50 py-3 px-2 space-y-0.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-3 pb-2">
          Settings
        </p>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <div key={tab.id}>
              {tab.separator && (
                <div className="pt-3 pb-1.5 px-3">
                  <Separator className="mb-2" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {tab.separator}
                  </p>
                </div>
              )}
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                data-testid={`settings-tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="text-xs">{tab.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Right content */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl">
          <ActiveComponent />
        </div>
      </ScrollArea>
    </div>
  );
}
