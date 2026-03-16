import {
  LayoutDashboard,
  Activity,
  Eye,
  TrendingUp,
  Mail,
  BarChart3,
  Settings,
  Globe,
  Cpu,
  Radar,
  DollarSign,
  Share2,
  RefreshCw,
  Shield,
  BrainCircuit,
  FlaskConical,
  Satellite,
  Globe2,
} from "lucide-react";
import { Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { SwarmeLogo } from "./swarme-logo";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  titleKey: string;
  url: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { titleKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard },
  { titleKey: "nav.aiManager", url: "/ai-manager", icon: BrainCircuit },
  { titleKey: "nav.agentActivity", url: "/activity", icon: Activity },
  { titleKey: "nav.aiVisibility", url: "/visibility", icon: Eye },
  { titleKey: "nav.revenue", url: "/roi", icon: DollarSign },
];

const engineNav: NavItem[] = [
  { titleKey: "nav.siteAudit", url: "/audit", icon: Radar },
  { titleKey: "nav.trendRadar", url: "/trends", icon: TrendingUp },
  { titleKey: "nav.digitalPr", url: "/pr", icon: Mail },
  { titleKey: "nav.croTelemetry", url: "/cro", icon: BarChart3 },
  { titleKey: "nav.abTests", url: "/ab-tests", icon: FlaskConical },
  { titleKey: "nav.socialQueue", url: "/social-queue", icon: Share2 },
  { titleKey: "nav.decayManager", url: "/decay-manager", icon: RefreshCw },
  { titleKey: "nav.offDomain", url: "/off-domain", icon: Globe2 },
];

const systemNav: NavItem[] = [
  { titleKey: "nav.missionControl", url: "/mission-control", icon: Satellite },
  { titleKey: "nav.edgeWorkers", url: "/workers", icon: Cpu },
  { titleKey: "nav.domains", url: "/domains", icon: Globe },
  { titleKey: "nav.settings", url: "/settings", icon: Settings },
];

function NavGroup({
  labelKey,
  items,
  location,
}: {
  labelKey: string;
  items: NavItem[];
  location: string;
}) {
  const { t } = useTranslation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(labelKey)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const title = t(item.titleKey);
            return (
              <SidebarMenuItem key={item.titleKey}>
                <SidebarMenuButton
                  asChild
                  data-active={location === item.url}
                >
                  <Link href={item.url} data-testid={`nav-${title.toLowerCase().replace(/\s/g, "-")}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const [hashLocation] = useHashLocation();
  const location = hashLocation;
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer" data-testid="link-home">
            <SwarmeLogo className="h-7 w-7" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">{t("brand.name")}</span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">
                {t("brand.tagline")}
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <NavGroup labelKey="nav.commandCenter" items={mainNav} location={location} />
        <NavGroup labelKey="nav.executionEngine" items={engineNav} location={location} />
        <NavGroup labelKey="nav.system" items={systemNav} location={location} />
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        {user?.role === "superadmin" && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/admin" data-testid="nav-admin-panel">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Admin Panel</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <div className="flex items-center gap-2 px-2">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="text-xs text-muted-foreground font-mono">
            {t("footer.agentsActive", { count: 12 })}
          </span>
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">
            v0.1
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
