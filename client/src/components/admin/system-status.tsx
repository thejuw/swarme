/**
 * ============================================================
 * Swarme — Phase 66: SystemStatus Banner
 * ============================================================
 *
 * Persistent traffic-light health banner displayed in the admin
 * layout header. Reads the pulse snapshot from the API and shows:
 *
 *   GREEN  (hidden)   — All services healthy, no banner shown
 *   YELLOW (warning)  — One or more services degraded (high latency)
 *   RED    (critical) — One or more services down (probe failed)
 *
 * Auto-refreshes every 60 seconds via polling.
 * Admin-only: lives inside the AdminLayout header.
 * ============================================================
 */

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Activity,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types (mirrors backend PulseSnapshot) ────────────────────

type PulseState = "healthy" | "degraded" | "down";

interface PulseService {
  service: string;
  state: PulseState;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
}

interface PulseSnapshot {
  overall: PulseState;
  services: PulseService[];
  checkedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────

function stateColor(state: PulseState): string {
  switch (state) {
    case "healthy":
      return "text-emerald-400";
    case "degraded":
      return "text-amber-400";
    case "down":
      return "text-red-400";
  }
}

function stateBgColor(state: PulseState): string {
  switch (state) {
    case "healthy":
      return "bg-emerald-500/10 border-emerald-500/20";
    case "degraded":
      return "bg-amber-500/10 border-amber-500/20";
    case "down":
      return "bg-red-500/10 border-red-500/20";
  }
}

function stateIcon(state: PulseState) {
  switch (state) {
    case "healthy":
      return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
    case "degraded":
      return <AlertTriangle className="h-3 w-3 text-amber-400" />;
    case "down":
      return <XCircle className="h-3 w-3 text-red-400" />;
  }
}

function stateLabel(state: PulseState): string {
  switch (state) {
    case "healthy":
      return "All Systems Operational";
    case "degraded":
      return "Degraded Performance";
    case "down":
      return "Service Outage Detected";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function formatService(name: string): string {
  const map: Record<string, string> = {
    perplexity: "Perplexity AI",
    gemini: "Google Gemini",
    resend: "Resend Email",
    stripe: "Stripe Billing",
  };
  return map[name] || name;
}

// ── Component ────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export function SystemStatus() {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchPulse = async () => {
    try {
      const resp = await apiRequest("GET", "/api/admin/pulse");
      const data = await resp.json();
      if (data.snapshot) {
        setSnapshot(data.snapshot);
      }
    } catch {
      // Silent fail — pulse endpoint may not be active yet
    } finally {
      setLoading(false);
      setLastFetch(new Date());
    }
  };

  useEffect(() => {
    fetchPulse();
    const interval = setInterval(fetchPulse, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Don't show anything if still loading or no data
  if (loading || !snapshot) return null;

  // If everything is healthy, show a minimal green indicator
  if (snapshot.overall === "healthy") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1.5 cursor-default"
              data-testid="system-status-healthy"
            >
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-500">
                Systems OK
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-xs bg-zinc-900 border-zinc-700 text-zinc-200"
          >
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-emerald-400">
                All Systems Operational
              </p>
              {snapshot.services.map((s) => (
                <div key={s.service} className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-zinc-400">{formatService(s.service)}</span>
                  <span className="text-zinc-500 font-mono">{s.latencyMs}ms</span>
                </div>
              ))}
              {snapshot.checkedAt && (
                <p className="text-[10px] text-zinc-600 pt-1 border-t border-zinc-800">
                  Last check: {timeAgo(snapshot.checkedAt)}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Degraded or down — show a visible banner
  const affectedServices = snapshot.services.filter(
    (s) => s.state !== "healthy",
  );

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${stateBgColor(snapshot.overall)}`}
      data-testid="system-status-banner"
    >
      <Activity className={`h-3.5 w-3.5 shrink-0 ${stateColor(snapshot.overall)}`} />

      <div className="flex items-center gap-2">
        <span className={`font-medium ${stateColor(snapshot.overall)}`}>
          {stateLabel(snapshot.overall)}
        </span>

        <span className="text-zinc-500 hidden sm:inline">—</span>

        <div className="hidden sm:flex items-center gap-1.5">
          {affectedServices.map((s) => (
            <TooltipProvider key={s.service}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono px-1.5 py-0 border-current ${stateColor(s.state)}`}
                  >
                    {stateIcon(s.state)}
                    <span className="ml-1">{formatService(s.service)}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-zinc-900 border-zinc-700 text-zinc-200"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-medium">{formatService(s.service)}</p>
                    <p className="text-[10px] text-zinc-400">
                      Status: <span className={stateColor(s.state)}>{s.state}</span>
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Latency: {s.latencyMs}ms
                    </p>
                    {s.error && (
                      <p className="text-[10px] text-red-400/70 max-w-[200px] truncate">
                        {s.error}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      <button
        onClick={fetchPulse}
        className="ml-auto p-1 rounded hover:bg-white/5 transition-colors"
        data-testid="system-status-refresh"
        title="Refresh status"
      >
        <RefreshCw className="h-3 w-3 text-zinc-500" />
      </button>
    </div>
  );
}
