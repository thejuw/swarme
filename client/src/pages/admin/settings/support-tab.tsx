/**
 * Support Center Tab — Phase 31.3f
 *
 * Support tickets DataTable with status/priority management + webhook config.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type DataColumn } from "@/components/admin/data-table";
import { useToast } from "@/hooks/use-toast";
import { Save, Webhook, MessageSquare, AlertCircle } from "lucide-react";

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  closed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export function SupportTab() {
  const { toast } = useToast();

  // ── Tickets ──
  const ticketsQuery = useQuery<{ success: boolean; tickets: Ticket[] }>({
    queryKey: ["/api/admin/support/tickets"],
  });
  const tickets = ticketsQuery.data?.tickets || [];

  const updateTicket = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; priority?: string; assigned_to?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/support/tickets/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update ticket.", variant: "destructive" });
    },
  });

  // ── Webhooks ──
  const webhooksQuery = useQuery<{ success: boolean; webhooks: { discord_url: string; telegram_url: string } }>({
    queryKey: ["/api/admin/support/webhooks"],
  });
  const webhooks = webhooksQuery.data?.webhooks || { discord_url: "", telegram_url: "" };
  const [localWebhooks, setLocalWebhooks] = useState<Record<string, string>>({});
  const mergedWebhooks = { ...webhooks, ...localWebhooks };

  const saveWebhooks = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/support/webhooks", mergedWebhooks);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/webhooks"] });
      setLocalWebhooks({});
      toast({ title: "Webhooks saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save webhooks.", variant: "destructive" });
    },
  });

  const ticketColumns: DataColumn<Ticket>[] = [
    {
      key: "priority",
      label: "Priority",
      render: (row) => (
        <Badge className={`text-[10px] capitalize ${PRIORITY_COLORS[row.priority] || ""}`}>
          {row.priority}
        </Badge>
      ),
    },
    {
      key: "subject",
      label: "Subject",
      render: (row) => (
        <div>
          <p className="font-medium text-xs">{row.subject}</p>
          <p className="text-[10px] text-muted-foreground truncate max-w-[250px]">{row.message}</p>
        </div>
      ),
    },
    {
      key: "user_id",
      label: "User",
      render: (row) => <code className="text-[10px]">{row.user_id}</code>,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <Select
          value={row.status}
          onValueChange={(v) => updateTicket.mutate({ id: row.id, status: v })}
        >
          <SelectTrigger className="h-7 text-[10px] w-[110px] border-0 bg-transparent p-0" data-testid={`select-ticket-status-${row.id}`}>
            <Badge className={`text-[10px] ${STATUS_COLORS[row.status] || ""}`}>
              {row.status.replace("_", " ")}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "created_at",
      label: "Created",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Tickets ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Support Tickets</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tickets.filter((t) => t.status === "open").length} open,{" "}
              {tickets.filter((t) => t.status === "in_progress").length} in progress
            </p>
          </div>
        </div>
        <DataTable
          data={tickets}
          columns={ticketColumns}
          exportFilename="support-tickets"
          searchPlaceholder="Search tickets..."
          pageSize={10}
        />
      </section>

      {/* ── Webhook Config ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold">Alert Webhooks</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Get notified on new or critical tickets</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => saveWebhooks.mutate()}
            disabled={saveWebhooks.isPending || Object.keys(localWebhooks).length === 0}
            data-testid="button-save-webhooks"
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 max-w-lg">
          <div className="space-y-1.5">
            <Label className="text-xs">Discord Webhook URL</Label>
            <Input
              value={mergedWebhooks.discord_url || ""}
              onChange={(e) => setLocalWebhooks((p) => ({ ...p, discord_url: e.target.value }))}
              placeholder="https://discord.com/api/webhooks/..."
              className="h-8 text-xs font-mono"
              data-testid="input-webhook-discord"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Telegram Bot Webhook URL</Label>
            <Input
              value={mergedWebhooks.telegram_url || ""}
              onChange={(e) => setLocalWebhooks((p) => ({ ...p, telegram_url: e.target.value }))}
              placeholder="https://api.telegram.org/bot..."
              className="h-8 text-xs font-mono"
              data-testid="input-webhook-telegram"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
