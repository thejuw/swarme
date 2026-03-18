import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getLatestAudit,
  runSiteAudit,
  dispatchAuditTask,
  queryKeys,
  type AuditFinding,
  type RoadmapItem,
  type SiteAudit,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Radar,
  ArrowRight,
  Clock,
  Zap,
  Target,
  Send,
  RefreshCw,
  ExternalLink,
  FileWarning,
  Globe,
  Lock,
  Eye,
  Gauge,
  FileText,
  Loader2,
  Check,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useProjectId } from "@/hooks/use-project-id";


// ── Severity config ──────────────────────────────────────

const severityConfig = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertCircle,
    label: "Critical",
  },
  high: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: AlertTriangle,
    label: "High",
  },
  medium: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: Info,
    label: "Medium",
  },
  low: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Info,
    label: "Low",
  },
} as const;

const categoryIcons: Record<string, typeof Globe> = {
  seo: Globe,
  performance: Gauge,
  accessibility: Eye,
  security: Lock,
  content: FileText,
};

// ── Health Score Badge ───────────────────────────────────

function HealthScoreBadge({ score }: { score: number }) {
  const getScoreConfig = (s: number) => {
    if (s >= 80)
      return {
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        label: "Healthy",
        ring: "ring-emerald-500/20",
      };
    if (s >= 50)
      return {
        color: "text-yellow-400",
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/30",
        label: "Needs Work",
        ring: "ring-yellow-500/20",
      };
    return {
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      label: "Critical",
      ring: "ring-red-500/20",
    };
  };

  const config = getScoreConfig(score);

  return (
    <div className="flex flex-col items-center gap-3" data-testid="health-score-badge">
      <div
        className={`relative flex items-center justify-center w-28 h-28 rounded-full border-2 ${config.border} ${config.bg} ring-4 ${config.ring}`}
      >
        <div className="text-center">
          <span className={`text-3xl font-bold font-mono ${config.color}`}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground block">/100</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={`${config.color} ${config.border} text-xs font-mono`}
      >
        {config.label}
      </Badge>
    </div>
  );
}

// ── Severity summary pills ───────────────────────────────

