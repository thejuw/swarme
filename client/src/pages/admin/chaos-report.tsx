/**
 * Phase 54: Chaos Report Dashboard
 *
 * Hidden superadmin route at /#/admin/chaos.
 * Displays:
 *   - System Vulnerability Score (0-100 gauge)
 *   - Test results by category (API Fuzz, Race Condition, Prompt Injection, XSS Escape)
 *   - Detailed log table with severity badges
 *   - "Run Chaos Suite" trigger button
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Bug,
  Brain,
  Code2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Activity,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface ChaosScoreResponse {
  success: boolean;
  vulnerability_score: number;
  last_run: string | null;
  total_tests?: number;
  failed?: number;
  critical?: number;
  message?: string;
}

interface ChaosLog {
  id: string;
  domain_id: string;
  test_type: string;
  severity: string;
  test_name: string;
  payload: string | null;
  expected: string;
  actual: string;
  passed: number;
  metadata: string | null;
  run_id: string;
  created_at: string;
}

interface ChaosLogsResponse {
  success: boolean;
  logs: ChaosLog[];
  total: number;
}

interface ChaosRunResponse {
  success: boolean;
  vulnerability_score: number;
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    critical_failures: number;
  };
  api_fuzz: { run_id: string; total: number; passed: number; failed: number; critical: number };
  llm_attack: { run_id: string; total: number; passed: number; failed: number; critical: number };
}

// ── Severity Helpers ─────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  info: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const TEST_TYPE_LABELS: Record<string, { label: string; icon: typeof Shield }> = {
  api_fuzz: { label: "API Fuzz", icon: Bug },
  race_condition: { label: "Race Condition", icon: Zap },
  prompt_injection: { label: "Prompt Injection", icon: Brain },
  xss_escape: { label: "XSS Escape", icon: Code2 },
};

function getScoreColor(score: number): string {
  if (score === 0) return "text-emerald-400";
  if (score <= 10) return "text-green-400";
  if (score <= 30) return "text-yellow-400";
  if (score <= 60) return "text-orange-400";
  return "text-red-400";
}

function getScoreLabel(score: number): string {
  if (score === 0) return "Fortress";
  if (score <= 10) return "Hardened";
  if (score <= 30) return "Moderate Risk";
  if (score <= 60) return "Elevated Risk";
  return "Critical";
}

function getScoreRingColor(score: number): string {
  if (score === 0) return "stroke-emerald-400";
  if (score <= 10) return "stroke-green-400";
  if (score <= 30) return "stroke-yellow-400";
  if (score <= 60) return "stroke-orange-400";
  return "stroke-red-400";
}

// ── Vuln Score Ring ──────────────────────────────────────────

function VulnerabilityGauge({ score, isLoading }: { score: number; isLoading: boolean }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3">
        <Skeleton className="h-40 w-40 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
          {/* Background ring */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-zinc-800"
          />
          {/* Score ring */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${getScoreRingColor(score)} transition-all duration-1000 ease-out`}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold font-mono ${getScoreColor(score)}`} data-testid="text-vuln-score">
            {score}
          </span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">/ 100</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {score <= 10 ? (
          <ShieldCheck className={`h-4 w-4 ${getScoreColor(score)}`} />
        ) : (
          <ShieldAlert className={`h-4 w-4 ${getScoreColor(score)}`} />
        )}
        <span className={`text-sm font-medium ${getScoreColor(score)}`} data-testid="text-vuln-label">
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// ── Stats Cards ──────────────────────────────────────────────

