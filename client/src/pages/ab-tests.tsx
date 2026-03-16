import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { LockedFeature } from "@/components/locked-feature";
import {
  getAbTests,
  queryKeys,
  type AbTest,
  type AbTestsResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  Trophy,
  BarChart3,
  Eye,
  MousePointerClick,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

const PROJECT_ID = "proj_001";

/** Format a rate (0–1) as a percentage string */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/** Format a large number with commas */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Relative time label */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Color for confidence level */
function confColor(conf: number): string {
  if (conf >= 95) return "text-emerald-400";
  if (conf >= 80) return "text-amber-400";
  return "text-muted-foreground";
}

/** Progress bar color class */
function confBarColor(conf: number): string {
  if (conf >= 95) return "[&>div]:bg-emerald-500";
  if (conf >= 80) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-muted-foreground/40";
}

function AbTestCard({ test }: { test: AbTest }) {
  const sig = test.significance;
  const totalViews = test.views_a + test.views_b;
  const isRunning = test.status === "Running";

  return (
    <Card data-testid={`card-ab-test-${test.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-sm font-semibold truncate" data-testid={`text-ab-name-${test.id}`}>
            {test.test_name}
          </CardTitle>
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            {test.asset_id} &middot; {test.target_selector}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <Badge
              variant="outline"
              className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px]"
              data-testid={`badge-status-${test.id}`}
            >
              <FlaskConical className="mr-1 h-3 w-3" />
              Running
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]"
              data-testid={`badge-status-${test.id}`}
            >
              <Trophy className="mr-1 h-3 w-3" />
              {test.winner ? `Variant ${test.winner} Wins` : "Concluded"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Variant comparison */}
        <div className="grid grid-cols-2 gap-3">
          {/* Variant A */}
          <div
            className={`rounded-lg border p-3 space-y-2 ${
              test.winner === "A"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : test.winner === "B"
                  ? "border-muted/40 opacity-60"
                  : "border-muted/40"
            }`}
            data-testid={`panel-variant-a-${test.id}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Variant A</span>
              {test.winner === "A" && (
                <Trophy className="h-3 w-3 text-emerald-400" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>{fmt(test.views_a)} views</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="h-3 w-3" />
                <span>{fmt(test.conversions_a)} conversions</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-mono font-semibold">
                <TrendingUp className="h-3.5 w-3.5" />
                <span data-testid={`text-cr-a-${test.id}`}>
                  {pct(sig.rateA)} CR
                </span>
              </div>
            </div>
          </div>

          {/* Variant B */}
          <div
            className={`rounded-lg border p-3 space-y-2 ${
              test.winner === "B"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : test.winner === "A"
                  ? "border-muted/40 opacity-60"
                  : "border-muted/40"
            }`}
            data-testid={`panel-variant-b-${test.id}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Variant B</span>
              {test.winner === "B" && (
                <Trophy className="h-3 w-3 text-emerald-400" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>{fmt(test.views_b)} views</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="h-3 w-3" />
                <span>{fmt(test.conversions_b)} conversions</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-mono font-semibold">
                <TrendingUp className="h-3.5 w-3.5" />
                <span data-testid={`text-cr-b-${test.id}`}>
                  {pct(sig.rateB)} CR
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Statistical confidence bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Statistical Confidence
            </span>
            <span
              className={`text-xs font-mono font-semibold ${confColor(sig.confidence)}`}
              data-testid={`text-confidence-${test.id}`}
            >
              {sig.confidence.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={Math.min(100, sig.confidence)}
            className={`h-2 ${confBarColor(sig.confidence)}`}
            data-testid={`progress-confidence-${test.id}`}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
            <span>
              p-value: {sig.pValue.toFixed(4)} &middot; Z: {sig.zScore.toFixed(3)}
            </span>
            <span>
              {fmt(totalViews)} / {fmt(test.min_views)} min views
            </span>
          </div>
          {!sig.meetsMinViews && isRunning && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400/80">
              <AlertCircle className="h-3 w-3" />
              Waiting for minimum sample size ({fmt(test.min_views)} views)
            </div>
          )}
        </div>

        {/* Footer meta */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 pt-1 border-t border-muted/20">
          <span>Created {relTime(test.created_at)}</span>
          <span>Updated {relTime(test.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AbTestSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-2 w-full" />
      </CardContent>
    </Card>
  );
}

export default function AbTests() {
  const { user } = useAuth();

  // Phase 32: Tier gate — A/B testing requires autopilot+
  const userTier = user?.plan_tier || user?.plan || "free";
  const hasAccess = ["autopilot", "enterprise"].includes(userTier);

  const { data, isLoading, isError } = useQuery<AbTestsResponse>({
    queryKey: queryKeys.abTests(PROJECT_ID),
    queryFn: () => getAbTests(PROJECT_ID),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: hasAccess,
  });

  if (!hasAccess) {
    return (
      <LockedFeature
        featureName="A/B Split Testing Engine"
        featureDescription="Edge-native traffic splitting with zero-flicker HTMLRewriter routing, automatic statistical significance detection, and winner deployment. Unlock conversion optimization at the edge."
        icon="cro"
      />
    );
  }

  const tests = data?.tests || [];
  const running = tests.filter((t) => t.status === "Running");
  const concluded = tests.filter((t) => t.status === "Concluded");

  return (
    <div className="flex flex-col gap-6 p-4 pb-8 animate-fade-in overflow-y-auto h-full">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight" data-testid="text-ab-title">
          A/B Split Tests
        </h1>
        <p className="text-xs text-muted-foreground max-w-xl">
          Edge-native traffic routing with HTMLRewriter. Tests auto-conclude
          when the Z-test reaches 95% confidence and the minimum sample size is
          met.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-lg font-bold font-mono" data-testid="text-ab-running-count">
                  {isLoading ? "—" : running.length}
                </p>
                <p className="text-[10px] text-muted-foreground">Running</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-lg font-bold font-mono" data-testid="text-ab-concluded-count">
                  {isLoading ? "—" : concluded.length}
                </p>
                <p className="text-[10px] text-muted-foreground">Concluded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold font-mono" data-testid="text-ab-total-views">
                  {isLoading
                    ? "—"
                    : fmt(
                        tests.reduce(
                          (s, t) => s + t.views_a + t.views_b,
                          0
                        )
                      )}
                </p>
                <p className="text-[10px] text-muted-foreground">Total Views</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold font-mono" data-testid="text-ab-avg-confidence">
                  {isLoading || running.length === 0
                    ? "—"
                    : `${(
                        running.reduce(
                          (s, t) => s + t.significance.confidence,
                          0
                        ) / running.length
                      ).toFixed(1)}%`}
                </p>
                <p className="text-[10px] text-muted-foreground">Avg Confidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active tests */}
      {running.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Tests
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {running.map((test) => (
              <AbTestCard key={test.id} test={test} />
            ))}
          </div>
        </div>
      )}

      {/* Concluded tests */}
      {concluded.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Concluded Tests
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {concluded.map((test) => (
              <AbTestCard key={test.id} test={test} />
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AbTestSkeleton />
          <AbTestSkeleton />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && tests.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium">No A/B tests yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              The CRO agent will automatically launch split tests when it
              detects underperforming CTAs. Tests route traffic at the edge
              using HTMLRewriter for zero-flicker delivery.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Failed to load A/B tests</p>
              <p className="text-xs text-muted-foreground">
                Check your connection and try again.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
