/**
 * TrendRadar — Full-page Trend Radar view at /#/trends
 *
 * Displays trending keywords detected by the swarm's trend detection agent.
 * Uses the existing TrendRadar component data model with an expanded layout.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Flame,
  ArrowUpRight,
  Zap,
  Target,
  Activity,
} from "lucide-react";

interface TrendItem {
  term: string;
  velocity: number;
  niche: string;
  status: "breakout" | "rising" | "emerging";
  volume?: string;
  opportunity?: string;
}

const mockTrends: TrendItem[] = [
  { term: "serverless seo", velocity: 4.2, niche: "SEO Tools", status: "breakout", volume: "12.4K", opportunity: "High — low competition, high intent" },
  { term: "ai content audit", velocity: 3.1, niche: "Content", status: "breakout", volume: "8.7K", opportunity: "High — growing demand, sparse SERPs" },
  { term: "edge personalization", velocity: 2.4, niche: "Tech", status: "rising", volume: "5.2K", opportunity: "Medium — technical audience" },
  { term: "zero-click optimization", velocity: 1.8, niche: "SERP", status: "rising", volume: "3.1K", opportunity: "Medium — awareness building" },
  { term: "llm citation strategy", velocity: 1.3, niche: "GEO", status: "emerging", volume: "1.8K", opportunity: "Early mover advantage" },
  { term: "agentic seo workflows", velocity: 3.8, niche: "AI", status: "breakout", volume: "6.5K", opportunity: "High — category defining" },
  { term: "programmatic internal linking", velocity: 2.1, niche: "Technical SEO", status: "rising", volume: "4.3K", opportunity: "Medium — implementation guides needed" },
  { term: "brand serp management", velocity: 1.6, niche: "Brand", status: "emerging", volume: "2.9K", opportunity: "Medium — growing awareness" },
];

const statusConfig = {
  breakout: { label: "Breakout", color: "bg-red-500/10 text-red-400 border-red-500/25", icon: Flame },
  rising: { label: "Rising", color: "bg-amber-500/10 text-amber-400 border-amber-500/25", icon: TrendingUp },
  emerging: { label: "Emerging", color: "bg-blue-500/10 text-blue-400 border-blue-500/25", icon: ArrowUpRight },
};

export default function TrendRadarPage() {
  const breakoutCount = mockTrends.filter((t) => t.status === "breakout").length;
  const risingCount = mockTrends.filter((t) => t.status === "rising").length;
  const emergingCount = mockTrends.filter((t) => t.status === "emerging").length;

  return (
    <div className="h-full flex flex-col" data-testid="page-trend-radar">
      <div className="p-4 pb-0">
        <h2 className="text-lg font-semibold tracking-tight">Trend Radar</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Keywords gaining velocity in your niche. Act on breakout trends before competitors.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border/50" data-testid="card-breakout-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Breakout
                </CardTitle>
                <Flame className="h-4 w-4 text-red-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-red-400">{breakoutCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">High-velocity keywords</p>
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-rising-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Rising
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-amber-400">{risingCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Gaining momentum</p>
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-emerging-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Emerging
                </CardTitle>
                <Zap className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums text-blue-400">{emergingCount}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Early signals</p>
              </CardContent>
            </Card>
          </div>

          {/* Full Trend Table */}
          <Card className="border-border/50" data-testid="table-trends">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">
                  Detected Trends
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sorted by velocity score. Higher = faster growing.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Keyword</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Velocity</TableHead>
                    <TableHead className="text-xs">Niche</TableHead>
                    <TableHead className="text-xs text-right">Est. Volume</TableHead>
                    <TableHead className="text-xs">Opportunity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTrends
                    .sort((a, b) => b.velocity - a.velocity)
                    .map((trend) => {
                      const sc = statusConfig[trend.status];
                      const StatusIcon = sc.icon;
                      return (
                        <TableRow key={trend.term} data-testid={`trend-row-${trend.term.replace(/\s+/g, "-")}`}>
                          <TableCell className="font-medium text-sm">{trend.term}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                              {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {trend.velocity.toFixed(1)}x
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {trend.niche}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {trend.volume || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {trend.opportunity || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
