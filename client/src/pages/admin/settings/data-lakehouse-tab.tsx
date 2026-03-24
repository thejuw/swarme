/**
 * Data Lakehouse Tab — Phase 67
 *
 * Admin settings tab for the Edge-Native Data Lakehouse.
 * Sections:
 *   1. Lakehouse Overview — stats, health, last export
 *   2. Registered Tables — list of data tables with schema info
 *   3. Export Configuration — retention, format, cron status
 *   4. Enterprise Buyers — manage buyer access tokens
 *   5. Recent Snapshots — latest export batches
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Database,
  Table2,
  FileDown,
  Users,
  RefreshCw,
  ShieldCheck,
  Clock,
  HardDrive,
  FileText,
  Layers,
  UserPlus,
  Ban,
  Copy,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// ── Types ────────────────────────────────────────────────────

interface LakehouseStats {
  tables: number;
  total_rows: number;
  total_bytes: number;
  total_size_human: string;
  snapshots: number;
  files: number;
  last_24h_exports: number;
  last_24h_rows: number;
}

interface DataTable {
  id: string;
  name: string;
  description: string;
  format: string;
  total_rows: number;
  total_bytes: number;
  size_human: string;
  retention_days: number;
  created_at: string;
  updated_at: string;
}

interface Snapshot {
  id: string;
  row_count: number;
  file_count: number;
  byte_size: number;
  size_human: string;
  created_at: string;
}

interface Buyer {
  id: string;
  name: string;
  email: string;
  allowed_tables: string[];
  status: string;
  created_at: string;
  expires_at: string;
}

// ── Component ────────────────────────────────────────────────

export function DataLakehouseTab() {
  const [newBuyerName, setNewBuyerName] = useState("");
  const [newBuyerEmail, setNewBuyerEmail] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Queries
  const statsQuery = useQuery<{ success: boolean; stats: LakehouseStats }>({
    queryKey: ["/api/admin/catalog/stats"],
  });

  const tablesQuery = useQuery<{ success: boolean; tables: DataTable[] }>({
    queryKey: ["/api/admin/catalog/tables"],
  });

  const buyersQuery = useQuery<{ success: boolean; buyers: Buyer[] }>({
    queryKey: ["/api/admin/lakehouse/buyers"],
  });

  const snapshotsQuery = useQuery<{ success: boolean; snapshots: Snapshot[] }>({
    queryKey: ["/api/admin/catalog/snapshots/swarme_events"],
  });

  const stats = statsQuery.data?.stats;
  const tables = tablesQuery.data?.tables || [];
  const buyers = buyersQuery.data?.buyers || [];
  const snapshots = snapshotsQuery.data?.snapshots || [];

  // Mutations
  const createBuyerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/lakehouse/buyers", {
        name: newBuyerName,
        email: newBuyerEmail,
        allowed_tables: ["swarme_events"],
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lakehouse/buyers"] });
      setNewBuyerName("");
      setNewBuyerEmail("");
      if (data.token?.token) {
        setCopiedToken(data.token.token);
        navigator.clipboard?.writeText(data.token.token).catch(() => {});
      }
    },
  });

  const revokeBuyerMutation = useMutation({
    mutationFn: async (buyerId: string) => {
      const res = await apiRequest("POST", `/api/admin/lakehouse/buyers/${buyerId}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lakehouse/buyers"] });
    },
  });

  return (
    <div className="space-y-8" data-testid="data-lakehouse-tab">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Lakehouse
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edge-native analytics storage. Events flow through Analytics Engine,
          get exported hourly to R2 in Hive-partitioned JSONL, and are cataloged
          in D1 for zero-ETL sharing.
        </p>
      </div>

      <Separator />

      {/* ── Section 1: Overview Stats ─────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Lakehouse Overview
        </h3>
        {statsQuery.isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3 animate-pulse h-16" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Table2} label="Tables" value={String(stats.tables)} />
            <StatCard icon={HardDrive} label="Total Size" value={stats.total_size_human} />
            <StatCard icon={FileText} label="Total Files" value={formatNumber(stats.files)} />
            <StatCard icon={Layers} label="Total Rows" value={formatNumber(stats.total_rows)} />
            <StatCard icon={Clock} label="24h Exports" value={String(stats.last_24h_exports)} />
            <StatCard icon={FileDown} label="24h Rows" value={formatNumber(stats.last_24h_rows)} />
            <StatCard icon={Database} label="Snapshots" value={formatNumber(stats.snapshots)} />
            <StatCard
              icon={CheckCircle2}
              label="Pipeline"
              value={stats.last_24h_exports > 0 ? "Active" : "Idle"}
              variant={stats.last_24h_exports > 0 ? "success" : "muted"}
            />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground bg-muted/20 rounded-lg p-4">
            <AlertTriangle className="h-4 w-4 inline mr-1.5" />
            Lakehouse tables not yet initialized. The first hourly export will seed the catalog.
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 2: Registered Tables ──────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Table2 className="h-4 w-4 text-muted-foreground" />
          Registered Tables
        </h3>
        {tables.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tables registered yet.</p>
        ) : (
          <div className="space-y-2">
            {tables.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-muted/20 rounded-lg px-4 py-3 border border-border/30"
                data-testid={`table-row-${t.name}`}
              >
                <div className="flex items-center gap-3">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{formatNumber(t.total_rows)} rows</span>
                  <span>{t.size_human}</span>
                  <Badge variant="outline" className="text-[10px]">{t.format.toUpperCase()}</Badge>
                  <span>{t.retention_days}d retention</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 3: Export Configuration ────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          Export Configuration
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <ConfigRow label="Export Schedule" value="Hourly (0 * * * *)" />
          <ConfigRow label="Output Format" value="JSONL (Newline-Delimited JSON)" />
          <ConfigRow label="Partition Strategy" value="Hive: year/month/day/hour" />
          <ConfigRow label="R2 Prefix" value="lakehouse/events/" />
          <ConfigRow label="Analytics Engine Dataset" value="swarme_analytics" />
          <ConfigRow label="R2 Bucket" value="MEDIA_BUCKET (shared)" />
          <ConfigRow label="Catalog Backend" value="D1 (Iceberg-ready abstraction)" />
          <ConfigRow label="PII Handling" value="SHA-256 hashed (first 16 hex)" />
        </div>
      </div>

      <Separator />

      {/* ── Section 4: Enterprise Buyers ──────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Enterprise Data Buyers
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Provision scoped access tokens for enterprise partners to consume lakehouse data.
          Tokens are HMAC-signed, prefix-scoped, and time-limited.
        </p>

        {/* Add buyer form */}
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground mb-1 block">Name</label>
            <Input
              placeholder="Buyer name"
              value={newBuyerName}
              onChange={(e) => setNewBuyerName(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-buyer-name"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground mb-1 block">Email</label>
            <Input
              placeholder="buyer@enterprise.com"
              value={newBuyerEmail}
              onChange={(e) => setNewBuyerEmail(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-buyer-email"
            />
          </div>
          <Button
            size="sm"
            onClick={() => createBuyerMutation.mutate()}
            disabled={!newBuyerName || !newBuyerEmail || createBuyerMutation.isPending}
            data-testid="button-add-buyer"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            {createBuyerMutation.isPending ? "Creating..." : "Add Buyer"}
          </Button>
        </div>

        {/* Token copy feedback */}
        {copiedToken && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-3">
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Access token copied to clipboard. Share securely with the buyer.
            </p>
            <code className="text-[10px] text-muted-foreground block mt-1 break-all">
              {copiedToken.slice(0, 40)}...
            </code>
          </div>
        )}

        {/* Buyer list */}
        {buyers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No buyers provisioned yet.</p>
        ) : (
          <div className="space-y-2">
            {buyers.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between bg-muted/20 rounded-lg px-4 py-2.5 border border-border/30"
                data-testid={`buyer-row-${b.id}`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-[11px] text-muted-foreground">{b.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={b.status === "active" ? "default" : "destructive"}
                    className="text-[10px]"
                  >
                    {b.status}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Expires {new Date(b.expires_at).toLocaleDateString()}
                  </span>
                  {b.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeBuyerMutation.mutate(b.id)}
                      disabled={revokeBuyerMutation.isPending}
                      className="h-7 text-destructive hover:text-destructive"
                      data-testid={`button-revoke-${b.id}`}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 5: Recent Snapshots ───────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Recent Export Snapshots
        </h3>
        {snapshotsQuery.isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3 animate-pulse h-10" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No snapshots yet. First export runs on the hour.</p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-muted/10 rounded px-3 py-2 text-xs"
                data-testid={`snapshot-${s.id}`}
              >
                <span className="font-mono text-muted-foreground">{s.id.slice(0, 8)}</span>
                <span>{formatNumber(s.row_count)} rows</span>
                <span>{s.size_human}</span>
                <span className="text-muted-foreground">
                  {new Date(s.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: typeof Database;
  label: string;
  value: string;
  variant?: "default" | "success" | "muted";
}) {
  const colorMap = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className="bg-muted/20 rounded-lg px-3 py-2.5 border border-border/30">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${colorMap[variant]}`}>{value}</p>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/10 rounded px-3 py-2 border border-border/20">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
