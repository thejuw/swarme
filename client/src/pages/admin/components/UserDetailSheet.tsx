/**
 * UserDetailSheet — Phase 36: Superadmin CRM deep-dive slide-over panel.
 * Uses Shadcn Sheet + Tabs. Fetches full user profile on open.
 * Tabs: Metrics & Usage, Billing & Plan, Swarm Context, Actions (Danger Zone).
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  BarChart3,
  CreditCard,
  Brain,
  AlertTriangle,
  TrendingUp,
  Eye,
  Zap,
  DollarSign,
  KeyRound,
  UserX,
  LogIn,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type {
  AdminUserDetail,
  AdminUserDetailResponse,
} from "@/lib/api";
import {
  overrideUserPlan,
  updateUserStatus,
  impersonateUser,
  queryKeys,
} from "@/lib/api";

interface UserDetailSheetProps {
  userId: string | null;
  onClose: () => void;
}

function planBadgeColor(plan: string) {
  switch (plan) {
    case "enterprise":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    case "autopilot":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "starter":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "banned":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "suspended":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  }
}

function taskStatusColor(status: string) {
  switch (status) {
    case "Completed":
      return "text-emerald-400";
    case "Running":
      return "text-blue-400";
    case "Failed":
      return "text-red-400";
    case "Awaiting_Approval":
      return "text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

export function UserDetailSheet({ userId, onClose }: UserDetailSheetProps) {
  const { toast } = useToast();
  const { login } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminUserDetail(userId || ""),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/users/${userId}`);
      return res.json() as Promise<AdminUserDetailResponse>;
    },
    enabled: !!userId,
  });

  const planMutation = useMutation({
    mutationFn: (plan_tier: string) => overrideUserPlan(userId!, plan_tier),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers() });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(userId!) });
      toast({ title: "Plan updated", description: `Set to ${data.plan_tier} (limit: ${data.task_limit === -1 ? "unlimited" : data.task_limit})` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update plan.", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateUserStatus(userId!, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers() });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUserDetail(userId!) });
      toast({ title: "Status updated", description: `User is now ${data.status}.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: () => impersonateUser(userId!),
    onSuccess: (data) => {
      // Switch to impersonation session
      login(data.token, data.user);
      onClose();
      toast({ title: "Impersonating", description: `Viewing as ${data.user.email}` });
      // Navigate to dashboard
      window.location.hash = "#/dashboard";
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to impersonate.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
      return res.json() as Promise<{ success: boolean; temporaryPassword?: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "Password reset", description: `Temp: ${data.temporaryPassword}` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset password.", variant: "destructive" });
    },
  });

  const user = data?.user;

  return (
    <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0" data-testid="user-detail-sheet">
        {isLoading || !user ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <SheetTitle className="text-base font-semibold tracking-tight" data-testid="sheet-user-email">
                    {user.email}
                  </SheetTitle>
                  <SheetDescription className="text-xs font-mono text-muted-foreground">
                    {user.id} · Joined {new Date(user.created_at).toLocaleDateString()}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge className={`text-[10px] font-mono uppercase ${planBadgeColor(user.plan_tier)}`}>
                  {user.plan_tier}
                </Badge>
                <Badge className={`text-[10px] font-mono uppercase ${statusBadgeColor(user.status)}`}>
                  {user.status}
                </Badge>
                {user.role === "superadmin" && (
                  <Badge className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border-amber-500/20">
                    superadmin
                  </Badge>
                )}
              </div>
            </SheetHeader>

            {/* Tabs */}
            <Tabs defaultValue="metrics" className="px-6 pt-4">
              <TabsList className="w-full grid grid-cols-4 h-9">
                <TabsTrigger value="metrics" className="text-xs gap-1" data-testid="tab-metrics">
                  <BarChart3 className="h-3 w-3" />
                  Metrics
                </TabsTrigger>
                <TabsTrigger value="billing" className="text-xs gap-1" data-testid="tab-billing">
                  <CreditCard className="h-3 w-3" />
                  Billing
                </TabsTrigger>
                <TabsTrigger value="context" className="text-xs gap-1" data-testid="tab-context">
                  <Brain className="h-3 w-3" />
                  Context
                </TabsTrigger>
                <TabsTrigger value="actions" className="text-xs gap-1" data-testid="tab-actions">
                  <AlertTriangle className="h-3 w-3" />
                  Actions
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Metrics & Usage */}
              <TabsContent value="metrics" className="mt-4 space-y-5">
                {/* KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <DollarSign className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider font-medium">Revenue</span>
                    </div>
                    <p className="text-lg font-semibold font-mono tabular-nums" data-testid="kpi-revenue">
                      ${user.total_revenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider font-medium">Tasks</span>
                    </div>
                    <p className="text-lg font-semibold font-mono tabular-nums" data-testid="kpi-tasks">
                      {user.tasks_used_this_month}
                      <span className="text-xs text-muted-foreground font-normal">
                        /{user.task_limit === -1 ? "∞" : user.task_limit}
                      </span>
                    </p>
                  </div>
                  <div className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      <span className="text-[10px] uppercase tracking-wider font-medium">Clicks</span>
                    </div>
                    <p className="text-lg font-semibold font-mono tabular-nums" data-testid="kpi-clicks">
                      {user.gsc_summary.total_clicks.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Mini GSC chart */}
                {user.gsc_summary.mini_series.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-3">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">GSC Traffic (7 days)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                      <AreaChart data={user.gsc_summary.mini_series}>
                        <defs>
                          <linearGradient id="gscFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v: string) => v.split("-").slice(1).join("/")}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{ fontSize: 11, background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                          labelFormatter={(v: string) => v}
                        />
                        <Area
                          type="monotone"
                          dataKey="clicks"
                          stroke="hsl(var(--primary))"
                          fill="url(#gscFill)"
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent tasks */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recent Agent Tasks
                  </h4>
                  {user.recent_tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks recorded.</p>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-[240px] overflow-y-auto">
                      {user.recent_tasks.map((t) => (
                        <div key={t.id} className="px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                              {t.agent_type}
                            </Badge>
                            <span className="text-xs truncate">{t.task_description}</span>
                          </div>
                          <span className={`text-[10px] font-mono shrink-0 ${taskStatusColor(t.status)}`}>
                            {t.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Tab 2: Billing & Plan */}
              <TabsContent value="billing" className="mt-4 space-y-5">
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Manual Plan Override
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Override Stripe subscription. Changes take effect immediately and update task limits.
                  </p>
                  <div className="flex items-center gap-3">
                    <Select
                      value={selectedPlan || user.plan_tier}
                      onValueChange={setSelectedPlan}
                    >
                      <SelectTrigger className="w-[180px] h-9 text-sm" data-testid="select-plan">
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free (10 tasks)</SelectItem>
                        <SelectItem value="starter">Starter (100 tasks)</SelectItem>
                        <SelectItem value="autopilot">Autopilot (500 tasks)</SelectItem>
                        <SelectItem value="enterprise">Enterprise (Unlimited)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!selectedPlan || selectedPlan === user.plan_tier || planMutation.isPending}
                      onClick={() => selectedPlan && planMutation.mutate(selectedPlan)}
                      data-testid="button-save-plan"
                    >
                      {planMutation.isPending ? "Saving..." : "Save Plan Override"}
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Current Billing Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-mono capitalize">{user.plan_tier}</span>
                    <span className="text-muted-foreground">Task Limit</span>
                    <span className="font-mono">{user.task_limit === -1 ? "Unlimited" : user.task_limit}</span>
                    <span className="text-muted-foreground">Tasks Used (Month)</span>
                    <span className="font-mono">{user.tasks_used_this_month}</span>
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-mono">${user.total_revenue.toLocaleString()}</span>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Swarm Context */}
              <TabsContent value="context" className="mt-4 space-y-4">
                {user.brand_context ? (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Brand Context (Read-Only)
                    </h4>
                    <div className="space-y-3">
                      {[
                        { label: "Target Audience", value: user.brand_context.target_audience },
                        { label: "Core Goals", value: user.brand_context.core_goals },
                        { label: "Tone of Voice", value: user.brand_context.tone_of_voice },
                        { label: "Competitors", value: user.brand_context.competitors },
                      ].map((item) => (
                        <div key={item.label}>
                          <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground block mb-1">
                            {item.label}
                          </span>
                          <p className="text-sm bg-muted/30 rounded-md px-3 py-2">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Brain className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No Brand Context configured for this user.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The AI Manager has not onboarded this account yet.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Tab 4: Actions (Danger Zone) */}
              <TabsContent value="actions" className="mt-4 space-y-4 pb-6">
                <div className="border border-destructive/30 rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h4 className="text-sm font-semibold text-destructive">Danger Zone</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    These actions are logged to the Admin Audit Log and may be irreversible.
                  </p>

                  {/* Reset Password */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        data-testid="button-reset-password"
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-2" />
                        Send Password Reset Email
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset Password</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will generate a temporary password and invalidate the current one.
                          The user will need to log in with the temporary password.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => resetMutation.mutate()}
                          data-testid="confirm-reset-password"
                        >
                          Reset Password
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Impersonate */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        data-testid="button-impersonate"
                      >
                        <LogIn className="h-3.5 w-3.5 mr-2" />
                        Impersonate User
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Impersonate User</AlertDialogTitle>
                        <AlertDialogDescription>
                          You'll view the platform as <strong>{user.email}</strong> with a 1-hour
                          session. An impersonation banner will be visible at all times.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => impersonateMutation.mutate()}
                          data-testid="confirm-impersonate"
                        >
                          Start Impersonation
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Ban / Suspend */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full justify-start"
                        data-testid="button-ban-user"
                      >
                        <UserX className="h-3.5 w-3.5 mr-2" />
                        {user.status === "banned" ? "Reactivate Account" : "Ban / Suspend Account"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {user.status === "banned" ? "Reactivate Account" : "Ban Account"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {user.status === "banned"
                            ? `This will reactivate ${user.email}'s account and restore their access.`
                            : `This will ban ${user.email} and immediately invalidate all their active sessions. The user will lose access to the platform.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className={user.status !== "banned" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                          onClick={() =>
                            statusMutation.mutate(user.status === "banned" ? "active" : "banned")
                          }
                          data-testid="confirm-ban-user"
                        >
                          {user.status === "banned" ? "Reactivate" : "Ban User"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
