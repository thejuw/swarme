/**
 * ============================================================
 * NetworkAlert — Phase 65.5: Global Intelligence Governance UI
 * ============================================================
 *
 * High-visibility action cards shown when the Hive Mind network
 * promotes new verified rules. Each card requires explicit human
 * approval before the rule can influence the tenant's AI Manager.
 *
 * Placement: Admin Overview dashboard (superadmin panel).
 * Also usable on the user-facing Settings page for domain admins.
 * ============================================================
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Globe,
  CheckCircle2,
  XCircle,
  Sparkles,
  Shield,
  TrendingUp,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────

interface GlobalRule {
  id: string;
  rule: string;
  category: string;
  confidence: number;
  supporters: number;
  promoted_at: string;
  approval_status?: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

interface GovernanceResponse {
  success: boolean;
  rules: GlobalRule[];
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
}

// ── Component ───────────────────────────────────────────────

export function NetworkAlert() {
  const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
  } = useQuery<GovernanceResponse>({
    queryKey: ["/api/governance/rules"],
    refetchInterval: 60_000, // Refresh every 60 seconds
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      ruleId,
      action,
    }: {
      ruleId: string;
      action: "approved" | "rejected";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/governance/rules/${ruleId}`,
        { action },
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/rules"] });
      toast({
        title:
          variables.action === "approved"
            ? "Rule approved"
            : "Rule dismissed",
        description:
          variables.action === "approved"
            ? "This rule will now be included in your AI Manager's knowledge base."
            : "This rule has been dismissed and will not affect your AI strategy.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update rule",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="border-dashed" data-testid="network-alert-loading">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success) return null;

  const pendingRules = data.rules.filter(
    (r) => r.approval_status === "pending",
  );
  const approvedRules = data.rules.filter(
    (r) => r.approval_status === "approved",
  );
  const rejectedRules = data.rules.filter(
    (r) => r.approval_status === "rejected",
  );

  // Nothing to show if no rules exist
  if (data.rules.length === 0) return null;

  return (
    <div className="space-y-4" data-testid="network-alert-panel">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-500/10">
            <Globe className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Network Intelligence
            </h3>
            <p className="text-xs text-muted-foreground">
              Verified rules from {data.counts.total > 0 ? "the" : "across the"} Swarme network
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingRules.length > 0 && (
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] font-mono"
              data-testid="badge-pending-count"
            >
              {pendingRules.length} pending review
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-zinc-700 text-zinc-500"
            data-testid="badge-total-count"
          >
            {data.counts.approved} active / {data.counts.total} total
          </Badge>
        </div>
      </div>

      {/* Pending Rules — Action Cards */}
      {pendingRules.length > 0 && (
        <div className="space-y-3">
          {pendingRules.map((rule) => (
            <Card
              key={rule.id}
              className="border-amber-500/20 bg-amber-500/[0.03] overflow-hidden"
              data-testid={`rule-card-pending-${rule.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono bg-violet-500/10 text-violet-400 border-violet-500/20"
                      >
                        {rule.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Confidence: {rule.confidence}/100
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="text-foreground font-medium">
                        Global Intelligence Alert:
                      </span>{" "}
                      Across {rule.supporters}+ independent enterprise domains,
                      the Swarme network has verified that{" "}
                      <span className="text-foreground font-medium">
                        {rule.rule}
                      </span>{" "}
                      Implementing this structural change correlates with
                      measurable improvements in AI search visibility.
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() =>
                          reviewMutation.mutate({
                            ruleId: rule.id,
                            action: "approved",
                          })
                        }
                        disabled={reviewMutation.isPending}
                        data-testid={`button-approve-${rule.id}`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Approve & Add to Brand Guidelines
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          reviewMutation.mutate({
                            ruleId: rule.id,
                            action: "rejected",
                          })
                        }
                        disabled={reviewMutation.isPending}
                        data-testid={`button-dismiss-${rule.id}`}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approved Rules — Compact List */}
      {approvedRules.length > 0 && (
        <Card data-testid="approved-rules-card">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-emerald-400" />
              Active Global Rules ({approvedRules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {approvedRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0"
                data-testid={`rule-approved-${rule.id}`}
              >
                <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="text-xs text-foreground flex-1 truncate">
                  {rule.rule}
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono border-zinc-700 text-zinc-500 shrink-0"
                >
                  {rule.confidence}/100
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rejected Rules — Collapsed Count */}
      {rejectedRules.length > 0 && (
        <p
          className="text-[10px] text-muted-foreground pl-1"
          data-testid="rejected-count"
        >
          {rejectedRules.length} rule{rejectedRules.length !== 1 ? "s" : ""}{" "}
          dismissed
        </p>
      )}
    </div>
  );
}