function StatsCards({ data }: { data: ChaosScoreResponse | undefined }) {
  const items = [
    {
      label: "Total Tests",
      value: data?.total_tests ?? 0,
      icon: Activity,
      color: "text-zinc-300",
    },
    {
      label: "Passed",
      value: (data?.total_tests ?? 0) - (data?.failed ?? 0),
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Failed",
      value: data?.failed ?? 0,
      icon: XCircle,
      color: "text-orange-400",
    },
    {
      label: "Critical",
      value: data?.critical ?? 0,
      icon: AlertTriangle,
      color: "text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <item.icon className={`h-5 w-5 ${item.color} shrink-0`} />
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{item.label}</p>
              <p className={`text-xl font-bold font-mono ${item.color}`} data-testid={`text-stat-${item.label.toLowerCase().replace(" ", "-")}`}>
                {item.value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Log Table ────────────────────────────────────────────────

function LogTable({ logs, isLoading }: { logs: ChaosLog[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <Shield className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
        <p className="text-sm">No chaos test results yet.</p>
        <p className="text-xs mt-1">Run the chaos suite to generate test data.</p>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-500 text-xs w-[90px]">Status</TableHead>
            <TableHead className="text-zinc-500 text-xs w-[100px]">Type</TableHead>
            <TableHead className="text-zinc-500 text-xs w-[90px]">Severity</TableHead>
            <TableHead className="text-zinc-500 text-xs">Test Name</TableHead>
            <TableHead className="text-zinc-500 text-xs">Expected</TableHead>
            <TableHead className="text-zinc-500 text-xs">Actual</TableHead>
            <TableHead className="text-zinc-500 text-xs w-[150px]">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const typeInfo = TEST_TYPE_LABELS[log.test_type] || { label: log.test_type, icon: Bug };
            const TypeIcon = typeInfo.icon;
            return (
              <TableRow key={log.id} className="border-zinc-800/50" data-testid={`row-chaos-${log.id}`}>
                <TableCell>
                  {log.passed ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-mono">
                      PASS
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] font-mono">
                      FAIL
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <TypeIcon className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-xs text-zinc-400 font-mono">{typeInfo.label}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`${SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info} text-[10px] font-mono uppercase`}>
                    {log.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-300 font-mono">{log.test_name}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-500 max-w-[200px] truncate block">{log.expected}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-500 max-w-[250px] truncate block">{log.actual}</span>
                </TableCell>
                <TableCell>
                  <span className="text-[10px] text-zinc-600 font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function ChaosReport() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  // Fetch vulnerability score
  const scoreQuery = useQuery<ChaosScoreResponse>({
    queryKey: ["/api/admin/chaos/score"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/chaos/score?domain_id=dom_001");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch chaos logs
  const logsQuery = useQuery<ChaosLogsResponse>({
    queryKey: ["/api/admin/chaos/logs", typeFilter, severityFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ domain_id: "dom_001", limit: "200" });
      if (typeFilter !== "all") params.set("test_type", typeFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const res = await apiRequest("GET", `/api/admin/chaos/logs?${params.toString()}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Run chaos suite mutation
  const runChaosMutation = useMutation<ChaosRunResponse>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/chaos/run?domain_id=dom_001");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chaos/score"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chaos/logs"] });
      const severity = data.summary.critical_failures > 0 ? "destructive" : "default";
      toast({
        title: "Chaos Suite Complete",
        description: `${data.summary.total_tests} tests — ${data.summary.passed} passed, ${data.summary.failed} failed, ${data.summary.critical_failures} critical`,
        variant: severity as any,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Chaos Suite Error",
        description: err?.message || "Failed to run chaos tests",
        variant: "destructive",
      });
    },
  });

  const logs = logsQuery.data?.logs || [];

  return (
    <div className="space-y-6" data-testid="chaos-report-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <ShieldAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight" data-testid="text-chaos-title">
              Chaos Report
            </h2>
            <p className="text-xs text-zinc-500">
              Automated red teaming, fuzzing, and vulnerability assessment
            </p>
          </div>
        </div>
        <Button
          onClick={() => runChaosMutation.mutate()}
          disabled={runChaosMutation.isPending}
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          data-testid="button-run-chaos"
        >
          {runChaosMutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Run Chaos Suite
            </>
          )}
        </Button>
      </div>

      {/* Score + Stats */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4 bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-500 uppercase tracking-wider font-mono">
              System Vulnerability Score
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-4">
            <VulnerabilityGauge
              score={scoreQuery.data?.vulnerability_score ?? 0}
              isLoading={scoreQuery.isLoading}
            />
          </CardContent>
          {scoreQuery.data?.last_run && (
            <div className="px-4 pb-3 text-center">
              <span className="text-[10px] text-zinc-600 font-mono">
                Run: {scoreQuery.data.last_run}
              </span>
            </div>
          )}
        </Card>

        <div className="col-span-8 flex flex-col gap-3">
          <StatsCards data={scoreQuery.data} />

          {/* Category breakdown */}
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(TEST_TYPE_LABELS).map(([key, { label, icon: Icon }]) => {
              const typeLogs = logs.filter((l) => l.test_type === key);
              const passed = typeLogs.filter((l) => l.passed).length;
              const failed = typeLogs.length - passed;
              return (
                <Card key={key} className="bg-zinc-900/50 border-zinc-800">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-[11px] text-zinc-400 font-medium">{label}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold font-mono text-zinc-200">{typeLogs.length}</span>
                      <span className="text-[10px] text-zinc-600">tests</span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] text-emerald-400 font-mono">{passed} pass</span>
                      <span className="text-[10px] text-red-400 font-mono">{failed} fail</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Test Results</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs bg-zinc-900 border-zinc-700" data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="api_fuzz">API Fuzz</SelectItem>
                  <SelectItem value="race_condition">Race Condition</SelectItem>
                  <SelectItem value="prompt_injection">Prompt Injection</SelectItem>
                  <SelectItem value="xss_escape">XSS Escape</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-zinc-900 border-zinc-700" data-testid="select-severity-filter">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-300"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/chaos/logs"] });
                }}
                data-testid="button-refresh-logs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <LogTable logs={logs} isLoading={logsQuery.isLoading} />
          {logs.length > 0 && (
            <div className="text-right mt-2">
              <span className="text-[10px] text-zinc-600 font-mono">
                Showing {logs.length} result{logs.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
