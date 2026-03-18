/**
 * AgentActivity — Full-page Agent Activity view at /#/activity
 *
 * Dedicated page wrapping the AgentActivityLog component with
 * additional filtering controls and a header.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTasks, queryKeys, type Task } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectId } from "@/hooks/use-project-id";
import {
  Search,
  PenTool,
  Shield,
  Mail,
  BarChart3,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  BrainCircuit,
  Newspaper,
  FlaskConical,
} from "lucide-react";

const agentIcons: Record<string, React.ElementType> = {
  scraper: Search,
  writer: PenTool,
  auditor: Shield,
  outreach: Mail,
  cro: BarChart3,
  visibility: Eye,
  orchestrator: BrainCircuit,
  publisher: Newspaper,
  researcher: FlaskConical,
};

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  Pending: { color: "bg-amber-500/10 text-amber-400 border-amber-500/25", icon: Clock },
  Running: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", icon: Loader2 },
  Completed: { color: "bg-green-500/10 text-green-400 border-green-500/25", icon: CheckCircle2 },
  Failed: { color: "bg-red-500/10 text-red-400 border-red-500/25", icon: XCircle },
  Awaiting_Approval: { color: "bg-blue-500/10 text-blue-400 border-blue-500/25", icon: Clock },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentActivity() {
  const PROJECT_ID = useProjectId();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tasks(PROJECT_ID),
    queryFn: () => getTasks(PROJECT_ID, { limit: 100 }),
    refetchInterval: 8000,
  });

  const tasks: Task[] = data?.tasks || [];

  const filtered = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (agentFilter !== "all" && t.agent_type !== agentFilter) return false;
    return true;
  });

  const agentTypes = [...new Set(tasks.map((t) => t.agent_type))].sort();

  return (
    <div className="h-full flex flex-col" data-testid="page-agent-activity">
      <div className="p-4 pb-0 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Agent Activity</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time task feed across all agents in the swarm.
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Running">Running</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
              <SelectItem value="Awaiting_Approval">Awaiting Approval</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-agent-filter">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agentTypes.map((at) => (
                <SelectItem key={at} value={at}>
                  {at.charAt(0).toUpperCase() + at.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            No tasks match the selected filters.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => {
              const AgentIcon = agentIcons[task.agent_type] || Activity;
              const sc = statusConfig[task.status] || statusConfig.Pending;
              const StatusIcon = sc.icon;
              return (
                <Card
                  key={task.id}
                  className="border-border/50"
                  data-testid={`activity-task-${task.id}`}
                >
                  <CardContent className="flex items-center gap-3 py-3 px-4">
                    <div className="p-2 rounded-md bg-muted/50">
                      <AgentIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{task.action}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sc.color}`}>
                          <StatusIcon className={`h-2.5 w-2.5 mr-0.5 ${task.status === "Running" ? "animate-spin" : ""}`} />
                          {task.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {task.task_description || "No description"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {task.agent_type}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(task.created_at)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
