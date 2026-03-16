/**
 * AdminLayout — Phase 21: Superadmin shell with distinct darker sidebar.
 * Vercel-inspired: ultra-clean, high-contrast monochrome, plenty of whitespace.
 */

import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import {
  LayoutDashboard,
  Users,
  KeyRound,
  Boxes,
  ChevronLeft,
  Shield,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const adminNav: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "CRM / Users", href: "/admin/users", icon: Users },
  { label: "Infrastructure Vault", href: "/admin/vault", icon: KeyRound },
  { label: "App Ecosystem", href: "/admin/ecosystem", icon: Boxes },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [hashLocation] = useHashLocation();

  // Guard: only superadmin
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "superadmin") return <Redirect to="/dashboard" />;

  return (
    <div className="flex h-screen w-full bg-background" data-testid="admin-layout">
      {/* Darker admin sidebar */}
      <aside className="w-60 shrink-0 border-r border-border/50 bg-zinc-950 text-zinc-300 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <SwarmeLogo className="h-6 w-6 text-white" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white tracking-tight">Swarme</span>
              <div className="flex items-center gap-1.5">
                <Shield className="h-2.5 w-2.5 text-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-400 tracking-wider uppercase">
                  Superadmin
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {adminNav.map((item) => {
            const isActive = hashLocation === item.href || (item.href !== "/admin" && hashLocation.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                    isActive
                      ? "bg-white/10 text-white font-medium"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                  data-testid={`admin-nav-${item.label.toLowerCase().replace(/[\s\/]/g, "-")}`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/5">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-zinc-500 hover:text-white hover:bg-white/5 text-xs"
              data-testid="admin-back-dashboard"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2 px-2 mt-2">
            <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-500">
              admin v0.1
            </Badge>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-tight">Administration</h1>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-mono">
              {user.email}
            </Badge>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
