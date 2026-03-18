/**
 * AdminOverview — Phase 29: Global Impact & Analytics Dashboard
 *
 * Superadmin landing view at /#/admin. Aggregates platform-wide KPIs:
 * - 4-card metric grid (MRR, Client Revenue, Hours Saved, Swarm Executions)
 * - 30-day Recharts ComposedChart (tasks bar + API cost line)
 * - Operational health table (top 5 failing integrations)
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getFailsafeStatus,
  unblockFailsafe,
  getThrottleStatus,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  queryKeys,
  type FailsafeStatus,
  type ThrottleServiceStatus,
  type CircuitBreakerStatus,
} from "@/lib/api";
import {
  DollarSign,
  TrendingUp,
  Clock,
  Zap,
  AlertTriangle,
  Activity,
  ShieldAlert,
  ShieldOff,
  Gauge,
  RefreshCw,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { NetworkAlert } from "@/components/admin/network-alert";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GlobalMetrics {
  totalClientRevenue: number;
  totalTasksExecuted: number;
  totalHoursSaved: number;
  activeMRR: number;
  totalAdaFixes: number;
  timeSeries: { date: string; tasks: number; apiCost: number }[];
  failingIntegrations: {
    integration: string;
    failures: number;
    lastFailure?: string;
    errorType?: string;
  }[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatIntegrationName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityBadge(failures: number) {
  if (failures >= 20)
    return (
      <Badge variant="destructive" className="text-[10px] font-mono">
        Critical
      </Badge>
    );
  if (failures >= 10)
    return (
      <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/25 text-[10px] font-mono">
        Warning
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px] font-mono">
      Low
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
// Custom Tooltip for the ComposedChart
// ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {entry.dataKey === "tasks" ? "Tasks" : "API Cost"}:
          </span>
          <span className="font-medium text-foreground">
            {entry.dataKey === "apiCost"
              ? `$${entry.value.toFixed(2)}`
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
  isLoading,
  testId,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  isLoading: boolean;
  testId: string;
}) {
  return (
    <Card className="border-border/50" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
        <div className={`p-1.5 rounded-md ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums tracking-tight">
              {value}
            </p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {subtitle}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase 57: Agent Failsafe Kill-Switch Banner (admin-only)
// ─────────────────────────────────────────────────────────────

function FailsafeBanner() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.failsafeStatus(),
    queryFn: getFailsafeStatus,
    refetchInterval: 30000,
  });

  const { toast } = useToast();

  const blockedTasks = (data?.failsafes || []).filter(
    (f: FailsafeStatus) => f.blocked,
  );

  async function handleUnblock(taskType: string) {
    try {
      await unblockFailsafe(taskType);
      queryClient.invalidateQueries({ queryKey: queryKeys.failsafeStatus() });
      toast({ title: "Task Unblocked", description: `"${taskType}" has been unblocked and can resume.` });
    } catch {
      toast({ title: "Unblock Failed", description: "Could not unblock the task.", variant: "destructive" });
    }
  }

  if (isLoading || blockedTasks.length === 0) {
    return null;
  }

  return (
    <Card className="border-red-500/30 bg-red-500/5" data-testid="banner-failsafe">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <CardTitle className="text-sm font-semibold text-red-400">Kill-Switch Active</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {blockedTasks.map((fs: FailsafeStatus) => (
          <div
            key={fs.task_type}
            className="flex items-center justify-between text-xs text-muted-foreground"
            data-testid={`failsafe-status-${fs.task_type}`}
          >
            <div>
              <span className="font-mono text-red-300">{fs.task_type}</span>
              <span className="ml-2 text-red-400/70">
                {fs.attempt_count} failures — {fs.blocked_reason}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs border-red-500/30 text-red-300 hover:bg-red-500/10"
              onClick={() => handleUnblock(fs.task_type)}
              data-testid={`btn-unblock-${fs.task_type}`}
            >
              Unblock
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase 56: Circuit Breaker Warning Banner (admin-only)
// ─────────────────────────────────────────────────────────────

function CircuitBreakerBanner() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.circuitBreakerStatus(),
    queryFn: getCircuitBreakerStatus,
    refetchInterval: 30_000,
  });

  const { toast } = useToast();

  const openCircuits = (data?.circuits || []).filter(
    (c: CircuitBreakerStatus) => c.state === "OPEN" || c.state === "HALF_OPEN",
  );

  const handleReset = async (service: string) => {
    try {
      await resetCircuitBreaker(service);
      queryClient.invalidateQueries({ queryKey: queryKeys.circuitBreakerStatus() });
      toast({ title: "Circuit Reset", description: `${service} circuit breaker has been reset.` });
    } catch {
      toast({ title: "Reset Failed", description: "Could not reset the circuit breaker.", variant: "destructive" });
    }
  };

  if (isLoading || openCircuits.length === 0) {
    return null;
  }

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5" data-testid="banner-circuit-breaker">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <CardTitle className="text-sm font-semibold text-yellow-300">
            Upstream API Degradation Detected
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {openCircuits.map((circuit: CircuitBreakerStatus) => (
            <div
              key={circuit.service}
              className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300"
              data-testid={`circuit-status-${circuit.service}`}
            >
              <ShieldOff className="h-3 w-3" />
              <span className="font-mono">{circuit.service}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-400 text-yellow-700 dark:text-yellow-300">
                {circuit.state}
              </Badge>
              {circuit.cooldownEndsAt && (
                <span className="text-yellow-600 dark:text-yellow-400">
                  Recovery at {new Date(circuit.cooldownEndsAt).toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-yellow-700 hover:text-yellow-900 dark:text-yellow-300"
                onClick={() => handleReset(circuit.service)}
                data-testid={`btn-reset-circuit-${circuit.service}`}
              >
                <RefreshCw className="h-3 w-3 mr-0.5" />
                Reset
              </Button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-yellow-600 dark:text-yellow-500 mt-2">
          AI-powered features may be temporarily limited. The system will auto-recover when the upstream service stabilizes.
        </p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase 57: Throttle Queue Status Widget (admin-only)
// ─────────────────────────────────────────────────────────────

function ThrottleStatusWidget() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.throttleStatus(),
    queryFn: getThrottleStatus,
    refetchInterval: 15000,
  });

  if (isLoading || !data?.services) return null;

  const services = data.services;

  return (
    <Card className="border-border/50" data-testid="widget-throttle-status">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">API Rate Limits</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {services.map((svc: ThrottleServiceStatus) => (
            <div key={svc.service} className="text-center" data-testid={`throttle-${svc.service}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                {svc.service}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    svc.utilizationPct > 75
                      ? "bg-red-400"
                      : svc.utilizationPct > 40
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                  style={{ width: `${Math.min(svc.utilizationPct, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {svc.availableTokens}/{svc.maxTokens}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/metrics/global"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/metrics/global");
      return res.json() as Promise<{ success: boolean; metrics: GlobalMetrics }>;
    },
    refetchInterval: 60_000, // Auto-refresh every minute
  });

  const m = data?.metrics;

  // Format chart dates to short labels (Mar 1, Mar 2 ...)
  const chartData = (m?.timeSeries || []).map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    const label = dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return { ...d, label };
  });

  return (
    <div className="space-y-6" data-testid="admin-overview">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Global Impact Dashboard
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-wide value generation, financials, and operational health.
        </p>
      </div>

      {/* ── Doomsday Protocol Widgets (superadmin-only) ── */}
      <FailsafeBanner />
      <CircuitBreakerBanner />
      <ThrottleStatusWidget />

      {/* ── Phase 65.5: Global Hive Mind Governance ── */}
      <NetworkAlert />

      {/* ── Metric Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Global MRR"
          value={m ? formatCurrency(m.activeMRR) : "$0"}
          subtitle="Active subscription revenue"
          icon={DollarSign}
          color="bg-emerald-500/10 text-emerald-400"
          isLoading={isLoading}
          testId="card-global-mrr"
        />
        <MetricCard
          label="Client Revenue Generated"
          value={m ? formatCurrency(m.totalClientRevenue) : "$0"}
          subtitle="Attributed via Shopify webhooks"
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-400"
          isLoading={isLoading}
          testId="card-client-revenue"
        />
        <MetricCard
          label="Human Hours Saved"
          value={m ? formatNumber(m.totalHoursSaved) : "0"}
          subtitle="Calculated at 4hrs/task"
          icon={Clock}
          color="bg-purple-500/10 text-purple-400"
          isLoading={isLoading}
          testId="card-hours-saved"
        />
        <MetricCard
          label="Total Swarm Executions"
          value={m ? formatNumber(m.totalTasksExecuted) : "0"}
          subtitle={m ? `${formatNumber(m.totalAdaFixes)} ADA fixes included` : ""}
          icon={Zap}
          color="bg-amber-500/10 text-amber-400"
          isLoading={isLoading}
          testId="card-swarm-executions"
        />
      </div>

      {/* ── Margin/Usage Chart ── */}
      <Card className="border-border/50" data-testid="chart-tasks-cost">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                Swarm Activity & API Cost
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last 30 days — tasks executed (bars) vs. estimated API spend
                (line)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                Live
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-md" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="tasks"
                    name="Tasks Executed"
                    fill="hsl(152, 62%, 48%)"
                    radius={[2, 2, 0, 0]}
                    opacity={0.85}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="apiCost"
                    name="Est. API Cost ($)"
                    stroke="hsl(210, 85%, 60%)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Operational Health: Failing Integrations ── */}
      <Card className="border-border/50" data-testid="table-failing-integrations">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold">
              Operational Health — Top 5 Failing Integrations
            </CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Integration failure counts from the last 30 days. Investigate
            critical items first.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : m?.failingIntegrations && m.failingIntegrations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Integration</TableHead>
                  <TableHead className="text-xs text-right">Failures</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                  <TableHead className="text-xs">Error Type</TableHead>
                  <TableHead className="text-xs">Last Failure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.failingIntegrations.map((item) => (
                  <TableRow key={item.integration}>
                    <TableCell className="font-medium text-sm">
                      {formatIntegrationName(item.integration)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm">
                      {item.failures}
                    </TableCell>
                    <TableCell>{severityBadge(item.failures)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {item.errorType || "Unknown"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.lastFailure
                        ? new Date(item.lastFailure).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No failing integrations — all systems operational.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
