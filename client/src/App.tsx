import { Switch, Route, Router, useLocation, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SwarmControlToggle } from "@/components/swarm-control-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { AuthProvider, useAuth, ProtectedRoute } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSupportWidget } from "@/hooks/use-support-widget";
import { useCookieConsent } from "@/hooks/use-cookie-consent";
import { useRewardful } from "@/hooks/use-rewardful";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import SiteAudit from "@/pages/site-audit";
import ConnectStore from "@/pages/connect-store";
import FreeAnalyzer from "@/pages/free-analyzer";
import ROIDashboard from "@/pages/roi-dashboard";
import CROTelemetry from "@/pages/cro-telemetry";
import SocialQueue from "@/pages/social-queue";
import DecayManager from "@/pages/decay-manager";
import AbTests from "@/pages/ab-tests";
import AiManager from "@/pages/ai-manager";
import AgentActivity from "@/pages/agent-activity";
import AiVisibility from "@/pages/ai-visibility";
import TrendRadarPage from "@/pages/trend-radar";
import DigitalPR from "@/pages/digital-pr";
import EdgeWorkers from "@/pages/edge-workers";
import DomainsPage from "@/pages/domains";
import MissionControl from "@/pages/mission-control";
import OffDomain from "@/pages/off-domain";
import SwarmeCredits from "@/pages/wallet";
import CommsPage from "@/pages/comms";
import LandingPage from "@/pages/landing";
import { LoginPage, SignupPage } from "@/pages/auth";
import MagicLogin from "@/pages/magic-login";
import ScannerPage from "@/pages/scanner";
import ContextSetup from "@/pages/onboarding/context-setup";
import Provisioning from "@/pages/onboarding/provisioning";
import TermsOfService from "@/pages/legal/terms-of-service";
import PrivacyPolicy from "@/pages/legal/privacy-policy";
import AboutPage from "@/pages/public/about";
import ContactPage from "@/pages/public/contact";
import SecurityPage from "@/pages/public/security";
import HelpPage from "@/pages/public/help";
import DevelopersPage from "@/pages/public/developers";
import { getIntegrationStatus, queryKeys } from "@/lib/api";
import { useEffect } from "react";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { DomainProvider } from "@/context/DomainContext";
import { DomainSwitcher } from "@/components/domain-switcher";

// Phase 21: Admin pages
import { AdminLayout } from "@/pages/admin/admin-layout";
import AdminOverview from "@/pages/admin/admin-overview";
import AdminUsers from "@/pages/admin/admin-users";
import AdminVault from "@/pages/admin/admin-vault";
import AdminEcosystem from "@/pages/admin/admin-ecosystem";
import AdminSettings from "@/pages/admin/admin-settings";
import ChaosReport from "@/pages/admin/chaos-report";

function HeaderLabel() {
  const { t } = useTranslation();
  return (
    <span className="text-xs text-muted-foreground font-mono hidden sm:block">
      {t("header.commandCenter")}
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        logout();
        navigate("/");
      }}
      title="Sign out"
      data-testid="button-logout"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}

