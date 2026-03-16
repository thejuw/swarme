/**
 * Audit Log Tab — Phase 31.5 Task 3
 *
 * Standalone DataTable for Admin_Audit_Log with enhanced columns:
 * Timestamp, Admin Email, Action Taken, Target ID, Details.
 * Includes search + CSV export from the Phase 31 DataTable.
 */

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataColumn } from "@/components/admin/data-table";
import { ScrollText, UserCog } from "lucide-react";

interface AuditEntry {
  id: string;
  admin_id: string;
  admin_email?: string;
  action: string;
  target: string;
  metadata: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  "settings.update": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "user.suspend": "bg-red-500/10 text-red-400 border-red-500/20",
  "user.delete": "bg-red-500/10 text-red-400 border-red-500/20",
  "cms.publish": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "cms.create": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "cms.delete": "bg-red-500/10 text-red-400 border-red-500/20",
  "maintenance.toggle": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "webhooks.update": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "security.ip_block": "bg-red-500/10 text-red-400 border-red-500/20",
  "newsletter.send": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "flags.update": "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

/** Humanize action strings: "settings.update" → "Updated Settings" */
function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    "settings.update": "Updated Settings",
    "user.suspend": "Suspended User",
    "user.delete": "Deleted User",
    "cms.publish": "Published Content",
    "cms.create": "Created Content",
    "cms.delete": "Deleted Content",
    "maintenance.toggle": "Toggled Maintenance",
    "webhooks.update": "Updated Webhooks",
    "security.ip_block": "Blocked IP",
    "newsletter.send": "Sent Newsletter",
    "flags.update": "Updated Feature Flag",
  };
  return map[action] || action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditLogTab() {
  const auditQuery = useQuery<{ success: boolean; entries: AuditEntry[] }>({
    queryKey: ["/api/admin/audit-log"],
  });
  const entries = auditQuery.data?.entries || [];

  const columns: DataColumn<AuditEntry>[] = [
    {
      key: "created_at",
      label: "Timestamp",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
          {new Date(row.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "admin_email",
      label: "Admin Email",
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <UserCog className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs">{row.admin_email || row.admin_id}</span>
        </div>
      ),
    },
    {
      key: "action",
      label: "Action Taken",
      render: (row) => {
        const colorClass = ACTION_COLORS[row.action] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
        return (
          <div className="flex flex-col gap-0.5">
            <Badge className={`text-[10px] w-fit ${colorClass}`}>
              {humanizeAction(row.action)}
            </Badge>
            <code className="text-[9px] text-muted-foreground">{row.action}</code>
          </div>
        );
      },
    },
    {
      key: "target",
      label: "Target ID",
      render: (row) => <code className="text-[11px] font-mono">{row.target}</code>,
    },
    {
      key: "metadata",
      label: "Details",
      render: (row) => {
        if (!row.metadata) return <span className="text-muted-foreground">—</span>;
        try {
          const parsed = JSON.parse(row.metadata);
          // Show a concise summary
          const keys = Object.keys(parsed);
          const preview = keys.length <= 2
            ? keys.map((k) => `${k}: ${JSON.stringify(parsed[k])}`).join(", ")
            : `${keys.length} fields modified`;
          return (
            <code className="text-[10px] text-muted-foreground truncate block max-w-[220px]" title={row.metadata}>
              {preview.length > 60 ? preview.slice(0, 57) + "..." : preview}
            </code>
          );
        } catch {
          return <code className="text-[10px] text-muted-foreground">{row.metadata}</code>;
        }
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          Admin Audit Log
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Immutable record of all superadmin actions. {entries.length} entries total.
        </p>
      </div>

      <DataTable
        data={entries}
        columns={columns}
        exportFilename="admin-audit-log"
        searchPlaceholder="Search by admin, action, target..."
        pageSize={15}
      />
    </div>
  );
}
