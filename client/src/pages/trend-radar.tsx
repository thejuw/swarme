/**
 * TrendRadar — Full-page Trend Radar view at /#/trends
 *
 * Displays trending keywords detected by the swarm's trend detection agent.
 * Shows empty state until real data flows in from agent activity.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  Flame,
  Zap,
  Radio,
} from "lucide-react";

export default function TrendRadarPage() {
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
                <p className="text-2xl font-bold tabular-nums text-red-400">0</p>
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
                <p className="text-2xl font-bold tabular-nums text-amber-400">0</p>
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
                <p className="text-2xl font-bold tabular-nums text-blue-400">0</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Early signals</p>
              </CardContent>
            </Card>
          </div>

          {/* Empty state */}
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Radio className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                Scanning for velocity signals
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-md">
                The trend detection agent continuously monitors keyword velocity in your niche.
                Breakout terms will appear here once signals exceed your configured threshold.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
