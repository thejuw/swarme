/**
 * Financial Ledger Tab — Phase 31.3g
 *
 * Stripe transaction history DataTable with summary KPIs.
 */

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataColumn } from "@/components/admin/data-table";
import { DollarSign, TrendingUp, CreditCard, ArrowDownLeft } from "lucide-react";

interface Transaction {
  id: string;
  user_id: string;
  email: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  stripe_id: string;
  created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  subscription: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  one_time: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  refund: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export function FinancialTab() {
  const txnQuery = useQuery<{ success: boolean; total_revenue: number; transactions: Transaction[] }>({
    queryKey: ["/api/admin/finance/transactions"],
  });
  const transactions = txnQuery.data?.transactions || [];
  const totalRevenue = txnQuery.data?.total_revenue || 0;

  // Derived KPIs
  const successfulSubs = transactions.filter((t) => t.type === "subscription" && t.status === "succeeded");
  const mrr = successfulSubs.length > 0 ? successfulSubs[successfulSubs.length - 1].amount * (new Set(successfulSubs.map((t) => t.user_id))).size : 0;
  const refunds = transactions.filter((t) => t.type === "refund").reduce((s, t) => s + Math.abs(t.amount), 0);
  const failedPayments = transactions.filter((t) => t.status === "failed").length;

  const kpis = [
    { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, accent: "text-emerald-400" },
    { label: "Active MRR (est.)", value: `$${mrr.toFixed(2)}`, icon: TrendingUp, accent: "text-blue-400" },
    { label: "Total Refunds", value: `$${refunds.toFixed(2)}`, icon: ArrowDownLeft, accent: "text-red-400" },
    { label: "Failed Payments", value: String(failedPayments), icon: CreditCard, accent: "text-amber-400" },
  ];

  const txnColumns: DataColumn<Transaction>[] = [
    {
      key: "created_at",
      label: "Date",
      render: (row) => (
        <span className="text-[11px] text-muted-foreground font-mono">
          {new Date(row.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "email",
      label: "Customer",
      render: (row) => (
        <div>
          <p className="text-xs">{row.email}</p>
          <code className="text-[10px] text-muted-foreground">{row.user_id}</code>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (row) => (
        <Badge className={`text-[10px] capitalize ${TYPE_COLORS[row.type] || ""}`}>
          {row.type.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "plan",
      label: "Plan",
      render: (row) => (
        <Badge variant="secondary" className="text-[10px] capitalize">
          {row.plan.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (row) => (
        <span className={`text-xs font-mono font-medium ${row.amount < 0 ? "text-red-400" : ""}`}>
          {row.amount < 0 ? "−" : ""}${Math.abs(row.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <Badge className={`text-[10px] capitalize ${STATUS_COLORS[row.status] || ""}`}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "stripe_id",
      label: "Stripe ID",
      render: (row) => <code className="text-[10px] text-muted-foreground">{row.stripe_id}</code>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-muted/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.accent}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
              </div>
              <p className="text-lg font-semibold font-mono tracking-tight">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Transactions Table ── */}
      <DataTable
        data={transactions}
        columns={txnColumns}
        title="Transaction History"
        exportFilename="stripe-transactions"
        searchPlaceholder="Search by email, plan, stripe ID..."
        pageSize={10}
      />
    </div>
  );
}
