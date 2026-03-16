/**
 * AdminUsers — Phase 36: CRM DataTable with row-click deep-dive sheet,
 * Create User modal, and actions dropdown.
 * Upgrades Phase 21 CRM with user override controls.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MoreHorizontal,
  Eye,
  KeyRound,
  Ban,
  Copy,
  Check,
  UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserDetailSheet } from "./components/UserDetailSheet";
import type { AdminUser } from "@/lib/api";
import { provisionUser, queryKeys } from "@/lib/api";

/** Estimate MRR from plan */
function planMRR(plan: string): string {
  switch (plan) {
    case "enterprise": return "$299";
    case "autopilot": return "$79";
    case "starter": return "$29";
    default: return "$0";
  }
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

function statusVariant(status: string) {
  switch (status) {
    case "active": return "default" as const;
    case "suspended": return "destructive" as const;
    case "banned": return "destructive" as const;
    default: return "secondary" as const;
  }
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("starter");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminUsers(),
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json() as Promise<{ success: boolean; users: AdminUser[] }>;
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
      return res.json() as Promise<{ success: boolean; temporaryPassword?: string }>;
    },
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        setTempPassword(data.temporaryPassword);
      }
      toast({ title: "Password reset", description: "Temporary password generated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset password.", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers() });
      toast({ title: "Access revoked", description: "User has been suspended." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to revoke access.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => provisionUser(newEmail, newName, newPlan),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers() });
      setShowCreateModal(false);
      setNewEmail("");
      setNewName("");
      setNewPlan("starter");
      setTempPassword(data.temporary_password);
      toast({ title: "User created", description: `Account provisioned for ${newEmail}` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create user.", variant: "destructive" });
    },
  });

  const users = data?.users || [];

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-users-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">CRM / Users</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage platform users, plans, and access controls.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreateModal(true)}
          data-testid="button-create-user"
        >
          <UserPlus className="h-3.5 w-3.5 mr-2" />
          Create New User
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wider font-medium">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-medium">Plan</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-medium">MRR</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-medium">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-medium w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedUserId(u.id)}
                  data-testid={`user-row-${u.id}`}
                >
                  <TableCell className="font-mono text-sm">{u.email}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] font-mono capitalize ${planBadgeColor(u.plan)}`}>
                      {u.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{planMRR(u.plan)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(u.status)} className="text-xs capitalize">
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`actions-${u.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setSelectedUserId(u.id); }}
                          data-testid={`view-${u.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); resetMutation.mutate(u.id); }}
                          data-testid={`reset-${u.id}`}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); revokeMutation.mutate(u.id); }}
                          data-testid={`revoke-${u.id}`}
                        >
                          <Ban className="h-3.5 w-3.5 mr-2" />
                          Revoke Access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Phase 36: User Detail Sheet — slide-over panel */}
      <UserDetailSheet
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Provision New User</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Manually create an account bypassing Stripe. A temporary password will be generated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-email" className="text-xs">Email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name" className="text-xs">Name (optional)</Label>
              <Input
                id="new-name"
                placeholder="Jane Doe"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-new-name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Plan Tier</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-new-plan">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="autopilot">Autopilot</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!newEmail || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp Password Dialog */}
      <Dialog open={!!tempPassword} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Temporary Password</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Share this securely with the user. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
              <code className="text-sm font-mono flex-1 select-all" data-testid="temp-password">
                {tempPassword}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => handleCopy(tempPassword)}
                data-testid="copy-password"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
