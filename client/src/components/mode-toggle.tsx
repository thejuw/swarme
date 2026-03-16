import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Zap, Shield } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export function ModeToggle({ projectId = "proj_001" }: { projectId?: string }) {
  const [mode, setMode] = useState<"copilot" | "autopilot">("copilot");

  const mutation = useMutation({
    mutationFn: async (newMode: "copilot" | "autopilot") => {
      return apiRequest("PUT", `/api/projects/${projectId}/settings`, {
        mode: newMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });

  const handleModeChange = (newMode: "copilot" | "autopilot") => {
    setMode(newMode);
    mutation.mutate(newMode);
  };

  return (
    <div
      className="flex items-center rounded-md border bg-card p-0.5 gap-0.5"
      data-testid="mode-toggle"
    >
      <button
        onClick={() => handleModeChange("copilot")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
          mode === "copilot"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground"
        }`}
        data-testid="button-copilot"
      >
        <Shield className="h-3 w-3" />
        Copilot
      </button>
      <button
        onClick={() => handleModeChange("autopilot")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
          mode === "autopilot"
            ? "bg-destructive text-destructive-foreground"
            : "text-muted-foreground"
        }`}
        data-testid="button-autopilot"
      >
        <Zap className="h-3 w-3" />
        Autopilot
      </button>
    </div>
  );
}