function FindingSummary({ findings }: { findings: AuditFinding[] }) {
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  return (
    <div className="flex flex-wrap gap-2" data-testid="finding-summary">
      {Object.entries(counts).map(([sev, count]) => {
        if (count === 0) return null;
        const cfg = severityConfig[sev as keyof typeof severityConfig];
        const Icon = cfg.icon;
        return (
          <div
            key={sev}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono ${cfg.bg} ${cfg.border} border`}
          >
            <Icon className={`h-3 w-3 ${cfg.color}`} />
            <span className={cfg.color}>
              {count} {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Findings list ────────────────────────────────────────

function FindingsList({
  findings,
  filter,
}: {
  findings: AuditFinding[];
  filter: string | null;
}) {
  const filtered = filter
    ? findings.filter((f) => f.category === filter || f.severity === filter)
    : findings;

  // Sort: critical → high → medium → low
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...filtered].sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  );

  return (
    <div className="space-y-2" data-testid="findings-list">
      {sorted.map((finding, idx) => {
        const cfg = severityConfig[finding.severity];
        const Icon = cfg.icon;
        const CatIcon = categoryIcons[finding.category] ?? Globe;
        return (
          <div
            key={idx}
            className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.border} ${cfg.bg}`}
            data-testid={`finding-${idx}`}
          >
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{finding.title}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono gap-1 px-1.5"
                >
                  <CatIcon className="h-2.5 w-2.5" />
                  {finding.category}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {finding.detail}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Roadmap table ────────────────────────────────────────

type DispatchState = "idle" | "dispatching" | "deployed";

function AuditRoadmap({ roadmap }: { roadmap: RoadmapItem[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dispatchStates, setDispatchStates] = useState<Record<number, DispatchState>>({});

  const handleDispatch = async (item: RoadmapItem) => {
    setDispatchStates((prev) => ({ ...prev, [item.priority]: "dispatching" }));
    try {
      await dispatchAuditTask(PROJECT_ID, {
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        effort: item.effort,
        impact: item.impact,
      });
      setDispatchStates((prev) => ({ ...prev, [item.priority]: "deployed" }));
      // Invalidate tasks query so dashboard activity log picks up the new task
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(PROJECT_ID) });
      toast({
        title: t("audit.dispatched", "Sent to Swarm"),
        description: t(
          "audit.dispatchedDesc",
          `"${item.title}" has been dispatched to the agent swarm.`
        ),
      });
    } catch {
      setDispatchStates((prev) => ({ ...prev, [item.priority]: "idle" }));
      toast({
        title: t("common.error", "Error"),
        description: t("audit.dispatchError", "Failed to dispatch task to the swarm."),
        variant: "destructive",
      });
    }
  };

  const effortConfig = {
    low: { color: "text-emerald-400", label: t("audit.effort.low", "Low") },
    medium: { color: "text-yellow-400", label: t("audit.effort.medium", "Medium") },
    high: { color: "text-red-400", label: t("audit.effort.high", "High") },
  };

  const impactConfig = {
    low: { color: "text-blue-400", label: t("audit.impact.low", "Low") },
    medium: { color: "text-yellow-400", label: t("audit.impact.medium", "Medium") },
    high: { color: "text-emerald-400", label: t("audit.impact.high", "High") },
  };

  return (
    <div className="space-y-2" data-testid="audit-roadmap">
      {roadmap.map((item) => {
        const CatIcon = categoryIcons[item.category] ?? Globe;
        const isHighPriority = item.priority <= 3;
        return (
          <div
            key={item.priority}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              isHighPriority
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-muted/30"
            }`}
            data-testid={`roadmap-item-${item.priority}`}
          >
            <div
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold font-mono shrink-0 ${
                isHighPriority
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.priority}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{item.title}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono gap-1 px-1.5"
                >
                  <CatIcon className="h-2.5 w-2.5" />
                  {item.category}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                {item.description}
              </p>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t("audit.effortLabel", "Effort")}:
                  </span>
                  <span className={effortConfig[item.effort].color}>
                    {effortConfig[item.effort].label}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t("audit.impactLabel", "Impact")}:
                  </span>
                  <span className={impactConfig[item.impact].color}>
                    {impactConfig[item.impact].label}
                  </span>
                </span>
              </div>
            </div>
            {isHighPriority && (() => {
              const state = dispatchStates[item.priority] ?? "idle";
              if (state === "deployed") {
                return (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-xs gap-1 text-emerald-400 cursor-default"
                    disabled
                    data-testid={`button-send-to-swarm-${item.priority}`}
                  >
                    <Check className="h-3 w-3" />
                    {t("audit.swarmDeployed", "Swarm Deployed")}
                  </Button>
                );
              }
              return (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs gap-1 text-primary hover:text-primary"
                  disabled={state === "dispatching"}
                  onClick={() => handleDispatch(item)}
                  data-testid={`button-send-to-swarm-${item.priority}`}
                >
                  {state === "dispatching" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  {state === "dispatching"
                    ? t("audit.dispatching", "Dispatching...")
                    : t("audit.sendToSwarm", "Send to Swarm")}
                </Button>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────

function EmptyAuditState({ onRun, isPending }: { onRun: () => void; isPending: boolean }) {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col items-center justify-center py-16 gap-4"
      data-testid="empty-audit-state"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
        <Radar className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center max-w-md">
        <h3 className="text-base font-semibold mb-1">
          {t("audit.emptyTitle", "No audit data yet")}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            "audit.emptyDescription",
            "Run a deep AI audit to analyze your site's SEO health, performance, accessibility, and security."
          )}
        </p>
        <Button onClick={onRun} disabled={isPending} className="gap-2" data-testid="button-run-audit-empty">
          {isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          {isPending
            ? t("audit.running", "Auditing...")
            : t("audit.runButton", "Run Deep AI Audit")}
        </Button>
      </div>
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────

function AuditSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48 lg:col-span-2" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}

// ── Main component ───────────────────────────────────────

export default function SiteAuditPage() {
  const PROJECT_ID = useProjectId();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [findingFilter, setFindingFilter] = useState<string | null>(null);

  const auditQuery = useQuery({
    queryKey: queryKeys.auditLatest(PROJECT_ID),
    queryFn: () => getLatestAudit(PROJECT_ID),
    refetchInterval: (query) => {
      // Poll every 5s while audit is running
      const data = query.state.data;
      if (data?.audit?.status === "running") return 5000;
      return false;
    },
  });

  const runMutation = useMutation({
    mutationFn: () => runSiteAudit(PROJECT_ID),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.auditLatest(PROJECT_ID),
      });
      toast({
        title: t("audit.started", "Audit started"),
        description: t(
          "audit.startedDesc",
          "Deep AI audit is running. Results will appear shortly."
        ),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("audit.errorDesc", "Failed to start the audit."),
        variant: "destructive",
      });
    },
  });

  if (auditQuery.isLoading) {
    return <AuditSkeleton />;
  }

  const audit = auditQuery.data?.audit;

  if (!audit) {
    return (
      <ScrollArea className="h-full">
        <div className="p-6">
          <h1 className="text-lg font-semibold mb-6" data-testid="text-audit-title">
            {t("audit.title", "Site Audit")}
          </h1>
          <Card>
            <CardContent className="p-0">
              <EmptyAuditState
                onRun={() => runMutation.mutate()}
                isPending={runMutation.isPending}
              />
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }

  const isRunning = audit.status === "running";

  // Category filter tabs
  const categories = ["all", "seo", "performance", "accessibility", "security", "content"];

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-audit-title">
              {t("audit.title", "Site Audit")}
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {audit.audited_url} &middot;{" "}
              {audit.pages_crawled} {t("audit.pagesCrawled", "pages crawled")} &middot;{" "}
              {new Date(audit.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || isRunning}
            className="gap-2"
            data-testid="button-run-audit"
          >
            {runMutation.isPending || isRunning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {runMutation.isPending || isRunning
              ? t("audit.running", "Auditing...")
              : t("audit.runButton", "Run Deep AI Audit")}
          </Button>
        </div>

        {/* Running state */}
        {isRunning && (
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t("audit.runningTitle", "Deep audit in progress...")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "audit.runningDesc",
                    "Crawling pages, analyzing SEO signals, checking accessibility. This typically takes 30\u201360 seconds."
                  )}
                </p>
              </div>
              <Progress value={65} className="w-32" />
            </CardContent>
          </Card>
        )}

        {/* Failed state */}
        {audit.status === "failed" && (
          <Card className="border-red-500/30">
            <CardContent className="flex items-center gap-4 py-4">
              <FileWarning className="h-5 w-5 text-red-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">
                  {t("audit.failedTitle", "Audit failed")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {audit.error_message || t("audit.failedDesc", "An error occurred during the audit.")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score + Summary row */}
        {audit.status === "completed" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
              {/* Health score */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    {t("audit.healthScore", "Health Score")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center pb-6">
                  <HealthScoreBadge score={audit.health_score} />
                </CardContent>
              </Card>

              {/* Summary stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    {t("audit.findingsOverview", "Findings Overview")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FindingSummary findings={audit.findings} />
                  <Separator />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-2xl font-bold font-mono">{audit.findings.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("audit.totalFindings", "Total findings")}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono">{audit.pages_crawled}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("audit.pagesCrawledLabel", "Pages audited")}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono">
                        {audit.roadmap.filter((r: RoadmapItem) => r.impact === "high").length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("audit.highImpactFixes", "High-impact fixes")}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono">
                        {audit.roadmap.filter((r: RoadmapItem) => r.effort === "low").length}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("audit.quickWins", "Quick wins")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Findings */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    {t("audit.detailedFindings", "Detailed Findings")}
                  </CardTitle>
                  <div className="flex gap-1">
                    {categories.map((cat) => (
                      <Button
                        key={cat}
                        variant={
                          (findingFilter === null && cat === "all") ||
                          findingFilter === cat
                            ? "secondary"
                            : "ghost"
                        }
                        size="sm"
                        className="text-[10px] h-6 px-2 font-mono"
                        onClick={() =>
                          setFindingFilter(cat === "all" ? null : cat)
                        }
                        data-testid={`button-filter-${cat}`}
                      >
                        {cat === "all"
                          ? t("audit.all", "All")
                          : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <FindingsList
                  findings={audit.findings}
                  filter={findingFilter}
                />
              </CardContent>
            </Card>

            {/* Roadmap */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {t("audit.remediationRoadmap", "Remediation Roadmap")}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "audit.roadmapDesc",
                    "Prioritised action items sorted by impact. Send high-priority items to the swarm for autonomous remediation."
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <AuditRoadmap roadmap={audit.roadmap} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
