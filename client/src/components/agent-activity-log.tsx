/**
 * AgentActivityLog — Phase 5 enhanced
 *
 * - Uses typed Task interface from lib/api.ts
 * - react-query polling at 8 s via refetchInterval
 * - Color-coded status badges:
 *     Pending -> yellow/amber outline
 *     Running -> emerald with spin animation
 *     Awaiting_Approval -> blue outline (clickable -> opens approval flow)
 *     Completed -> green/primary
 *     Failed -> red/destructive
 * - Vertical feed layout with timeline connector
 * - Awaiting_Approval rows emit onSelectTask callback for Copilot Approval Sheet
 * - Agent icons expanded for Phase 4 types: orchestrator, publisher, researcher
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
  Workflow,
  Send,
  BookOpen,
  PackageX,
} from "lucide-react";
import type { Task, TasksResponse } from "@/lib/api";
import { queryKeys, getTasks } from "@/lib/api";
import { useProjectId } from "@/hooks/use-project-id";


// ── Agent icon + label maps ──────────────────────────────

const agentIcons: Record<string, React.ElementType> = {
  scraper: Search,
  writer: PenTool,
  auditor: Shield,
  outreach: Mail,
  cro: BarChart3,
  visibility: Eye,
  orchestrator: Workflow,
  publisher: Send,
  researcher: BookOpen,
};

const agentLabels: Record<string, string> = {
  scraper: "Scraper",
  writer: "Writer",
  auditor: "Auditor",
  outreach: "Outreach",
  cro: "CRO",
  visibility: "Visibility",
  orchestrator: "Orchestrator",
  publisher: "Publisher",
  researcher: "Researcher",
};

// ── Status -> visual config ──────────────────────────────
// Phase 5 color-coded mapping:
//   Pending      -> yellow/amber outline
//   Running      -> emerald spin
//   Awaiting_Approval -> blue outline
//   Completed    -> green/primary
//   Failed       -> red/destructive

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface StatusVisual {
  icon: React.ElementType;
  iconClass: string;
  badge: BadgeVariant;
  badgeClass: string;
  label: string;
}

const statusConfig: Record<string, StatusVisual> = {
  Pending: {
    icon: Clock,
    iconClass: "text-yellow-500",
    badge: "outline",
    badgeClass: "border-yellow-500/40 text-yellow-500",
    label: "pending",
  },
  Running: {
    icon: Loader2,
    iconClass: "text-emerald-400 animate-spin",
    badge: "default",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    label: "running",
  },
  Awaiting_Approval: {
    icon: Clock,
    iconClass: "text-blue-400",
    badge: "outline",
    badgeClass:
      "border-blue-500/40 text-blue-400 cursor-pointer hover:bg-blue-500/10 transition-colors",
    label: "awaiting approval",
  },
  Completed: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    badge: "secondary",
    badgeClass: "",
    label: "completed",
  },
  Failed: {
    icon: XCircle,
    iconClass: "text-destructive",
    badge: "destructive",
    badgeClass: "",
    label: "failed",
  },
  Low_Inventory: {
    icon: PackageX,
    iconClass: "text-orange-400",
    badge: "outline",
    badgeClass: "border-orange-500/40 text-orange-400 bg-orange-500/10",
    label: "low inventory",
  },
};

const FALLBACK_STATUS = statusConfig.Pending;

// ── Relative time formatter ────────────────────────────

function formatTimestamp(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ── Component ──────────────────────────────────────────

interface AgentActivityLogProps {
  projectId?: string;
  /** Fires when user clicks an Awaiting_Approval row. Used by Copilot Approval Sheet. */
  onSelectTask?: (task: Task) => void;
}

export function AgentActivityLog({
  projectId: propProjectId,
  onSelectTask,
}: AgentActivityLogProps) {
  const hookProjectId = useProjectId();
  const projectId = propProjectId || hookProjectId;
  const { data, isLoading, isError } = useQuery<TasksResponse>({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => getTasks(projectId, { limit: 50 }),
    refetchInterval: 8_000, // Poll every 8 seconds for live feel
  });

  const tasks: Task[] = data?.tasks ?? [];

  return (
    <Card
      className="col-span-full lg:col-span-2"
      data-testid="card-agent-activity-log"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Agent Activity</CardTitle>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="text-xs text-muted-foreground font-mono">LIVE</span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[340px]">
          {/* ── Loading skeleton ── */}
          {isLoading ? (
            <div className="space-y-3 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            /* ── Error state ── */
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-destructive">
                Failed to load agent activity
              </p>
            </div>
          ) : (
            /* ── Timeline feed ── */
            <div className="relative">
              {/* Vertical timeline connector line */}
              {tasks.length > 1 && (
                <div className="absolute left-[1.28rem] top-6 bottom-6 w-px bg-border" />
              )}

              {tasks.map((task, idx) => {
                const AgentIcon = agentIcons[task.agent_type] ?? Search;
                const config = statusConfig[task.status] ?? FALLBACK_STATUS;
                const StatusIcon = config.icon;
                const isClickable =
                  task.status === "Awaiting_Approval" && !!onSelectTask;

                return (
                  <div
                    key={task.id}
                    className={`relative flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors ${
                      isClickable
                        ? "cursor-pointer hover:bg-accent/50"
                        : ""
                    }`}
                    role={isClickable ? "button" : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onClick={
                      isClickable ? () => onSelectTask(task) : undefined
                    }
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectTask(task);
                            }
                          }
                        : undefined
                    }
                    data-testid={`log-entry-${task.id}`}
                  >
                    {/* Timeline node */}
                    <div className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted border border-border">
                      <AgentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium">
                          {agentLabels[task.agent_type] ?? task.agent_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {task.action}
                        </span>
                        <Badge
                          variant={config.badge}
                          className={`text-[10px] font-mono ml-auto shrink-0 ${config.badgeClass}`}
                          data-testid={`badge-status-${task.id}`}
                        >
                          <StatusIcon
                            className={`h-2.5 w-2.5 mr-1 ${config.iconClass}`}
                          />
                          {config.label}
                        </Badge>
                      </div>

                      {task.task_description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {task.task_description}
                        </p>
                      )}

                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                        {formatTimestamp(task.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {tasks.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No agent activity yet
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
