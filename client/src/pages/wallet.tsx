/**
 * ============================================================
 * Phase 51: Media Wallet — Prepaid Ledger UI
 * ============================================================
 *
 * Displays:
 *   - Current balance (large typography)
 *   - Quick top-up buttons ($50, $100, $250, custom)
 *   - Auto-recharge toggle + threshold/amount inputs
 *   - Transaction history table with CSV export
 * ============================================================
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  getWalletData,
  topUpWallet,
  updateWalletSettings,
  queryKeys,
  type WalletData,
  type WalletTransactionEntry,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
  RefreshCw,
  Loader2,
  Zap,
  Shield,
  DollarSign,
} from "lucide-react";

const PROJECT_ID = "proj_001";

// ── Helpers ──────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Balance Banner ───────────────────────────────────────────

function BalanceBanner({ balance_cents }: { balance_cents: number }) {
  const isLow = balance_cents < 5000;
  const isEmpty = balance_cents <= 0;

  return (
    <Card
      className={`relative overflow-hidden ${
        isEmpty
          ? "border-red-500/30 bg-red-500/5"
          : isLow
            ? "border-amber-400/30 bg-amber-400/5"
            : "border-emerald-400/20 bg-emerald-400/5"
      }`}
      data-testid="wallet-balance-card"
    >
      {/* Gradient top bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isEmpty
            ? "bg-gradient-to-r from-red-500 to-red-600"
            : isLow
              ? "bg-gradient-to-r from-amber-400 to-orange-500"
              : "bg-gradient-to-r from-emerald-400 to-teal-500"
        }`}
      />

      <CardContent className="pt-8 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              isEmpty
                ? "bg-red-500/15"
                : isLow
                  ? "bg-amber-400/15"
                  : "bg-emerald-400/15"
            }`}
          >
            <WalletIcon
              className={`h-5 w-5 ${
                isEmpty
                  ? "text-red-400"
                  : isLow
                    ? "text-amber-400"
                    : "text-emerald-400"
              }`}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Available Balance
            </p>
            <p
              className="text-3xl font-bold tracking-tight"
              data-testid="text-wallet-balance"
            >
              {formatCents(balance_cents)}
            </p>
          </div>
        </div>

        {isEmpty && (
          <p className="text-xs text-red-400 mt-2">
            Your wallet is empty. Add funds to enable autonomous agent actions.
          </p>
        )}
        {isLow && !isEmpty && (
          <p className="text-xs text-amber-400 mt-2">
            Balance is running low. Consider enabling auto-recharge.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quick Top-Up ─────────────────────────────────────────────

function QuickTopUp({ onTopUp, isPending }: { onTopUp: (cents: number) => void; isPending: boolean }) {
  const [customAmount, setCustomAmount] = useState("");
  const presets = [5000, 10000, 25000];

  return (
    <Card data-testid="wallet-topup-card">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-400" />
          Add Funds
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-4">
        {/* Preset amounts */}
        <div className="flex gap-2">
          {presets.map((cents) => (
            <Button
              key={cents}
              variant="outline"
              size="sm"
              className="flex-1 h-10 text-sm font-mono"
              onClick={() => onTopUp(cents)}
              disabled={isPending}
              data-testid={`button-topup-${cents}`}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                formatCents(cents)
              )}
            </Button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              min="5"
              step="1"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="pl-8 h-10 text-sm font-mono"
              data-testid="input-custom-topup"
            />
          </div>
          <Button
            size="sm"
            className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => {
              const dollars = parseFloat(customAmount);
              if (dollars >= 5) {
                onTopUp(Math.round(dollars * 100));
                setCustomAmount("");
              }
            }}
            disabled={isPending || !customAmount || parseFloat(customAmount) < 5}
            data-testid="button-topup-custom"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Minimum $5.00. Payments processed securely via Stripe.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Auto-Recharge Settings ───────────────────────────────────

