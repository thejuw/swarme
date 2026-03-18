/**
 * CopilotApprovalSheet — Phase 5 Task 5.3
 *
 * Slide-out Sheet showing task details + generated payload for human review.
 * Two actions: "Approve & Publish" and "Reject / Retry".
 *
 * For DO-backed workflows (orchestrator tasks), it also fetches the
 * full WorkflowStateData to display the pipeline (research -> draft -> audit).
 *
 * Optimistic UI: badge flips immediately, rolls back on error.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Search,
  Shield,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  approveTask,
  approveWorkflow,
  resetWorkflow,
  getWorkflowStatus,
  queryKeys,
} from "@/lib/api";
import type { Task, WorkflowStateData, WorkflowStatusResponse } from "@/lib/api";

interface CopilotApprovalSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

export function CopilotApprovalSheet({
  task,
  open,
  onOpenChange,
  projectId = "proj_001",
}: CopilotApprovalSheetProps) {
  const { toast } = useToast();
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  // Fetch full workflow state if available (DO pipeline data)
  const { data: workflowData } = useQuery<WorkflowStatusResponse>({
    queryKey: queryKeys.workflowStatus(projectId),
    queryFn: () => getWorkflowStatus(projectId),
    enabled: open && !!task,
    refetchInterval: open ? 5_000 : false,
  });

  const workflow = workflowData?.workflow;
  const hasWorkflow =
    workflow && workflow.state !== "IDLE" && workflow.keyword !== "";

  // ── Approve mutation ────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: async () => {
      // If there's a DO workflow in AWAITING_APPROVAL, approve that
      if (hasWorkflow && workflow.state === "AWAITING_APPROVAL") {
        return approveWorkflow(projectId);
      }
      // Otherwise approve the individual task
      if (task) {
        return approveTask(projectId, task.id);
      }
      throw new Error("No task to approve");
    },
    onMutate: () => {
      setOptimisticStatus("Running");
    },
    onSuccess: () => {
      toast({
        title: "Approved & Publishing",
        description: task?.task_description
          ? `"${task.task_description}" is now being published.`
          : "Content approved and sent to CMS.",
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflowStatus(projectId),
      });
      setOptimisticStatus(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setOptimisticStatus(null);
      toast({
        title: "Approval failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Reject mutation ─────────────────────────────────

  const rejectMutation = useMutation({
    mutationFn: async () => {
      // Reset the DO workflow back to IDLE so the agent can re-run
      if (hasWorkflow) {
        return resetWorkflow(projectId);
      }
      // For plain tasks, there's no reject endpoint — we just close
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Rejected",
        description: "Workflow reset to IDLE. The swarm will re-run when triggered.",
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.workflowStatus(projectId),
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Reject failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = approveMutation.isPending || rejectMutation.isPending;
  const displayStatus = optimisticStatus ?? task?.status ?? "Unknown";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg flex flex-col"
        data-testid="sheet-copilot-approval"
      >
        <SheetHeader>
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Copilot Review
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Review the generated content before it goes live.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {task ? (
            <div className="space-y-4 pb-6">
              {/* ── Task header ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium font-mono uppercase tracking-wide text-muted-foreground">
                    {task.agent_type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {task.action}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] font-mono ${
                      displayStatus === "Running"
                        ? "border-emerald-500/40 text-emerald-400"
                        : displayStatus === "Awaiting_Approval"
                          ? "border-blue-500/40 text-blue-400"
                          : ""
                    }`}
                    data-testid="badge-approval-status"
                  >
                    {displayStatus.replace("_", " ").toLowerCase()}
                  </Badge>
                </div>

                {task.task_description && (
                  <p
                    className="text-sm"
                    data-testid="text-task-description"
                  >
                    {task.task_description}
                  </p>
                )}
              </div>

              <Separator />

              {/* ── Pipeline details (if DO workflow present) ── */}
              {hasWorkflow && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Pipeline
                  </h4>

                  {/* Research */}
                  {workflow.pipeline.research && (
                    <PipelineSection
                      icon={Search}
                      title="Research"
                      source={workflow.pipeline.research.source}
                    >
                      <PipelineRow label="SERP Results" value={String(workflow.pipeline.research.serpResults)} />
                      <PipelineRow label="Competitors" value={workflow.pipeline.research.topCompetitors.join(", ")} />
                      <PipelineRow label="Content Gaps" value={workflow.pipeline.research.contentGaps.join(", ")} />
                      <PipelineRow label="Suggested Angle" value={workflow.pipeline.research.suggestedAngle} />
                    </PipelineSection>
                  )}

                  {/* Draft */}
                  {workflow.pipeline.draft && (
                    <PipelineSection
                      icon={FileText}
                      title="Draft"
                      source={workflow.pipeline.draft.source}
                    >
                      <PipelineRow label="Title" value={workflow.pipeline.draft.title} />
                      <PipelineRow label="Words" value={String(workflow.pipeline.draft.wordCount)} />
                      <PipelineRow label="SEO Score" value={`${workflow.pipeline.draft.seoScore}/100`} />
                      <PipelineRow label="Sections" value={workflow.pipeline.draft.sections.join(" -> ")} />
                      {workflow.pipeline.draft.metaDescription && (
                        <div className="mt-1.5 p-2 rounded bg-muted text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Meta: </span>
                          {workflow.pipeline.draft.metaDescription}
                        </div>
                      )}
                    </PipelineSection>
                  )}

                  {/* Audit */}
                  {workflow.pipeline.audit && (
                    <PipelineSection
                      icon={Shield}
                      title="Audit"
                      source={null}
                    >
                      <PipelineRow label="Readability" value={`${workflow.pipeline.audit.readabilityScore}/100`} />
                      <PipelineRow label="Keyword Density" value={`${workflow.pipeline.audit.keywordDensity.toFixed(1)}%`} />
                      <PipelineRow label="Schema Valid" value={workflow.pipeline.audit.schemaValid ? "Yes" : "No"} />
                      {workflow.pipeline.audit.technicalIssues.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {workflow.pipeline.audit.technicalIssues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                              <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                              {issue}
                            </div>
                          ))}
                        </div>
                      )}
                    </PipelineSection>
                  )}

                  {/* Publish target */}
                  {workflow.pipeline.publishResult && (
                    <PipelineSection
                      icon={Send}
                      title="Publish"
                      source={workflow.pipeline.publishResult.source}
                    >
                      <PipelineRow label="Mode" value={workflow.pipeline.publishResult.mode} />
                      <PipelineRow label="Action" value={workflow.pipeline.publishResult.action} />
                      {workflow.pipeline.publishResult.publishedUrl && (
                        <PipelineRow label="URL" value={workflow.pipeline.publishResult.publishedUrl} />
                      )}
                    </PipelineSection>
                  )}
                </div>
              )}

              {/* ── Raw payload (fallback for non-DO tasks) ── */}
              {!hasWorkflow && task.result_payload && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Generated Payload
                  </h4>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all font-mono">
                    {task.result_payload}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">
                No task selected
              </p>
            </div>
          )}
        </ScrollArea>

        {/* ── Action buttons ── */}
        {task && task.status === "Awaiting_Approval" && (
          <>
            <Separator className="my-2" />
            <div className="flex items-center gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={() => approveMutation.mutate()}
                disabled={isLoading}
                data-testid="button-approve-publish"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Approve & Publish
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => rejectMutation.mutate()}
                disabled={isLoading}
                data-testid="button-reject-retry"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                )}
                Reject / Retry
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Pipeline helpers ──────────────────────────────────

function PipelineSection({
  icon: Icon,
  title,
  source,
  children,
}: {
  icon: React.ElementType;
  title: string;
  source: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{title}</span>
        {source && (
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">
            {source}
          </Badge>
        )}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PipelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span className="text-foreground break-words min-w-0">{value}</span>
    </div>
  );
}
