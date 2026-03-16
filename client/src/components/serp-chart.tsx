import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { getGscMetrics, queryKeys, type GscMetricRow } from "@/lib/api";

const PROJECT_ID = "proj_001";

/** Format ISO date string to "Mar 5" short label */
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SerpChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.gscMetrics(PROJECT_ID),
    queryFn: () => getGscMetrics(PROJECT_ID),
    refetchInterval: 60_000,
  });

  const metrics: (GscMetricRow & { label: string })[] =
    data?.metrics?.map((m) => ({ ...m, label: fmtDate(m.date) })) ?? [];

  return (
    <Card className="col-span-full lg:col-span-2" data-testid="card-serp-chart">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">
          Search Console Performance
        </CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="h-[220px] w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-xs">Loading GSC data...</span>
            </div>
          ) : isError || metrics.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-1">
              <BarChart3 className="h-6 w-6 opacity-40" />
              <span className="text-xs">
                {isError
                  ? "Failed to load Search Console data"
                  : "No Search Console data yet"}
              </span>
              <span className="text-[10px] opacity-60">
                Connect Google Search Console in Settings
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={metrics}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(152, 62%, 48%)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(152, 62%, 48%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="colorImpressions"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(215, 70%, 55%)"
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(215, 70%, 55%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(218, 12%, 20%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(215, 10%, 55%)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: "hsl(215, 10%, 55%)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "hsl(215, 10%, 55%)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220, 14%, 10%)",
                    border: "1px solid hsl(218, 12%, 20%)",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                  }}
                  labelStyle={{ color: "hsl(210, 20%, 92%)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="impressions"
                  name="Impressions"
                  stroke="hsl(215, 70%, 55%)"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorImpressions)"
                  dot={false}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="clicks"
                  name="Clicks"
                  stroke="hsl(152, 62%, 48%)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorClicks)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
