import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  getMissionControl,
  getActionHistory,
  rollbackAction,
  getOutreachCampaigns,
  updateOutreachCampaign,
  sendOutreachCampaign,
  runOutreachProspecting,
  getInternalLinks,
  removeInternalLink,
  restoreInternalLink,
  getGeoAnalytics,
  queryKeys,
  type ActionHistoryEntry,
  type IntegrationHealth,
  type AgentHealthPulse,
  type CronJobStatus,
  type OutreachCampaign,
  type OutreachDraftContent,
  type InternalLink,
  type LinkGraphNode,
  type InternalLinksResponse,
  type GeoAnalyticsResponse,
  type GeoSearchRealEstate,
  type AiEngineCitation,
  type GeoSchemaDeployment,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useProjectId } from "@/hooks/use-project-id";
import {
  Activity,
  Plug,
  Bot,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Zap,
  History,
  Gauge,
  Cpu,
  ArrowDownUp,
  Timer,
  Pause,
  Mail,
  Send,
  Search,
  ExternalLink,
  Pencil,
  Eye,
  ThumbsUp,
  LinkIcon,
  Network,
  Unlink,
  RefreshCw,
  ArrowRight,
  Circle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  FileCode2,
  Quote,
  Globe,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────

function IntegrationStatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Connected
      </Badge>
    );
  }
  if (status === "degraded") {
    return (
      <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-400/30 bg-amber-400/10">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Degraded
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/30 bg-red-400/10">
      <XCircle className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
}

function AgentStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-400",
    degraded: "bg-amber-400",
    idle: "bg-muted-foreground/40",
    error: "bg-red-400",
  };
  return (
    <div className={`h-2 w-2 rounded-full ${colors[status] || "bg-muted-foreground"} ${status === "healthy" ? "animate-pulse" : ""}`} />
  );
}

