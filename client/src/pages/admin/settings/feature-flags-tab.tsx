/**
 * Feature Flags Tab — Phase 31.5 Task 2
 *
 * Card + Switch UI for each feature flag.
 * Rollout state dropdown: Disabled | Global | Targeted.
 * When "Targeted" is selected, show multi-input for user IDs/emails.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Flag, Globe, Users, X, Plus, Loader2 } from "lucide-react";

interface FlagState {
  state: "disabled" | "global" | "targeted";
  users: string[];
}

type FlagsMap = Record<string, FlagState>;

const FLAG_DESCRIPTIONS: Record<string, string> = {
  beta_pinterest_agent: "Pinterest social agent for pin scheduling and analytics",
  new_audit_ui: "Redesigned admin audit log interface with advanced filters",
  ai_content_refresh_v2: "Next-gen AI content refresh with semantic diff engine",
  smart_cro_heatmaps: "ML-powered heatmap analysis for CRO agent decisions",
  bulk_keyword_import: "CSV bulk import for keyword tracking (up to 5,000 rows)",
  advanced_decay_alerts: "Proactive content decay alerts with severity scoring",
};

const STATE_BADGES: Record<string, { className: string; icon: typeof Globe }> = {
  disabled: { className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", icon: X },
  global: { className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: Globe },
  targeted: { className: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Users },
};

export function FeatureFlagsTab() {
  const { toast } = useToast();

  const flagsQuery = useQuery<{ success: boolean; flags: FlagsMap }>({
    queryKey: ["/api/admin/flags"],
  });

  const flags = flagsQuery.data?.flags || {};
  const flagKeys = Object.keys(flags);

  const updateFlag = useMutation({
    mutationFn: async (data: { key: string; state: string; users?: string[] }) => {
      const res = await apiRequest("POST", "/api/admin/flags", data);
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audit-log"] });
      toast({ title: `Flag "${vars.key}" updated` });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Flag className="h-4 w-4 text-muted-foreground" />
          Feature Flags
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Control feature rollout across the platform. Changes are logged to the audit trail.
        </p>
      </div>

      {flagKeys.length === 0 && (
        <p className="text-xs text-muted-foreground py-8 text-center">No feature flags configured</p>
      )}

      <div className="space-y-3">
        {flagKeys.map((key) => (
          <FlagCard
            key={key}
            flagKey={key}
            flag={flags[key]}
            description={FLAG_DESCRIPTIONS[key] || "Custom feature flag"}
            onUpdate={(state, users) => updateFlag.mutate({ key, state, users })}
            isPending={updateFlag.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function FlagCard({
  flagKey,
  flag,
  description,
  onUpdate,
  isPending,
}: {
  flagKey: string;
  flag: FlagState;
  description: string;
  onUpdate: (state: string, users?: string[]) => void;
  isPending: boolean;
}) {
  const [localState, setLocalState] = useState(flag.state);
  const [localUsers, setLocalUsers] = useState<string[]>(flag.users);
  const [newUserId, setNewUserId] = useState("");
  const isDirty = localState !== flag.state || JSON.stringify(localUsers) !== JSON.stringify(flag.users);

  const handleStateChange = (state: string) => {
    setLocalState(state as FlagState["state"]);
    if (state !== "targeted") {
      setLocalUsers([]);
    } else if (localUsers.length === 0 && flag.users.length > 0) {
      setLocalUsers([...flag.users]);
    }
  };

  const addUser = () => {
    const trimmed = newUserId.trim();
    if (trimmed && !localUsers.includes(trimmed)) {
      setLocalUsers([...localUsers, trimmed]);
      setNewUserId("");
    }
  };

  const removeUser = (userId: string) => {
    setLocalUsers(localUsers.filter((u) => u !== userId));
  };

  const isEnabled = localState !== "disabled";
  const badgeInfo = STATE_BADGES[localState] || STATE_BADGES.disabled;
  const BadgeIcon = badgeInfo.icon;

  // Display-friendly name: "beta_pinterest_agent" -> "Beta Pinterest Agent"
  const displayName = flagKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card
      className={`transition-colors ${isEnabled ? "" : "opacity-60"}`}
      data-testid={`flag-card-${flagKey}`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Switch
              checked={isEnabled}
              onCheckedChange={(v) => handleStateChange(v ? "global" : "disabled")}
              data-testid={`switch-flag-${flagKey}`}
            />
            <div className="min-w-0">
              <CardTitle className="text-xs font-medium flex items-center gap-2">
                {displayName}
                <Badge className={`text-[9px] ${badgeInfo.className}`}>
                  <BadgeIcon className="h-2.5 w-2.5 mr-0.5" />
                  {localState}
                </Badge>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Select value={localState} onValueChange={handleStateChange}>
              <SelectTrigger
                className="h-7 text-[11px] w-[120px]"
                data-testid={`select-flag-state-${flagKey}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="global">Global (All)</SelectItem>
                <SelectItem value="targeted">Targeted</SelectItem>
              </SelectContent>
            </Select>

            {isDirty && (
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={() => onUpdate(localState, localState === "targeted" ? localUsers : undefined)}
                disabled={isPending}
                data-testid={`button-save-flag-${flagKey}`}
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Save
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Targeted user list */}
      {localState === "targeted" && (
        <CardContent className="pt-0 px-4 pb-4">
          <div className="mt-2 space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Whitelisted Users ({localUsers.length})
            </Label>

            {/* Add user input */}
            <div className="flex items-center gap-2 max-w-sm">
              <Input
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUser()}
                placeholder="User ID or email..."
                className="h-7 text-[11px] font-mono"
                data-testid={`input-flag-user-${flagKey}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 shrink-0"
                onClick={addUser}
                disabled={!newUserId.trim()}
                data-testid={`button-add-user-${flagKey}`}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>

            {/* User chips */}
            {localUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {localUsers.map((userId) => (
                  <Badge
                    key={userId}
                    variant="secondary"
                    className="text-[10px] font-mono gap-1 pr-1"
                  >
                    {userId}
                    <button
                      onClick={() => removeUser(userId)}
                      className="ml-0.5 hover:text-destructive transition-colors"
                      data-testid={`button-remove-user-${flagKey}-${userId}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {localUsers.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                No users whitelisted. Add user IDs or emails above.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
