import { useState } from "react";
import { KpiCards } from "@/components/kpi-cards";
import { AgentActivityLog } from "@/components/agent-activity-log";
import { VisibilityScore } from "@/components/visibility-score";
import { TrendRadar } from "@/components/trend-radar";
import { SerpChart } from "@/components/serp-chart";
import { GscConnectCard } from "@/components/gsc-connect-card";
import { CopilotApprovalSheet } from "@/components/copilot-approval-sheet";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import type { Task } from "@/lib/api";

export default function Dashboard() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-8 animate-fade-in overflow-y-auto h-full">
      {/* KPI strip */}
      <KpiCards />

      {/* Main grid: Activity + Visibility */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AgentActivityLog onSelectTask={handleSelectTask} />
        <VisibilityScore />
      </div>

      {/* Secondary grid: SERP chart + GSC card + Trend Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SerpChart />
        <div className="flex flex-col gap-4">
          <GscConnectCard />
          <TrendRadar />
        </div>
      </div>

      <PerplexityAttribution />

      {/* Copilot Approval Sheet — slides in from right */}
      <CopilotApprovalSheet
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