function agentLabel(type: string): string {
  const labels: Record<string, string> = {
    scraper: "Scraper",
    writer: "Writer",
    auditor: "Auditor",
    cro: "CRO",
    outreach: "Outreach",
    visibility: "Visibility",
    researcher: "Researcher",
    social: "Social",
    media: "Media",
    publisher: "Publisher",
  };
  return labels[type] || type;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────
// KPI Summary Row
// ─────────────────────────────────────────────────────────────

function SummaryKPIs({ data }: { data: any }) {
  const summary = data?.summary;
  if (!summary) return null;

  const kpis = [
    { label: "Actions (24h)", value: summary.total_actions_24h, icon: Zap, color: "text-emerald-400" },
    { label: "Rollbacks (24h)", value: summary.rollbacks_24h, icon: RotateCcw, color: "text-amber-400" },
    { label: "Agents Active", value: summary.agents_active, icon: Bot, color: "text-emerald-400" },
    { label: "Agents Degraded", value: summary.agents_degraded, icon: AlertTriangle, color: "text-amber-400" },
    { label: "Integrations", value: `${summary.integrations_connected}/${summary.integrations_connected + summary.integrations_degraded}`, icon: Plug, color: "text-blue-400" },
    { label: "Crons Healthy", value: `${summary.crons_healthy}/${summary.crons_total}`, icon: Clock, color: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="mission-control-kpis">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
          </div>
          <p className="text-xl font-semibold tabular-nums" data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, "-")}`}>
            {kpi.value}
          </p>
        </Card>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Integrations Panel
// ─────────────────────────────────────────────────────────────

function IntegrationsPanel({ integrations }: { integrations: IntegrationHealth[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plug className="h-4 w-4 text-blue-400" />
          Integration Health
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">
            {integrations.length} services
          </Badge>
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="divide-y">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              data-testid={`integration-${integration.platform}`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold ${
                  integration.status === "connected"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : integration.status === "degraded"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}>
                  {integration.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{integration.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Last sync: {timeAgo(integration.last_sync)}
                    {integration.sync_errors > 0 && (
                      <span className="text-amber-400 ml-2">{integration.sync_errors} errors</span>
                    )}
                  </p>
                </div>
              </div>
              <IntegrationStatusBadge status={integration.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Agent Health Panel
// ─────────────────────────────────────────────────────────────

function AgentHealthPanel({ agents }: { agents: AgentHealthPulse[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          Agent Health Pulse
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">
            {agents.filter((a) => a.status === "healthy").length} healthy
          </Badge>
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="divide-y">
          {agents.map((agent) => (
            <div
              key={agent.agent_type}
              className="flex items-center justify-between px-4 py-2.5"
              data-testid={`agent-health-${agent.agent_type}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <AgentStatusDot status={agent.status} />
                <span className="text-sm font-medium">{agentLabel(agent.agent_type)}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground shrink-0">
                <span className="flex items-center gap-1" title="Tasks last hour">
                  <Gauge className="h-3 w-3" />
                  {agent.tasks_last_hour}
                </span>
                {agent.errors_last_hour > 0 && (
                  <span className="flex items-center gap-1 text-red-400" title="Errors last hour">
                    <XCircle className="h-3 w-3" />
                    {agent.errors_last_hour}
                  </span>
                )}
                <span className="flex items-center gap-1" title="Avg latency">
                  <Timer className="h-3 w-3" />
                  {agent.avg_latency_ms > 0 ? `${agent.avg_latency_ms}ms` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Cron Jobs Panel
// ─────────────────────────────────────────────────────────────

function CronJobsPanel({ cronJobs }: { cronJobs: CronJobStatus[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-violet-400" />
          Scheduled Jobs
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">
            {cronJobs.length} crons
          </Badge>
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="divide-y">
          {cronJobs.map((job) => (
            <div
              key={job.name}
              className="flex items-center justify-between px-4 py-2.5"
              data-testid={`cron-${job.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div>
                <p className="text-sm font-medium">{job.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  <span className="text-muted-foreground/60">{job.cron}</span>
                  <span className="mx-1.5">·</span>
                  Last: {timeAgo(job.last_run)}
                  <span className="mx-1.5">·</span>
                  {(job.duration_ms / 1000).toFixed(1)}s
                </p>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono ${
                  job.status === "success"
                    ? "text-emerald-400 border-emerald-400/30"
                    : job.status === "running"
                    ? "text-blue-400 border-blue-400/30"
                    : "text-red-400 border-red-400/30"
                }`}
              >
                {job.status === "success" ? <CheckCircle2 className="h-3 w-3 mr-1" /> :
                 job.status === "running" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> :
                 <XCircle className="h-3 w-3 mr-1" />}
                {job.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Action History Timeline with Rollback
// ─────────────────────────────────────────────────────────────

function ActionTimeline() {
  const PROJECT_ID = useProjectId();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.actionHistory(PROJECT_ID),
    queryFn: () => getActionHistory(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const rollbackMutation = useMutation({
    mutationFn: (actionId: string) => rollbackAction(PROJECT_ID, actionId),
    onSuccess: (_data, actionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionHistory(PROJECT_ID) });
      queryClient.invalidateQueries({ queryKey: queryKeys.missionControl(PROJECT_ID) });
      toast({ title: "Rollback Successful", description: `Action ${actionId} has been reverted.` });
    },
    onError: () => {
      toast({ title: "Rollback Failed", description: "Could not rollback this action.", variant: "destructive" });
    },
  });

  const actions = data?.actions ?? [];
  const filtered = filter === "all" ? actions : actions.filter((a) => a.agent_type === filter);

  const agentTypes = Array.from(new Set(actions.map((a: any) => a.agent_type)));

  return (
    <Card className="flex flex-col">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-amber-400" />
            Action History
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="filter-all"
            >
              All
            </button>
            {agentTypes.map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors capitalize ${
                  filter === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`filter-${type}`}
              >
                {type}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <Separator />

      <ScrollArea className="flex-1 max-h-[480px]">
        <div className="px-4 py-3 space-y-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading history...
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No actions recorded yet.</p>
            </div>
          )}

          {filtered.map((action) => (
            <ActionHistoryRow
              key={action.id}
              action={action}
              onRollback={(id) => rollbackMutation.mutate(id)}
              isRollingBack={rollbackMutation.isPending}
            />
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

function ActionHistoryRow({
  action,
  onRollback,
  isRollingBack,
}: {
  action: ActionHistoryEntry;
  onRollback: (id: string) => void;
  isRollingBack: boolean;
}) {
  const isRolledBack = action.rolled_back === 1;
  const canRollback = !isRolledBack && action.snapshot_before !== null;

  // Parse snapshot diffs
  let diffEntries: { key: string; before: string; after: string }[] = [];
  if (action.snapshot_before && action.snapshot_after) {
    try {
      const before = JSON.parse(action.snapshot_before);
      const after = JSON.parse(action.snapshot_after);
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      allKeys.forEach((key) => {
        const bVal = String(before[key] ?? "—");
        const aVal = String(after[key] ?? "—");
        if (bVal !== aVal) {
          diffEntries.push({ key, before: bVal, after: aVal });
        }
      });
    } catch {}
  }

  return (
    <div
      className={`relative p-3 rounded-lg border transition-all ${
        isRolledBack
          ? "border-red-400/20 bg-red-400/5 opacity-60"
          : "border-border hover:border-border/80"
      }`}
      data-testid={`action-${action.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono capitalize">
            {action.agent_type}
          </Badge>
          <span className="text-sm font-medium">{action.action}</span>
          {isRolledBack && (
            <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/30 bg-red-400/10">
              <RotateCcw className="h-3 w-3 mr-1" />
              Rolled Back
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{timeAgo(action.created_at)}</span>
      </div>

      <p className="text-xs text-muted-foreground mb-2">
        <span className="font-mono">{action.entity_type}</span>
        <span className="mx-1">·</span>
        <span className="font-mono">{action.entity_id}</span>
      </p>

      {/* Diff view */}
      {diffEntries.length > 0 && (
        <div className="rounded-md bg-muted/50 p-2 mb-2 space-y-1">
          {diffEntries.map((d) => (
            <div key={d.key} className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-muted-foreground w-24 shrink-0 truncate">{d.key}</span>
              <ArrowDownUp className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="text-red-400 line-through truncate">{d.before}</span>
              <span className="text-emerald-400 truncate">{d.after}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rollback button */}
      {canRollback && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] gap-1 text-red-400 border-red-400/30 hover:bg-red-400/10"
              data-testid={`button-rollback-${action.id}`}
            >
              <RotateCcw className="h-3 w-3" />
              Undo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
              <AlertDialogDescription>
                This will revert <strong>{action.action}</strong> on{" "}
                <span className="font-mono">{action.entity_id}</span> back to its previous state.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRollback(action.id)}
                disabled={isRollingBack}
                className="bg-red-600 hover:bg-red-700"
                data-testid={`confirm-rollback-${action.id}`}
              >
                {isRollingBack ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                Rollback
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Outreach Panel (Phase 38)
// ─────────────────────────────────────────────────────────────

function OutreachStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    Draft: { label: "Draft", cls: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
    Approved: { label: "Approved", cls: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
    Sent: { label: "Sent", cls: "text-sky-400 border-sky-400/30 bg-sky-400/10" },
    Replied: { label: "Replied", cls: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
    Bounced: { label: "Bounced", cls: "text-red-400 border-red-400/30 bg-red-400/10" },
    Declined: { label: "Declined", cls: "text-zinc-400 border-zinc-400/30 bg-zinc-400/10" },
  };
  const s = map[status] ?? { label: status, cls: "text-zinc-400 border-zinc-400/30 bg-zinc-400/10" };
  return <Badge variant="outline" className={`text-[10px] font-mono ${s.cls}`}>{s.label}</Badge>;
}

function parseDraft(raw: string | null): OutreachDraftContent | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function OutreachPanel() {
  const PROJECT_ID = useProjectId();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<OutreachCampaign | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view");
  const [prospectKeyword, setProspectKeyword] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.outreachCampaigns(PROJECT_ID),
    queryFn: () => getOutreachCampaigns(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; data: { outreach_draft?: string; status?: string } }) =>
      updateOutreachCampaign(PROJECT_ID, args.id, args.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outreachCampaigns(PROJECT_ID) });
      toast({ title: "Campaign updated" });
    },
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => sendOutreachCampaign(PROJECT_ID, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outreachCampaigns(PROJECT_ID) });
      toast({ title: "Email sent", description: "Outreach email dispatched via Resend" });
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const prospectMut = useMutation({
    mutationFn: (keyword: string) => runOutreachProspecting(PROJECT_ID, keyword),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outreachCampaigns(PROJECT_ID) });
      toast({ title: "Prospecting complete", description: d.message });
      setProspectKeyword("");
    },
  });

  const campaigns = data?.campaigns ?? [];
  const filtered = statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter);
  const summary = data?.summary;

  function openView(c: OutreachCampaign) {
    setSelectedCampaign(c);
    const d = parseDraft(c.outreach_draft);
    setEditSubject(d?.subject ?? "");
    setEditBody(d?.body ?? "");
    setDialogMode("view");
  }

  function openEdit(c: OutreachCampaign) {
    setSelectedCampaign(c);
    const d = parseDraft(c.outreach_draft);
    setEditSubject(d?.subject ?? "");
    setEditBody(d?.body ?? "");
    setDialogMode("edit");
  }

  function handleSaveDraft() {
    if (!selectedCampaign) return;
    updateMut.mutate({
      id: selectedCampaign.id,
      data: { outreach_draft: JSON.stringify({ subject: editSubject, body: editBody }) },
    });
    setSelectedCampaign(null);
  }

  function handleApprove(c: OutreachCampaign) {
    updateMut.mutate({ id: c.id, data: { status: "Approved" } });
  }

  function handleSend(c: OutreachCampaign) {
    sendMut.mutate(c.id);
  }

  const statuses = ["all", "Draft", "Approved", "Sent", "Replied"];

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-xl font-semibold" data-testid="outreach-total">{summary.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Drafts</p>
              <p className="text-xl font-semibold text-amber-400" data-testid="outreach-drafts">{summary.drafts}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
              <p className="text-xl font-semibold text-sky-400" data-testid="outreach-sent">{summary.sent}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Replied</p>
              <p className="text-xl font-semibold text-emerald-400" data-testid="outreach-replied">{summary.replied}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Prospecting bar */}
      <Card className="bg-card/50 border-border/40">
        <CardContent className="p-3 flex gap-2 items-center">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Enter keyword to prospect (e.g. sustainable luxury fashion)"
            value={prospectKeyword}
            onChange={(e) => setProspectKeyword(e.target.value)}
            className="h-8 text-sm flex-1"
            data-testid="input-prospect-keyword"
          />
          <Button
            size="sm"
            className="h-8 px-3"
            disabled={!prospectKeyword.trim() || prospectMut.isPending}
            onClick={() => prospectMut.mutate(prospectKeyword.trim())}
            data-testid="button-run-prospect"
          >
            {prospectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <LinkIcon className="h-3 w-3 mr-1" />}
            Prospect
          </Button>
        </CardContent>
      </Card>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {statuses.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setStatusFilter(s)}
            data-testid={`filter-${s.toLowerCase()}`}
          >
            {s === "all" ? "All" : s}
          </Button>
        ))}
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card/50 border-border/40">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No outreach campaigns found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const draft = parseDraft(c.outreach_draft);
            return (
              <Card key={c.id} className="bg-card/50 border-border/40 hover:border-border/60 transition-colors" data-testid={`outreach-row-${c.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <OutreachStatusBadge status={c.status} />
                        {c.domain_authority && (
                          <span className="text-[10px] text-muted-foreground font-mono">DA {c.domain_authority}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground font-mono truncate">{c.keyword}</span>
                      </div>
                      <p className="text-sm font-medium truncate" data-testid={`outreach-target-${c.id}`}>
                        {c.contact_name ? `${c.contact_name} — ` : ""}{c.target_url}
                      </p>
                      {draft && (
                        <p className="text-xs text-muted-foreground truncate">Subject: {draft.subject}</p>
                      )}
                      {c.target_email && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />{c.target_email}
                        </p>
                      )}
                      {!c.target_email && (
                        <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />No email found
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openView(c)} data-testid={`view-${c.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {(c.status === "Draft" || c.status === "Approved") && draft && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`edit-${c.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.status === "Draft" && c.target_email && draft && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-300" onClick={() => handleApprove(c)} data-testid={`approve-${c.id}`}>
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {c.status === "Approved" && c.target_email && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-400 hover:text-emerald-300" onClick={() => handleSend(c)} disabled={sendMut.isPending} data-testid={`send-${c.id}`}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <a href={c.target_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View / Edit Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={(open) => { if (!open) setSelectedCampaign(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              {dialogMode === "view" ? "Preview Outreach" : "Edit Outreach Draft"}
            </DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <OutreachStatusBadge status={selectedCampaign.status} />
                <span className="truncate">{selectedCampaign.contact_name ?? "Unknown contact"}</span>
                <span className="truncate">&lt;{selectedCampaign.target_email ?? "no email"}&gt;</span>
              </div>
              {dialogMode === "view" ? (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Subject</p>
                    <p className="text-sm font-medium" data-testid="dialog-subject">{parseDraft(selectedCampaign.outreach_draft)?.subject ?? "—"}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Body</p>
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed" data-testid="dialog-body">
                      {parseDraft(selectedCampaign.outreach_draft)?.body ?? "No draft content"}
                    </pre>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Subject</label>
                    <Input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="text-sm"
                      data-testid="input-edit-subject"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Body</label>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={8}
                      className="text-sm font-sans"
                      data-testid="input-edit-body"
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {dialogMode === "view" && selectedCampaign && (selectedCampaign.status === "Draft" || selectedCampaign.status === "Approved") && (
              <Button variant="outline" size="sm" onClick={() => setDialogMode("edit")} data-testid="button-switch-edit">
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
            )}
            {dialogMode === "edit" && (
              <Button size="sm" onClick={handleSaveDraft} disabled={updateMut.isPending} data-testid="button-save-draft">
                {updateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save Draft
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="sm">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Link Graph Panel (Phase 39)
// ─────────────────────────────────────────────────────────────

function LinkGraphPanel() {
  const PROJECT_ID = useProjectId();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InternalLinksResponse>({
    queryKey: [...queryKeys.internalLinks(PROJECT_ID), statusFilter],
    queryFn: () => getInternalLinks(PROJECT_ID, statusFilter ?? undefined),
    enabled: !!PROJECT_ID,
  });

  const removeMutation = useMutation({
    mutationFn: (linkId: string) => removeInternalLink(PROJECT_ID, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.internalLinks(PROJECT_ID) });
      toast({ title: "Link removed", description: "The internal link has been deactivated." });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (linkId: string) => restoreInternalLink(PROJECT_ID, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.internalLinks(PROJECT_ID) });
      toast({ title: "Link restored", description: "The internal link has been reactivated." });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary;
  const links = data?.links ?? [];
  const graph = data?.graph;

  return (
    <div className="space-y-4" data-testid="link-graph-panel">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-foreground" data-testid="kpi-total-links">{summary?.total_links ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Links</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-emerald-400" data-testid="kpi-active-links">{summary?.active_links ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-orange-400" data-testid="kpi-removed-links">{summary?.removed_links ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Removed</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-foreground" data-testid="kpi-articles-connected">{summary?.articles_connected ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Articles</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-sky-400" data-testid="kpi-avg-similarity">{summary?.avg_similarity ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Graph Visualization (force-directed placeholder using SVG) */}
      {graph && graph.nodes.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4 text-sky-400" />
              Semantic Link Map
            </CardTitle>
            <CardDescription className="text-xs">Visual graph of how your articles are semantically linked</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <LinkGraphVisualization nodes={graph.nodes} edges={graph.edges} />
          </CardContent>
        </Card>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {[null, "active", "removed"].map((f) => (
          <Badge
            key={f ?? "all"}
            variant={statusFilter === f ? "default" : "outline"}
            className={`cursor-pointer text-[10px] ${
              statusFilter === f ? "" : "text-muted-foreground border-border/50 hover:text-foreground"
            }`}
            onClick={() => setStatusFilter(f)}
            data-testid={`filter-${f ?? "all"}`}
          >
            {f === null ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Badge>
        ))}
      </div>

      {/* Links Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-emerald-400" />
            Internal Links
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {links.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No internal links found.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  onRemove={() => removeMutation.mutate(link.id)}
                  onRestore={() => restoreMutation.mutate(link.id)}
                  isRemoving={removeMutation.isPending}
                  isRestoring={restoreMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinkRow({
  link,
  onRemove,
  onRestore,
  isRemoving,
  isRestoring,
}: {
  link: InternalLink;
  onRemove: () => void;
  onRestore: () => void;
  isRemoving: boolean;
  isRestoring: boolean;
}) {
  const isActive = link.status === "active";
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 text-xs ${
        !isActive ? "opacity-60" : ""
      }`}
      data-testid={`link-row-${link.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="font-medium text-foreground truncate max-w-[180px]" title={link.source_title}>
            {link.source_title.length > 35 ? link.source_title.slice(0, 35) + "..." : link.source_title}
          </span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground truncate max-w-[180px]" title={link.target_title}>
            {link.target_title.length > 35 ? link.target_title.slice(0, 35) + "..." : link.target_title}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="italic">"{link.anchor_text}"</span>
          <span>·</span>
          <span className="font-mono">{(link.similarity_score * 100).toFixed(0)}% match</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={`text-[10px] shrink-0 ${
          isActive
            ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
            : "text-orange-400 border-orange-400/30 bg-orange-400/10"
        }`}
      >
        {link.status}
      </Badge>
      {isActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-red-400"
          onClick={onRemove}
          disabled={isRemoving}
          data-testid={`remove-link-${link.id}`}
        >
          {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-emerald-400"
          onClick={onRestore}
          disabled={isRestoring}
          data-testid={`restore-link-${link.id}`}
        >
          {isRestoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}

function LinkGraphVisualization({
  nodes,
  edges,
}: {
  nodes: LinkGraphNode[];
  edges: { source: string; target: string; anchor_text: string; similarity_score: number }[];
}) {
  // Simple circular layout for the nodes
  const width = 600;
  const height = 320;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 60;

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    nodePositions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  return (
    <div className="flex justify-center" data-testid="link-graph-svg">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] h-auto">
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodePositions.get(edge.source);
          const to = nodePositions.get(edge.target);
          if (!from || !to) return null;
          const opacity = 0.3 + edge.similarity_score * 0.5;
          return (
            <line
              key={`edge-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="hsl(var(--primary))"
              strokeWidth={1 + edge.similarity_score * 2}
              strokeOpacity={opacity}
            />
          );
        })}
        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const totalLinks = node.inbound + node.outbound;
          const r = 16 + totalLinks * 3;
          return (
            <g key={node.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill="hsl(var(--primary) / 0.15)"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
              />
              <text
                x={pos.x}
                y={pos.y - r - 8}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-medium"
              >
                {node.title.length > 28 ? node.title.slice(0, 28) + "..." : node.title}
              </text>
              <text
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px] font-mono"
              >
                {node.inbound}↓ {node.outbound}↑
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GEO Analytics Panel (Phase 48)
// ─────────────────────────────────────────────────────────────

function GeoScoreBadge({ score }: { score: number }) {
  let color = "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
  let label = "Excellent";
  if (score < 40) { color = "text-red-400 border-red-400/30 bg-red-400/10"; label = "Needs Work"; }
  else if (score < 60) { color = "text-amber-400 border-amber-400/30 bg-amber-400/10"; label = "Fair"; }
  else if (score < 80) { color = "text-blue-400 border-blue-400/30 bg-blue-400/10"; label = "Good"; }
  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${color}`}>
      {score}/100 — {label}
    </Badge>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function engineIcon(engine: string): string {
  const map: Record<string, string> = {
    ChatGPT: "bg-emerald-500/10 text-emerald-400",
    Perplexity: "bg-blue-500/10 text-blue-400",
    "Google SGE": "bg-amber-500/10 text-amber-400",
    "Bing Copilot": "bg-cyan-500/10 text-cyan-400",
  };
  return map[engine] || "bg-muted text-muted-foreground";
}

function GeoAnalyticsPanel() {
  const PROJECT_ID = useProjectId();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.geoAnalytics(PROJECT_ID),
    queryFn: () => getGeoAnalytics(PROJECT_ID),
    enabled: !!PROJECT_ID,
    refetchInterval: PROJECT_ID ? 30000 : false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading GEO analytics...
      </div>
    );
  }

  if (!data) return null;

  const { summary, search_real_estate, recent_citations, schema_deployments } = data;

  return (
    <div className="space-y-4" data-testid="geo-analytics-panel">
      {/* GEO KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="geo-kpi-row">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">GEO Score</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-geo-score">{summary.geo_score}</p>
            <GeoScoreBadge score={summary.geo_score} />
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Quote className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">AI Citations</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-ai-citations">{summary.total_ai_citations}</p>
            <span className="text-xs text-emerald-400">+{summary.citation_growth_pct}%</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <FileCode2 className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Schema Pages</span>
          </div>
          <p className="text-xl font-semibold tabular-nums" data-testid="kpi-schema-pages">{summary.pages_with_schema}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Avg Position</span>
          </div>
          <p className="text-xl font-semibold tabular-nums" data-testid="kpi-avg-position">#{summary.avg_snippet_position}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Growth</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-emerald-400" data-testid="kpi-citation-growth">+{summary.citation_growth_pct}%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GEO & Search Real-Estate */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-violet-400" />
              GEO &amp; Search Real-Estate
            </CardTitle>
            <CardDescription className="text-xs">
              Your citation presence across AI engines
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3" data-testid="geo-search-real-estate">
              {search_real_estate.map((engine) => (
                <div key={engine.engine} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold ${engineIcon(engine.engine)}`}>
                    {engine.engine.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{engine.engine}</span>
                      <TrendIcon trend={engine.trend} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span>{engine.queries_tracked} tracked</span>
                      <span>{engine.citations_found} citations</span>
                      {engine.avg_position && <span>avg #{engine.avg_position}</span>}
                      <span>{engine.snippet_appearances} snippets</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums">{engine.citations_found}</p>
                    <p className="text-[10px] text-muted-foreground">citations</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Engine Citations */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Quote className="h-4 w-4 text-emerald-400" />
              AI Engine Citations
            </CardTitle>
            <CardDescription className="text-xs">
              Recent mentions of your content in AI search results
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2" data-testid="geo-citations-list">
              {recent_citations.map((citation) => (
                <div key={citation.id} className="p-2.5 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[9px] font-mono ${engineIcon(citation.engine)}`}>
                        {citation.engine}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">#{citation.position}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(citation.detected_at)}</span>
                  </div>
                  <p className="text-xs font-medium truncate" title={citation.query}>
                    "{citation.query}"
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {citation.snippet_preview}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <FileCode2 className="h-3 w-3" />
                    <span className="truncate">{citation.cited_page_title}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schema Deployments Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-blue-400" />
            JSON-LD Schema Deployments
          </CardTitle>
          <CardDescription className="text-xs">
            Structured data injected by the GEO rewriter across your pages
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="geo-schema-table">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">Page</th>
                  <th className="text-left py-2 font-medium">Schema Type</th>
                  <th className="text-left py-2 font-medium">Injected</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {schema_deployments.map((dep, idx) => (
                  <tr key={idx} className="border-b border-border/30 last:border-0">
                    <td className="py-2 font-mono text-xs truncate max-w-[200px]" title={dep.page_url}>
                      {dep.page_url}
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {dep.schema_type}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {timeAgo(dep.injected_at)}
                    </td>
                    <td className="py-2">
                      {dep.validation_status === "valid" && (
                        <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Valid
                        </Badge>
                      )}
                      {dep.validation_status === "warning" && (
                        <span className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-400/30 bg-amber-400/10">
                            <TriangleAlert className="h-3 w-3 mr-1" />
                            Warning
                          </Badge>
                          {dep.errors && (
                            <span className="text-[10px] text-muted-foreground">{dep.errors[0]}</span>
                          )}
                        </span>
                      )}
                      {dep.validation_status === "error" && (
                        <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/30 bg-red-400/10">
                          <XCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function MissionControl() {
  const PROJECT_ID = useProjectId();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.missionControl(PROJECT_ID),
    queryFn: () => getMissionControl(PROJECT_ID),
    enabled: !!PROJECT_ID,
    refetchInterval: PROJECT_ID ? 15000 : false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="mission-control-loading">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading Mission Control...
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px]" data-testid="page-mission-control">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Mission Control</h1>
            <p className="text-xs text-muted-foreground">
              System-wide health, integration status, and action audit trail
            </p>
          </div>
        </div>

        {/* KPI row */}
        <SummaryKPIs data={data} />

        {/* Tabbed sections */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-agents">Agents</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
            <TabsTrigger value="outreach" data-testid="tab-outreach">Outreach</TabsTrigger>
            <TabsTrigger value="link-graph" data-testid="tab-link-graph">Link Graph</TabsTrigger>
            <TabsTrigger value="geo" data-testid="tab-geo">GEO</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <IntegrationsPanel integrations={data?.integrations ?? []} />
              <CronJobsPanel cronJobs={data?.cron_jobs ?? []} />
            </div>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            <AgentHealthPanel agents={data?.agent_health ?? []} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ActionTimeline />
          </TabsContent>

          <TabsContent value="outreach" className="mt-4">
            <OutreachPanel />
          </TabsContent>

          <TabsContent value="link-graph" className="mt-4">
            <LinkGraphPanel />
          </TabsContent>

          <TabsContent value="geo" className="mt-4">
            <GeoAnalyticsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
