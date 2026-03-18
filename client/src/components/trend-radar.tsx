import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Radio } from "lucide-react";

export function TrendRadar() {
  return (
    <Card data-testid="card-trend-radar">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">Trend Radar</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs font-medium text-muted-foreground">Listening for trends</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Breakout keywords will appear here once the trend agent detects velocity signals in your niche.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
