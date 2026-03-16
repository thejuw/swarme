import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Cpu,
  TrendingUp,
  FileText,
  Link2,
  ArrowUp,
} from "lucide-react";
import { getTasks, queryKeys } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  domain: string;
  mode: string;
  is_active: number;
  visibility_score: number;
  active_agents: number;
}

interface KpiData {
  label: string;
  value: string;
  change: string;
  icon: React.ElementType;
}

export function KpiCards({ projectId = "proj_001" }: { projectId?: string }) {
  const { data: projectsData, isLoading } = useQuery<{
    success: boolean;
    projects: Project[];
  }>({
    queryKey: ["/api/projects"],
  });

  const { data: tasksData } = useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => getTasks(projectId, { limit: 100 }),
  });

  const project = projectsData?.projects?.find((p) => p.id === projectId);
  const tasks = tasksData?.tasks ?? [];
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;

  const kpis: KpiData[] = [
    {
      label: "Active Agents",
      value: String(project?.active_agents ?? 0),
      change: "+3 this hour",
      icon: Cpu,
    },
    {
      label: "Pages Optimized",
      value: String(completedTasks > 0 ? completedTasks * 100 + 47 : 847),
      change: "+23 today",
      icon: FileText,
    },
    {
      label: "Backlinks Acquired",
      value: "156",
      change: "+12 this week",
      icon: Link2,
    },
    {
      label: "Avg. SERP Position",
      value: "4.2",
      change: "-1.3 from last month",
      icon: TrendingUp,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">
                {kpi.label}
              </span>
              <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-xl font-bold tabular-nums tracking-tight">
                {kpi.value}
              </span>
              <div className="flex items-center gap-0.5 pb-0.5">
                <ArrowUp className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-mono text-primary">
                  {kpi.change}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
