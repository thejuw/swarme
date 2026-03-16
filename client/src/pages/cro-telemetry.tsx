import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { LockedFeature } from "@/components/locked-feature";
import {
  getTelemetrySummary,
  queryKeys,
  type TelemetryResponse,
  type TelemetryAsset,
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  BarChart3,
  Eye,
  MousePointerClick,
  Clock,
  ArrowDown,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

const PROJECT_ID = "proj_001";

/* ─── Helpers ───────────────────────────────────────── */

function statusForAsset(a: TelemetryAsset): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (a.total_views < 100) return { label: "Collecting", variant: "outline" };
  if (a.avg_scroll_depth < 30 && a.cta_clicks === 0)
    return { label: "CTA Buried", variant: "destructive" };
  if (a.avg_dwell_time_seconds < 10)
    return { label: "Weak Intro", variant: "destructive" };
  if (a.avg_scroll_depth < 50)
    return { label: "Needs Work", variant: "secondary" };
  return { label: "Healthy", variant: "default" };
}

function scrollColor(depth: number): string {
  if (depth >= 60) return "hsl(152, 62%, 48%)";
  if (depth >= 30) return "hsl(45, 93%, 58%)";
  return "hsl(0, 72%, 51%)";
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

/* ─── KPI Card ──────────────────────────────────────── */

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Eye;
}) {
  return (
    <Card data-testid={`card-kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">
            {label}
          </p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          {sub && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Scroll Depth Bar Chart ────────────────────────── */

function ScrollDepthChart({ assets }: { assets: TelemetryAsset[] }) {
  const { t } = useTranslation();
  const chartData = assets.slice(0, 8).map((a) => ({
    name: truncate(a.title, 20),
    scroll: Math.round(a.avg_scroll_depth * 10) / 10,
    fullTitle: a.title,
  }));

  return (
    <Card data-testid="card-scroll-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("cro.scrollDepthByAsset")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border/40"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${v}%`}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10 }}
                width={130}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, "Scroll Depth"]}
                labelFormatter={(_: string, payload: any[]) =>
                  payload?.[0]?.payload?.fullTitle || ""
                }
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="scroll" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={scrollColor(entry.scroll)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Asset Table ───────────────────────────────────── */

function AssetTable({ assets }: { assets: TelemetryAsset[] }) {
  const { t } = useTranslation();

  return (
    <Card data-testid="card-asset-table">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("cro.allTrackedAssets")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">{t("cro.article")}</TableHead>
              <TableHead className="text-right">{t("cro.views")}</TableHead>
              <TableHead className="text-right">{t("cro.scrollDepth")}</TableHead>
              <TableHead className="text-right">{t("cro.dwellTime")}</TableHead>
              <TableHead className="text-right">{t("cro.ctaClicks")}</TableHead>
              <TableHead className="text-center">{t("cro.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => {
              const status = statusForAsset(asset);
              return (
                <TableRow
                  key={asset.asset_id}
                  data-testid={`row-telemetry-${asset.asset_id}`}
                >
                  <TableCell className="font-medium max-w-0">
                    <div className="flex items-center gap-2 min-w-0">
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
                    {asset.total_views.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress
                        value={asset.avg_scroll_depth}
                        className="w-16 h-1.5"
                      />
                      <span className="font-mono text-xs tabular-nums w-10 text-right">
                        {asset.avg_scroll_depth.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {asset.avg_dwell_time_seconds}s
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {asset.cta_clicks}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={status.variant} className="text-[10px]">
                      {status.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── Underperforming Alert ─────────────────────────── */

function UnderperformingAlert({
  assets,
}: {
  assets: TelemetryAsset[];
}) {
  const { t } = useTranslation();
  if (assets.length === 0) return null;

  return (
    <Card
      className="border-destructive/40 bg-destructive/5"
      data-testid="card-underperforming"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {t("cro.underperformingTitle", { count: assets.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {assets.map((a) => {
            const reason =
              a.avg_scroll_depth < 30 && a.cta_clicks === 0
                ? t("cro.reasonCtaBuried")
                : t("cro.reasonWeakIntro");
            return (
              <div
                key={a.asset_id}
                className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0"
              >
                <span className="truncate max-w-[60%] font-medium">
                  {a.title}
                </span>
                <Badge variant="destructive" className="text-[10px] shrink-0">
                  {reason}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ──────────────────────────────── */

function CROSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-8 animate-fade-in overflow-y-auto h-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-[260px] w-full rounded-lg" />
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

function CROError() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <BarChart3 className="h-10 w-10 opacity-40" />
      <p className="text-sm">{t("common.error")}</p>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────── */

export default function CROTelemetry() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Phase 32: Tier gate — CRO requires autopilot+
  const userTier = user?.plan_tier || user?.plan || "free";
  const hasAccess = ["autopilot", "enterprise"].includes(userTier);

  const { data, isLoading, isError } = useQuery<TelemetryResponse>({
    queryKey: queryKeys.telemetrySummary(PROJECT_ID),
    queryFn: () => getTelemetrySummary(PROJECT_ID),
    staleTime: 30_000,
    enabled: hasAccess,
  });

  if (!hasAccess) {
    return (
      <LockedFeature
        featureName="CRO Heatmap Telemetry"
        featureDescription="Behavioral heatmap tracking, scroll-depth analysis, and algorithmic A/B testing. Unlock real-time conversion optimization powered by your swarm."
        icon="cro"
      />
    );
  }

  if (isLoading) return <CROSkeleton />;
  if (isError || !data) return <CROError />;

  const { summary, assets, underperforming } = data;

  return (
    <div
      className="flex flex-col gap-4 p-4 pb-8 animate-fade-in overflow-y-auto h-full"
      data-testid="page-cro-telemetry"
    >
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          {t("cro.title")}
        </h1>
        <Badge variant="outline" className="text-[10px] font-mono">
          {t("cro.trackedAssets", { count: summary.total_tracked_assets })}
        </Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("cro.totalViews")}
          value={summary.total_views.toLocaleString()}
          icon={Eye}
        />
        <KpiCard
          label={t("cro.avgScrollDepth")}
          value={`${summary.avg_scroll_depth}%`}
          sub={
            summary.avg_scroll_depth < 30
              ? t("cro.belowThreshold")
              : t("cro.healthy")
          }
          icon={ArrowDown}
        />
        <KpiCard
          label={t("cro.avgDwellTime")}
          value={`${summary.avg_dwell_time_seconds}s`}
          sub={
            summary.avg_dwell_time_seconds < 10
              ? t("cro.belowThreshold")
              : t("cro.healthy")
          }
          icon={Clock}
        />
        <KpiCard
          label={t("cro.totalCtaClicks")}
          value={summary.total_cta_clicks.toLocaleString()}
          icon={MousePointerClick}
        />
      </div>

      {/* Underperforming alert */}
      <UnderperformingAlert assets={underperforming} />

      {/* Scroll depth chart */}
      <ScrollDepthChart assets={assets} />

      {/* Full asset table */}
      <AssetTable assets={assets} />

      <PerplexityAttribution />
    </div>
  );
}
