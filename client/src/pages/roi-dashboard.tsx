import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getROIAnalytics,
  queryKeys,
  type ROIAnalyticsResponse,
  type ROIMonthlyDataPoint,
  type ROITopAsset,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, ShoppingCart, ExternalLink } from "lucide-react";
import { useProjectId } from "@/hooks/use-project-id";


/* ─── Formatters ────────────────────────────────────── */

function fmtCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtMonth(raw: string): string {
  const [year, month] = raw.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ─── Hero KPI Card ─────────────────────────────────── */

function HeroMetric({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent?: boolean;
}) {
  return (
    <Card
      className={accent ? "border-primary/40 bg-primary/5" : ""}
      data-testid={`card-kpi-${label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            accent
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">
            {label}
          </p>
          <p className="text-xl font-semibold tracking-tight truncate">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Recharts Tooltip ──────────────────────────────── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: ROIMonthlyDataPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md text-xs">
      <p className="font-medium">{label}</p>
      <p>
        Revenue: <span className="font-semibold">{fmtCurrency(d.revenue)}</span>
      </p>
      <p>
        Orders: <span className="font-semibold">{d.orders}</span>
      </p>
    </div>
  );
}

/* ─── Revenue Area Chart ────────────────────────────── */

function RevenueChart({
  data,
  currency,
}: {
  data: ROIMonthlyDataPoint[];
  currency: string;
}) {
  const { t } = useTranslation();
  const chartData = data.map((d) => ({
    ...d,
    label: fmtMonth(d.month),
  }));

  return (
    <Card data-testid="card-revenue-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("roi.monthlyRevenue")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(152, 62%, 48%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(152, 62%, 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/40"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => fmtCurrency(v, currency)}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(152, 62%, 48%)"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                dot={{ r: 3, fill: "hsl(152, 62%, 48%)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "hsl(152, 62%, 48%)", strokeWidth: 2, stroke: "white" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Top Performers Table ──────────────────────────── */

function TopPerformersTable({
  assets,
  currency,
}: {
  assets: ROITopAsset[];
  currency: string;
}) {
  const { t } = useTranslation();

  return (
    <Card data-testid="card-top-performers">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("roi.topPerformers")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">{t("roi.article")}</TableHead>
              <TableHead className="text-right">{t("roi.revenue")}</TableHead>
              <TableHead className="text-right">{t("roi.orders")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset, idx) => (
              <TableRow key={asset.asset_id} data-testid={`row-asset-${asset.asset_id}`}>
                <TableCell className="font-medium max-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className="shrink-0 h-5 w-5 p-0 flex items-center justify-center text-[10px] font-mono"
                    >
                      {idx + 1}
                    </Badge>
                    <a
                      href={asset.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs hover:text-primary transition-colors"
                      title={asset.title}
                    >
                      {asset.title}
                    </a>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {fmtCurrency(asset.total_revenue, currency)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {asset.order_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ──────────────────────────────── */

function ROISkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-8 animate-fade-in overflow-y-auto h-full">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Error State ───────────────────────────────────── */

function ROIError() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <DollarSign className="h-10 w-10 opacity-40" />
      <p className="text-sm">{t("common.error")}</p>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────── */

export default function ROIDashboard() {
  const PROJECT_ID = useProjectId();
  const { t } = useTranslation();

  const {
    data,
    isLoading,
    isError,
  } = useQuery<ROIAnalyticsResponse>({
    queryKey: queryKeys.roiAnalytics(PROJECT_ID),
    queryFn: () => getROIAnalytics(PROJECT_ID),
    staleTime: 60_000,
  });

  if (isLoading) return <ROISkeleton />;
  if (isError || !data) return <ROIError />;

  // Compute month-over-month growth for the hero sub-label
  const monthly = data.monthly_revenue;
  const prevMonth = monthly.length >= 2 ? monthly[monthly.length - 2].revenue : 0;
  const growthPct =
    prevMonth > 0
      ? Math.round(((data.total_revenue - prevMonth) / prevMonth) * 100)
      : 0;

  return (
    <div
      className="flex flex-col gap-4 p-4 pb-8 animate-fade-in overflow-y-auto h-full"
      data-testid="page-roi-dashboard"
    >
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("roi.title")}
        </h1>
        <Badge variant="outline" className="text-[10px] font-mono">
          {t("roi.last30")}
        </Badge>
      </div>

      {/* Hero KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroMetric
          label={t("roi.attributedRevenue")}
          value={fmtCurrency(data.total_revenue, data.currency)}
          icon={DollarSign}
          accent
        />
        <HeroMetric
          label={t("roi.totalOrders")}
          value={String(data.total_orders)}
          icon={ShoppingCart}
        />
        <HeroMetric
          label={t("roi.momGrowth")}
          value={`+${growthPct}%`}
          icon={TrendingUp}
        />
      </div>

      {/* Revenue over time chart */}
      <RevenueChart data={data.monthly_revenue} currency={data.currency} />

      {/* Top performers */}
      <TopPerformersTable assets={data.top_assets} currency={data.currency} />

    </div>
  );
}
