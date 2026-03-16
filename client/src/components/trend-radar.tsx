import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Flame, ArrowUpRight } from "lucide-react";

interface TrendItem {
  term: string;
  velocity: number;
  niche: string;
  status: "breakout" | "rising" | "emerging";
}

const mockTrends: TrendItem[] = [
  { term: "serverless seo", velocity: 4.2, niche: "SEO Tools", status: "breakout" },
  { term: "ai content audit", velocity: 3.1, niche: "Content", status: "breakout" },
  { term: "edge personalization", velocity: 2.4, niche: "Tech", status: "rising" },
  { term: "zero-click optimization", velocity: 1.8, niche: "SERP", status: "rising" },
  { term: "llm citation strategy", velocity: 1.3, niche: "GEO", status: "emerging" },
];

const statusColors = {
  breakout: "text-destructive",
  rising: "text-chart-4",
  emerging: "text-muted-foreground",
};

export function TrendRadar() {
  return (
    <Card data-testid="card-trend-radar">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">Trend Radar</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Breakout terms in your niche. High-velocity triggers auto-draft.
        </p>
        <div className="space-y-2">
          {mockTrends.map((trend) => (
            <div
              key={trend.term}
              className="flex items-center gap-3 py-1.5"
              data-testid={`trend-${trend.term.replace(/\s/g, "-")}`}
            >
              <Flame
                className={`h-3.5 w-3.5 shrink-0 ${statusColors[trend.status]}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium font-mono truncate">
                    {trend.term}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {trend.niche}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ArrowUpRight className="h-3 w-3 text-primary" />
                <span className="text-xs font-mono font-medium tabular-nums">
                  {trend.velocity}x
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
