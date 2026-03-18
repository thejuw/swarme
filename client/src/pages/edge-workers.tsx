/**
 * EdgeWorkers — Full-page Edge Workers monitoring view at /#/workers
 *
 * Displays the health status of all Cloudflare Worker agents,
 * cron job schedules, and integration connectivity.
 * Pulls from the mission-control API endpoint.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectId } from "@/hooks/use-project-id";
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Activity,
  Server,
  Timer,
} from "lucide-react";

interface AgentHealth {
  agent_type: string;
  status: "healthy" | "degraded" | "idle";
  tasks_last_hour: number;
  errors_last_hour: number;
  avg_latency_ms: number;
}

interface CronJob {
  name: string;
  cron: string;
  last_run: string;
  next_run: string;
  status: string;
  duration_ms: number;
}

interface MissionControlData {
  success: boolean;
  summary: {
    agents_active: number;
    agents_degraded: number;
    agents_idle: number;
    total_actions_24h: number;
    crons_healthy: number;
    crons_total: number;
  };
  agent_health: AgentHealth[];
  cron_jobs: CronJob[];
}

const healthColors: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  degraded: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  idle: "bg-slate-500/10 text-slate-400 border-slate-500/25",
};

const healthIcons: Record<string, React.ElementType> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  idle: Clock,
};

function formatLatency(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function EdgeWorkers() {
  const PROJECT_ID = useProjectId();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/projects", PROJECT_ID, "mission-control"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${PROJECT_ID}/mission-control`);
      return res.json() as Promise<MissionControlData>;
    },
    refetchInterval: 15_000,
  });

  const agents = data?.agent_health || [];
  const crons = data?.cron_jobs || [];
  const summary = data?.summary;

  return (
    <div className="h-full flex flex-col" data-testid="page-edge-workers">
      <div className="p-4 pb-0">
        <h2 className="text-lg font-semibold tracking-tight">Edge Workers</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cloudflare Worker agent health, latency, and scheduled cron jobs.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border-border/50" data-testid="card-agents-active">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Active Agents
                </CardTitle>
                <Cpu className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-emerald-400">
                    {summary?.agents_active ?? 0}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-agents-degraded">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Degraded
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-amber-400">
                    {summary?.agents_degraded ?? 0}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-tasks-24h">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tasks (24h)
                </CardTitle>
                <Zap className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums">{summary?.total_actions_24h ?? 0}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-crons-healthy">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Crons Healthy
                </CardTitle>
                <Timer className="h-4 w-4 text-teal-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums">
                    {summary?.crons_healthy ?? 0}/{summary?.crons_total ?? 0}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Agent Health Table */}
          <Card className="border-border/50" data-testid="table-agent-health">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Agent Health</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agent</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Tasks/hr</TableHead>
                      <TableHead className="text-xs text-right">Errors/hr</TableHead>
                      <TableHead className="text-xs text-right">Avg Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.map((agent) => {
                      const StatusIcon = healthIcons[agent.status] || CheckCircle2;
                      return (
                        <TableRow key={agent.agent_type} data-testid={`worker-row-${agent.agent_type}`}>
                          <TableCell className="font-medium text-sm capitalize">
                            {agent.agent_type}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${healthColors[agent.status]}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                              {agent.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {agent.tasks_last_hour}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            <span className={agent.errors_last_hour > 0 ? "text-red-400" : ""}>
                              {agent.errors_last_hour}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatLatency(agent.avg_latency_ms)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Cron Jobs Table */}
          <Card className="border-border/50" data-testid="table-cron-jobs">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Scheduled Cron Jobs</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Job</TableHead>
                      <TableHead className="text-xs">Schedule</TableHead>
                      <TableHead className="text-xs">Last Run</TableHead>
                      <TableHead className="text-xs">Next Run</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crons.map((job) => (
                      <TableRow key={job.name} data-testid={`cron-row-${job.name.replace(/\s+/g, "-").toLowerCase()}`}>
                        <TableCell className="font-medium text-sm">{job.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {job.cron}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(job.last_run).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(job.next_run).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              job.status === "success"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                : "bg-red-500/10 text-red-400 border-red-500/25"
                            }`}
                          >
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatLatency(job.duration_ms)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
