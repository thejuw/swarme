/**
 * SwarmControlToggle — Phase 5 Task 5.4
 *
 * Replaces the Phase 1 pill-button ModeToggle with a proper Switch.
 * - Switch labeled "Autopilot Mode"
 * - OFF = Copilot (human-in-the-loop), ON = Autopilot (auto-publish)
 * - Switching to Autopilot triggers an AlertDialog confirmation warning
 *   that content will be published without human review
 * - Switching back to Copilot happens immediately (safe direction)
 * - Wired to PUT /api/projects/:id/settings via updateSettings()
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { updateSettings, queryKeys } from "@/lib/api";
import type { ProjectsResponse } from "@/lib/api";

interface SwarmControlToggleProps {
  projectId?: string;
}

export function SwarmControlToggle({
  projectId = "proj_001",
}: SwarmControlToggleProps) {
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);

  // Read current mode from the projects query (already cached by KpiCards)
  const { data: projectsData } = useQuery<ProjectsResponse>({
    queryKey: queryKeys.projects(),
  });

  const project = projectsData?.projects?.find((p) => p.id === projectId);
  const currentMode = (project?.mode ?? "copilot") as "copilot" | "autopilot";
  const isAutopilot = currentMode === "autopilot";

  // ── Mutation ────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async (newMode: "copilot" | "autopilot") => {
      return updateSettings(projectId, { mode: newMode });
    },
    onSuccess: (_data, newMode) => {
      // Optimistically update the projects cache
      queryClient.setQueryData<ProjectsResponse>(
        queryKeys.projects(),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            projects: old.projects.map((p) =>
              p.id === projectId ? { ...p, mode: newMode } : p
            ),
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.projects() });

      toast({
        title: newMode === "autopilot" ? "Autopilot engaged" : "Copilot mode",
        description:
          newMode === "autopilot"
            ? "Content will be published automatically without review."
            : "Content will require your approval before publishing.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Mode change failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Handlers ────────────────────────────────────────

  const handleSwitchChange = (checked: boolean) => {
    if (checked) {
      // Switching TO autopilot → show confirmation dialog
      setShowConfirm(true);
    } else {
      // Switching TO copilot → safe, do immediately
      mutation.mutate("copilot");
    }
  };

  const confirmAutopilot = () => {
    setShowConfirm(false);
    mutation.mutate("autopilot");
  };

  const cancelAutopilot = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <div
        className="flex items-center gap-2"
        data-testid="swarm-control-toggle"
      >
        {/* Mode indicator badge */}
        {isAutopilot ? (
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-orange-500/40 text-orange-400 gap-1"
          >
            <Zap className="h-2.5 w-2.5" />
            Auto
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-primary/40 text-primary gap-1"
          >
            <Shield className="h-2.5 w-2.5" />
            Copilot
          </Badge>
        )}

        {/* The switch */}
        <Switch
          checked={isAutopilot}
          onCheckedChange={handleSwitchChange}
          disabled={mutation.isPending}
          aria-label="Toggle autopilot mode"
          data-testid="switch-autopilot"
          className={
            isAutopilot
              ? "data-[state=checked]:bg-orange-500"
              : ""
          }
        />

        {mutation.isPending && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* ── Autopilot confirmation dialog ── */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent data-testid="dialog-autopilot-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-orange-400" />
              Enable Autopilot Mode?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2">
              <span className="block">
                In Autopilot mode, the swarm will automatically publish
                content without waiting for your approval. This includes:
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Auto-publishing drafted articles to your CMS</li>
                <li>Executing outreach campaigns immediately</li>
                <li>Applying technical SEO fixes without review</li>
              </ul>
              <span className="block font-medium text-destructive">
                You can switch back to Copilot mode at any time.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={cancelAutopilot}
              data-testid="button-cancel-autopilot"
            >
              Stay in Copilot
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAutopilot}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              data-testid="button-confirm-autopilot"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Enable Autopilot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
