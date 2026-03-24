/**
 * Security & Operations Tab — Phase 31.3d
 *
 * Maintenance mode toggle, IP blocklist management, and performance toggles.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Shield,
  ShieldBan,
  Plus,
  Trash2,
  Save,
  Zap,
  Globe,
  Timer,
} from "lucide-react";

interface SiteSettings {
  maintenance_mode: boolean;
  [key: string]: any;
}

export function SecurityOpsTab() {
  const { toast } = useToast();

  // ── Maintenance Mode ──
  const settingsQuery = useQuery<{ success: boolean; settings: SiteSettings }>({
    queryKey: ["/api/admin/settings/site"],
  });
  const maintenanceMode = settingsQuery.data?.settings?.maintenance_mode ?? false;

  const toggleMaintenance = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/admin/settings/site", { maintenance_mode: enabled });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/settings"] });
      toast({ title: enabled ? "Maintenance mode enabled" : "Maintenance mode disabled" });
    },
  });

  // ── IP Blocklist ──
  const blocklistQuery = useQuery<{ success: boolean; blocked_ips: string[] }>({
    queryKey: ["/api/admin/security/ip-blocklist"],
  });
  const blockedIps = blocklistQuery.data?.blocked_ips || [];
  const [newIp, setNewIp] = useState("");

  const addIp = useMutation({
    mutationFn: async (ip: string) => {
      const res = await apiRequest("POST", "/api/admin/security/ip-blocklist", { ip });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ip-blocklist"] });
      setNewIp("");
      toast({ title: "IP blocked" });
    },
  });

  const removeIp = useMutation({
    mutationFn: async (ip: string) => {
      await apiRequest("DELETE", `/api/admin/security/ip-blocklist/${ip}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ip-blocklist"] });
      toast({ title: "IP unblocked" });
    },
  });

  // ── Performance toggles (local state — no backend yet) ──
  const [perfToggles, setPerfToggles] = useState({
    edge_caching: true,
    image_optimization: true,
    prerender_bot: false,
    rate_limiting: true,
  });

  return (
    <div className="space-y-8">
      {/* ── Maintenance Mode ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Maintenance Mode</h3>
          <p className="text-xs text-muted-foreground mt-0.5">When enabled, all public pages show a maintenance screen</p>
        </div>
        <Card className={maintenanceMode ? "border-amber-500/30 bg-amber-500/5" : ""}>
          <CardContent className="flex items-center justify-between py-4 px-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${maintenanceMode ? "text-amber-400" : "text-muted-foreground"}`} />
              <div>
                <p className="text-xs font-medium">
                  {maintenanceMode ? "Maintenance mode is ON" : "Site is live"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {maintenanceMode
                    ? "Public visitors see a maintenance page"
                    : "All pages are accessible normally"
                  }
                </p>
              </div>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={(v) => toggleMaintenance.mutate(v)}
              disabled={toggleMaintenance.isPending}
              data-testid="switch-maintenance-mode"
            />
          </CardContent>
        </Card>
      </section>

      {/* ── IP Blocklist ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">IP Blocklist</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Block malicious IPs from accessing the platform</p>
        </div>
        <div className="flex items-center gap-2 max-w-md">
          <Input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="e.g. 203.0.113.42"
            className="h-8 text-xs font-mono"
            data-testid="input-block-ip"
          />
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onClick={() => newIp.trim() && addIp.mutate(newIp.trim())}
            disabled={addIp.isPending || !newIp.trim()}
            data-testid="button-add-ip"
          >
            <Plus className="h-3 w-3" />
            Block
          </Button>
        </div>
        <div className="space-y-1.5 max-w-md">
          {blockedIps.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No blocked IPs</p>
          ) : (
            blockedIps.map((ip) => (
              <div
                key={ip}
                className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/30"
                data-testid={`blocked-ip-${ip.replace(/\./g, "-")}`}
              >
                <div className="flex items-center gap-2">
                  <ShieldBan className="h-3.5 w-3.5 text-destructive" />
                  <code className="text-xs font-mono">{ip}</code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeIp.mutate(ip)}
                  disabled={removeIp.isPending}
                  data-testid={`button-unblock-${ip.replace(/\./g, "-")}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
          <Badge variant="secondary" className="text-[10px] font-mono mt-1">
            {blockedIps.length} blocked
          </Badge>
        </div>
      </section>

      {/* ── Performance Toggles ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Performance & Edge</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Cloudflare edge optimization settings</p>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-lg">
          {([
            { key: "edge_caching", icon: Zap, label: "Edge Caching", desc: "Cache responses at 300+ PoPs" },
            { key: "image_optimization", icon: Globe, label: "Image Optimization", desc: "Auto-resize and compress images" },
            { key: "prerender_bot", icon: Shield, label: "Bot Pre-rendering", desc: "Serve pre-rendered pages to crawlers" },
            { key: "rate_limiting", icon: Timer, label: "Rate Limiting", desc: "Enforce per-IP request limits" },
          ] as const).map(({ key, icon: Icon, label, desc }) => (
            <Card key={key} className="bg-muted/30">
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={perfToggles[key]}
                  onCheckedChange={(v) => setPerfToggles((p) => ({ ...p, [key]: v }))}
                  data-testid={`switch-perf-${key}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
