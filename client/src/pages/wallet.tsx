/**
 * ============================================================
 * Phase 51.5: Swarme Credits — Compute Balance UI
 * ============================================================
 *
 * Legal compliance refactor: "Media Wallet" → "Swarme Credits"
 * Closed-loop credit system — NO dollar signs on balances.
 * Credits are non-refundable digital software licenses.
 *
 * Displays:
 *   - Compute Balance (credits, NOT dollars)
 *   - Purchase Credits buttons (presets + custom)
 *   - Auto-recharge toggle + threshold/amount inputs
 *   - Credit ledger table with CSV export
 *   - Legal disclaimer
 * ============================================================
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  getCreditData,
  purchaseCredits,
  updateCreditSettings,
  queryKeys,
  type CreditBalanceData,
  type CreditLedgerEntry,
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
import { useProjectId } from "@/hooks/use-project-id";
import {
  Coins,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
  RefreshCw,
  Loader2,
  Zap,
  Shield,
  Scale,
  ScrollText,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────

/** Format credits as a human-readable number with commas. NEVER a dollar sign. */
function formatCredits(credits: number): string {
  const abs = Math.abs(credits);
  return abs.toLocaleString("en-US");
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

// ── Compute Balance Banner ───────────────────────────────────

function ComputeBalanceBanner({ available_credits }: { available_credits: number }) {
  const isLow = available_credits < 5000;
  const isEmpty = available_credits <= 0;

  return (
    <Card
      className={`relative overflow-hidden ${
        isEmpty
          ? "border-red-500/30 bg-red-500/5"
          : isLow
            ? "border-amber-400/30 bg-amber-400/5"
            : "border-violet-400/20 bg-violet-400/5"
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
              : "bg-gradient-to-r from-violet-400 to-indigo-500"
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
                  : "bg-violet-400/15"
            }`}
          >
            <Coins
              className={`h-5 w-5 ${
                isEmpty
                  ? "text-red-400"
                  : isLow
                    ? "text-amber-400"
                    : "text-violet-400"
              }`}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Compute Balance
            </p>
            <div className="flex items-baseline gap-1.5">
              <p
                className="text-3xl font-bold tracking-tight"
                data-testid="text-wallet-balance"
              >
                {formatCredits(available_credits)}
              </p>
              <span className="text-sm font-medium text-muted-foreground">credits</span>
            </div>
          </div>
        </div>

        {isEmpty && (
          <p className="text-xs text-red-400 mt-2">
            Your credit balance is empty. Purchase credits to enable autonomous agent actions.
          </p>
        )}
        {isLow && !isEmpty && (
          <p className="text-xs text-amber-400 mt-2">
            Credit balance is running low. Consider enabling auto-recharge.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Purchase Credits ─────────────────────────────────────────

function PurchaseCredits({ onPurchase, isPending }: { onPurchase: (credits: number) => void; isPending: boolean }) {
  const [customAmount, setCustomAmount] = useState("");
  const presets = [5000, 10000, 25000];

  return (
    <Card data-testid="wallet-topup-card">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-violet-400" />
          Purchase Credits
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-4">
        {/* Preset amounts */}
        <div className="flex gap-2">
          {presets.map((credits) => (
            <Button
              key={credits}
              variant="outline"
              size="sm"
              className="flex-1 h-10 text-sm font-mono"
              onClick={() => onPurchase(credits)}
              disabled={isPending}
              data-testid={`button-topup-${credits}`}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                `${formatCredits(credits)} cr`
              )}
            </Button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="number"
              min="500"
              step="100"
              placeholder="Custom credits"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="pl-8 h-10 text-sm font-mono"
              data-testid="input-custom-topup"
            />
          </div>
          <Button
            size="sm"
            className="h-10 px-4 bg-violet-600 hover:bg-violet-700"
            onClick={() => {
              const credits = parseInt(customAmount, 10);
              if (credits >= 500) {
                onPurchase(credits);
                setCustomAmount("");
              }
            }}
            disabled={isPending || !customAmount || parseInt(customAmount, 10) < 500}
            data-testid="button-topup-custom"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buy"}
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Minimum 500 credits. Payments processed securely via Stripe.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Auto-Recharge Settings ───────────────────────────────────

function AutoRechargeSettings({
  balance,
  onSave,
  isSaving,
}: {
  balance: CreditBalanceData;
  onSave: (settings: {
    auto_recharge_enabled: boolean;
    recharge_threshold_credits: number;
    recharge_amount_credits: number;
  }) => void;
  isSaving: boolean;
}) {
  const [enabled, setEnabled] = useState(balance.auto_recharge_enabled);
  const [threshold, setThreshold] = useState(
    balance.recharge_threshold_credits.toString()
  );
  const [amount, setAmount] = useState(
    balance.recharge_amount_credits.toString()
  );

  const handleSave = () => {
    onSave({
      auto_recharge_enabled: enabled,
      recharge_threshold_credits: parseInt(threshold || "5000", 10),
      recharge_amount_credits: parseInt(amount || "25000", 10),
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
              Automatically purchase credits when balance falls below threshold
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
                  <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min="1000"
                    step="1000"
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
                  <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    min="2500"
                    step="2500"
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
                When balance drops below {formatCredits(parseInt(threshold || "0", 10))} credits,
                we will purchase {formatCredits(parseInt(amount || "0", 10))} credits
                via your saved payment method.
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

// ── Credit Ledger ────────────────────────────────────────────

function CreditLedger({
  entries,
}: {
  entries: CreditLedgerEntry[];
}) {
  const exportCSV = () => {
    const headers = ["Date", "Description", "Credits", "Reference ID"];
    const rows = entries.map((e) => [
      new Date(e.created_at).toISOString(),
      e.description,
      e.credit_amount.toString(),
      e.reference_id,
    ]);

    const csv =
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
        "\n"
      );

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swarme-credit-ledger-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="wallet-history-card">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            Credit Ledger
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={exportCSV}
            disabled={entries.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
        </CardTitle>
      </CardHeader>
      <Separator />

      {entries.length === 0 ? (
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          No ledger entries yet. Purchase credits to get started.
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-mono w-[140px]">Date</TableHead>
                <TableHead className="text-[10px] font-mono">Description</TableHead>
                <TableHead className="text-[10px] font-mono text-right w-[100px]">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} data-testid={`txn-row-${entry.id}`}>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">
                    {formatDate(entry.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {entry.credit_amount > 0 ? (
                        <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      )}
                      <span className="text-xs">{entry.description}</span>
                      {entry.reference_id && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono ml-auto shrink-0"
                        >
                          {entry.reference_id.slice(0, 16)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`text-xs font-mono text-right ${
                      entry.credit_amount > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {entry.credit_amount > 0 ? "+" : ""}
                    {formatCredits(entry.credit_amount)}
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

// ── Legal Disclaimer ─────────────────────────────────────────

function LegalDisclaimer() {
  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-muted/40 border border-border/50"
      data-testid="legal-disclaimer"
    >
      <Scale className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Swarme Credits are non-refundable digital software licenses used to provision
        compute power, API calls, and managed external services. Credits hold no cash
        value, cannot be transferred, and are not redeemable for currency.
      </p>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────

export default function SwarmeCredits() {
  const PROJECT_ID = useProjectId();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.credits(PROJECT_ID),
    queryFn: () => getCreditData(PROJECT_ID),
    refetchInterval: 10000,
  });

  const purchaseMutation = useMutation({
    mutationFn: (credits: number) => purchaseCredits(PROJECT_ID, credits),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credits(PROJECT_ID) });
      toast({
        title: "Credits Purchased",
        description: `${formatCredits(result.amount_credits)} credits have been added to your compute balance.`,
      });
    },
    onError: () => {
      toast({
        title: "Purchase failed",
        description: "Could not process the payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (settings: {
      auto_recharge_enabled: boolean;
      recharge_threshold_credits: number;
      recharge_amount_credits: number;
    }) => updateCreditSettings(PROJECT_ID, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credits(PROJECT_ID) });
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

  const balance = data?.balance;
  const ledger = data?.ledger ?? [];

  if (!balance) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Unable to load credit balance data.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4" data-testid="page-wallet">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Swarme Credits</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Compute balance for autonomous agent actions: UGC campaigns, API calls, and managed services.
        </p>
      </div>

      {/* Balance */}
      <ComputeBalanceBanner available_credits={balance.available_credits} />

      {/* Purchase + Auto-recharge side by side on wider screens */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PurchaseCredits
          onPurchase={(credits) => purchaseMutation.mutate(credits)}
          isPending={purchaseMutation.isPending}
        />
        <AutoRechargeSettings
          balance={balance}
          onSave={(settings) => settingsMutation.mutate(settings)}
          isSaving={settingsMutation.isPending}
        />
      </div>

      {/* Legal disclaimer */}
      <LegalDisclaimer />

      {/* Credit ledger */}
      <CreditLedger entries={ledger} />
    </div>
  );
}