/** Routes that render inside the sidebar shell */
function ShellRoutes() {
  return (
    <Switch>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/audit" component={SiteAudit} />
      <Route path="/roi" component={ROIDashboard} />
      <Route path="/cro" component={CROTelemetry} />
      <Route path="/ab-tests" component={AbTests} />
      <Route path="/social-queue" component={SocialQueue} />
      <Route path="/decay-manager" component={DecayManager} />
      <Route path="/ai-manager" component={AiManager} />
      <Route path="/activity" component={AgentActivity} />
      <Route path="/visibility" component={AiVisibility} />
      <Route path="/trends" component={TrendRadarPage} />
      <Route path="/pr" component={DigitalPR} />
      <Route path="/workers" component={EdgeWorkers} />
      <Route path="/domains" component={DomainsPage} />
      <Route path="/mission-control" component={MissionControl} />
      <Route path="/off-domain" component={OffDomain} />
      <Route path="/wallet" component={SwarmeCredits} />
      <Route path="/comms" component={CommsPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

/**
 * Autopilot redirect guard.
 * If autopilot is enabled but no integration is connected,
 * redirect the user to the connect-store wizard.
 */
function AutopilotRedirectGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();

  const { data: status } = useQuery({
    queryKey: queryKeys.integrationStatus("proj_001"),
    queryFn: () => getIntegrationStatus("proj_001"),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (status && !status.connected) {
      // Check if swarm/autopilot is active via DOM
      const swarmActive =
        document.querySelector('[data-swarm-active="true"]') !== null;
      if (swarmActive) {
        navigate("/connect-store");
      }
    }
  }, [status, navigate]);

  return <>{children}</>;
}

/** Phase 36: Impersonation banner — shown when admin is impersonating a user */
function ImpersonationBanner() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  if (!user?.is_impersonating) return null;
  return (
    <div
      className="bg-amber-500 text-amber-950 text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 shrink-0"
      data-testid="impersonation-banner"
    >
      <span>⚠️ You are currently impersonating <strong>{user.email}</strong>.</span>
      <button
        className="underline font-semibold hover:text-amber-800 transition-colors"
        onClick={() => {
          logout();
          navigate("/admin/users");
        }}
        data-testid="button-return-admin"
      >
        Return to Admin
      </button>
    </div>
  );
}

/** Sidebar shell layout for main app routes (protected) */
function SidebarShell() {
  return (
    <ProtectedRoute>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex flex-col h-screen w-full">
          <ImpersonationBanner />
          <div className="flex flex-1 min-h-0">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
                <div className="flex items-center gap-2">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <HeaderLabel />
                  <DomainSwitcher />
                </div>
                <div className="flex items-center gap-2">
                  <SwarmControlToggle />
                  <LanguageSwitcher />
                  <ThemeToggle />
                  <LogoutButton />
                </div>
              </header>
              <main className="flex-1 overflow-hidden">
                <AutopilotRedirectGuard>
                  <ShellRoutes />
                </AutopilotRedirectGuard>
              </main>
            </div>
          </div>
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}

/**
 * Landing page gate — shows landing for unauthenticated users,
 * redirects authenticated users to /dashboard.
 */
function LandingOrDashboard() {
  const { user } = useAuth();
  if (user) {
    return <Redirect to="/dashboard" />;
  }
  return <LandingPage />;
}

/**
 * Top-level layout router.
 * Public routes render standalone (no sidebar).
 * Dashboard routes render inside the protected sidebar shell.
 */
/** Maintenance mode gate — shown to unauthenticated visitors */
function MaintenancePage() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-center space-y-3 px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M3.586 15.414A2 2 0 0 0 3 16.828V21a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4.172a2 2 0 0 0-.586-1.414L13.414 8.414a2 2 0 0 0-2.828 0z"/></svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-maintenance-title">Under Maintenance</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          We're performing scheduled maintenance. Please check back shortly.
        </p>
      </div>
    </div>
  );
}

function LayoutRouter() {
  // Phase 23: Inject support chat widget + cookie consent manager
  useSupportWidget();
  useCookieConsent();
  // Phase 24: Inject Rewardful affiliate tracking script
  useRewardful();
  // Phase 31: Dynamic frontend hydration
  const { maintenanceMode } = usePublicSettings();
  const { user } = useAuth();

  // Maintenance gate: block public visitors, allow admins through
  if (maintenanceMode && !user) {
    return <MaintenancePage />;
  }

  return (
    <Switch>
      {/* Public routes — no auth required */}
      <Route path="/" component={LandingOrDashboard} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/free-analyzer" component={FreeAnalyzer} />
      <Route path="/scanner/:url?" component={ScannerPage} />
      <Route path="/magic-login/:token?" component={MagicLogin} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/about" component={AboutPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/security" component={SecurityPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/developers" component={DevelopersPage} />

      {/* Protected standalone (no sidebar but requires auth) */}
      <Route path="/connect-store">
        <ProtectedRoute>
          <ConnectStore />
        </ProtectedRoute>
      </Route>
      <Route path="/onboarding/context-setup">
        <ProtectedRoute>
          <ContextSetup />
        </ProtectedRoute>
      </Route>
      <Route path="/onboarding/provisioning">
        <ProtectedRoute>
          <Provisioning />
        </ProtectedRoute>
      </Route>

      {/* Phase 21: Superadmin routes (distinct layout, absolute paths) */}
      <Route path="/admin">
        <AdminLayout><AdminOverview /></AdminLayout>
      </Route>
      <Route path="/admin/users">
        <AdminLayout><AdminUsers /></AdminLayout>
      </Route>
      <Route path="/admin/vault">
        <AdminLayout><AdminVault /></AdminLayout>
      </Route>
      <Route path="/admin/ecosystem">
        <AdminLayout><AdminEcosystem /></AdminLayout>
      </Route>
      <Route path="/admin/settings">
        <AdminLayout><AdminSettings /></AdminLayout>
      </Route>
      {/* Phase 54: Hidden chaos report — superadmin only */}
      <Route path="/admin/chaos">
        <AdminLayout><ChaosReport /></AdminLayout>
      </Route>

      {/* All other routes go through sidebar shell (protected) */}
      <Route>
        <SidebarShell />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <DomainProvider>
            <TooltipProvider>
              <Router hook={useHashLocation}>
                <LayoutRouter />
              </Router>
              <Toaster />
            </TooltipProvider>
          </DomainProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
