import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, TrendingUp, AlertTriangle } from "lucide-react";
import { getVisibility, queryKeys } from "@/lib/api";
import { useProjectId } from "@/hooks/use-project-id";


interface VisibilityLog {
  id: string;
  project_id: string;
  keyword: string;
  engine: string;
  cited: number; // 0 or 1
  rank_position: number | null;
  citation_url: string | null;
  checked_at: string;
}

interface VisibilitySummary {
  success: boolean;
  project_id: string;
  visibility_score: number;
  keywords_tracked: number;
  keywords_cited: number;
  citation_gaps: number;
  keywords: VisibilityLog[];
}

export function VisibilityScore({ projectId: propProjectId }: { projectId?: string }) {
  const hookProjectId = useProjectId();
  const projectId = propProjectId || hookProjectId;
  const { data, isLoading, isError } = useQuery<VisibilitySummary>({
    queryKey: queryKeys.visibility(projectId),
    queryFn: () => getVisibility(projectId),
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  const score = data?.visibility_score ?? 0;
  const keywords = data?.keywords ?? [];
  const gapCount = data?.citation_gaps ?? 0;

  return (
    <Card data-testid="card-visibility-score">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">AI Visibility Score</CardTitle>
        <Eye className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="space-y-2 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">Failed to load visibility data</p>
        ) : (
          <>
            {/* Score display */}
            <div className="flex items-end gap-2 mb-3">
              <span className="text-3xl font-bold tabular-nums tracking-tight" data-testid="text-visibility-score">
                {score}%
              </span>
              <div className="flex items-center gap-1 pb-1">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary font-medium">+8%</span>
              </div>
            </div>

            {/* Score bar */}
            <div className="h-2 w-full rounded-full bg-muted mb-4">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${score}%` }}
              />
            </div>

            {/* Citation checks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Keyword Citations</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {data?.keywords_cited ?? 0}/{data?.keywords_tracked ?? 0} tracked
                </span>
              </div>
              <div className="space-y-1.5">
                {keywords.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center justify-between gap-2 py-1"
                    data-testid={`visibility-check-${check.keyword.replace(/\s/g, "-")}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          check.cited ? "bg-primary" : "bg-destructive"
                        }`}
                      />
                      <span className="text-xs truncate font-mono">
                        {check.keyword}
                      </span>
                    </div>
                    {check.cited ? (
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                        {check.engine}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-mono text-destructive shrink-0">
                        <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                        Gap
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {gapCount > 0 && (
              <div className="mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive">
                  {gapCount} citation gap{gapCount > 1 ? "s" : ""} detected. Swarm agents are generating optimized content to close them.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