function AutoRechargeSettings({
  wallet,
  onSave,
  isSaving,
}: {
  wallet: WalletData;
  onSave: (settings: {
    auto_recharge_enabled: boolean;
    recharge_threshold_cents: number;
    recharge_amount_cents: number;
  }) => void;
  isSaving: boolean;
}) {
  const [enabled, setEnabled] = useState(wallet.auto_recharge_enabled);
  const [threshold, setThreshold] = useState(
    (wallet.recharge_threshold_cents / 100).toString()
  );
  const [amount, setAmount] = useState(
    (wallet.recharge_amount_cents / 100).toString()
  );

  const handleSave = () => {
    onSave({
      auto_recharge_enabled: enabled,
      recharge_threshold_cents: Math.round(parseFloat(threshold || "50") * 100),
      recharge_amount_cents: Math.round(parseFloat(amount || "250") * 100),
    });
  };

  return (
    <Card data-testid="wallet-autorecharge-card">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          Auto-Recharge
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable auto-recharge</Label>
            <p className="text-[11px] text-muted-foreground">
              Automatically top up when balance falls below threshold
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="switch-auto-recharge"
          />
        </div>

        {enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Recharge when below
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min="10"
                    step="10"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="pl-8 h-9 text-sm font-mono"
                    data-testid="input-recharge-threshold"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Recharge amount
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min="25"
                    step="25"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-8 h-9 text-sm font-mono"
                    data-testid="input-recharge-amount"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-400/5 border border-amber-400/15">
              <Shield className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-300">
                When balance drops below {formatCents(Math.round(parseFloat(threshold || "0") * 100))},
                we will charge {formatCents(Math.round(parseFloat(amount || "0") * 100))} to your
                saved payment method.
              </p>
            </div>
          </>
        )}

        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={handleSave}
          disabled={isSaving}
          data-testid="button-save-recharge"
        >
          {isSaving ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1.5" />
          )}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Transaction History ──────────────────────────────────────

function TransactionHistory({
  transactions,
}: {
  transactions: WalletTransactionEntry[];
}) {
  const exportCSV = () => {
    const headers = ["Date", "Description", "Amount", "Reference ID"];
    const rows = transactions.map((t) => [
      new Date(t.created_at).toISOString(),
      t.description,
      (t.amount_cents / 100).toFixed(2),
      t.reference_id,
    ]);

    const csv =
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
        "\n"
      );

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swarme-wallet-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="wallet-history-card">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Transaction History
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={exportCSV}
            disabled={transactions.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
        </CardTitle>
      </CardHeader>
      <Separator />

      {transactions.length === 0 ? (
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          No transactions yet. Add funds to get started.
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono w-[140px]">Date</TableHead>
                <TableHead className="text-[10px] font-mono">Description</TableHead>
                <TableHead className="text-[10px] font-mono text-right w-[100px]">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((txn) => (
                <TableRow key={txn.id} data-testid={`txn-row-${txn.id}`}>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">
                    {formatDate(txn.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {txn.amount_cents > 0 ? (
                        <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      )}
                      <span className="text-xs">{txn.description}</span>
                      {txn.reference_id && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono ml-auto shrink-0"
                        >
                          {txn.reference_id.slice(0, 16)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`text-xs font-mono text-right ${
                      txn.amount_cents > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {txn.amount_cents > 0 ? "+" : ""}
                    {formatCents(txn.amount_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ── Main Page Component ──────────────────────────────────────

export default function MediaWallet() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.wallet(PROJECT_ID),
    queryFn: () => getWalletData(PROJECT_ID),
    refetchInterval: 10000,
  });

  const topUpMutation = useMutation({
    mutationFn: (amountCents: number) => topUpWallet(PROJECT_ID, amountCents),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet(PROJECT_ID) });
      toast({
        title: "Funds Added",
        description: `${formatCents(result.amount_cents)} has been credited to your wallet.`,
      });
    },
    onError: () => {
      toast({
        title: "Top-up failed",
        description: "Could not process the payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (settings: {
      auto_recharge_enabled: boolean;
      recharge_threshold_cents: number;
      recharge_amount_cents: number;
    }) => updateWalletSettings(PROJECT_ID, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet(PROJECT_ID) });
      toast({
        title: "Settings saved",
        description: "Auto-recharge preferences updated.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Could not update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const wallet = data?.wallet;
  const transactions = data?.transactions ?? [];

  if (!wallet) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Unable to load wallet data.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4" data-testid="page-wallet">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Media Wallet</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Prepaid funds for autonomous agent actions: UGC campaigns, API outlays, and creator briefs.
        </p>
      </div>

      {/* Balance */}
      <BalanceBanner balance_cents={wallet.balance_cents} />

      {/* Top-up + Auto-recharge side by side on wider screens */}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickTopUp
          onTopUp={(cents) => topUpMutation.mutate(cents)}
          isPending={topUpMutation.isPending}
        />
        <AutoRechargeSettings
          wallet={wallet}
          onSave={(settings) => settingsMutation.mutate(settings)}
          isSaving={settingsMutation.isPending}
        />
      </div>

      {/* Transaction history */}
      <TransactionHistory transactions={transactions} />
    </div>
  );
}
