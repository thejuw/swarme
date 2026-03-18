/**
 * AiVisibility — Full-page AI Visibility dashboard at /#/visibility
 *
 * Shows how the brand appears across AI engines (Perplexity, ChatGPT, Gemini, etc.)
 * with citation tracking, keyword-level data, and a visibility score.
 */

import { useQuery } from "@tanstack/react-query";
import { getVisibility, queryKeys, type VisibilityLog } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectId } from "@/hooks/use-project-id";
import {
  Eye,
  CheckCircle2,
  XCircle,
  Globe,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

const engineColors: Record<string, string> = {
  Perplexity: "bg-teal-500/10 text-teal-400 border-teal-500/25",
  ChatGPT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Gemini: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  Claude: "bg-purple-500/10 text-purple-400 border-purple-500/25",
};

export default function AiVisibility() {
  const PROJECT_ID = useProjectId();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.visibility(PROJECT_ID),
    queryFn: () => getVisibility(PROJECT_ID),
    refetchInterval: 30_000,
  });

  const keywords = data?.keywords || [];
  const score = data?.visibility_score ?? 0;
  const cited = data?.keywords_cited ?? 0;
  const gaps = data?.citation_gaps ?? 0;
  const tracked = data?.keywords_tracked ?? 0;

  // Group by engine
  const engineMap = new Map<string, VisibilityLog[]>();
  keywords.forEach((kw) => {
    const list = engineMap.get(kw.engine) || [];
    list.push(kw);
    engineMap.set(kw.engine, list);
  });

  return (
    <div className="h-full flex flex-col" data-testid="page-ai-visibility">
      <div className="p-4 pb-0">
        <h2 className="text-lg font-semibold tracking-tight">AI Visibility</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Track how AI engines cite your brand across keywords. Higher score = more citations.
        </p>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border/50" data-testid="card-visibility-score">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Visibility Score
                </CardTitle>
                <Eye className="h-4 w-4 text-teal-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{score}%</p>
                    <Progress value={score} className="mt-2 h-1.5" />
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-keywords-tracked">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Keywords Tracked
                </CardTitle>
                <Globe className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums">{tracked}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-cited-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cited
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-emerald-400">{cited}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-gap-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Citation Gaps
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-amber-400">{gaps}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Engine Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from(engineMap.entries()).map(([engine, logs]: [string, VisibilityLog[]]) => {
              const engineCited = logs.filter((l: VisibilityLog) => l.cited === 1).length;
              const pct = logs.length > 0 ? Math.round((engineCited / logs.length) * 100) : 0;
              return (
                <Card key={engine} className="border-border/50" data-testid={`card-engine-${engine.toLowerCase()}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={`text-xs ${engineColors[engine] || ""}`}>
                        {engine}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{engineCited}/{logs.length} cited</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground mt-1">{pct}% citation rate</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Full Keyword Table */}
          <Card className="border-border/50" data-testid="table-visibility-keywords">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Keyword Citation Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Keyword</TableHead>
                      <TableHead className="text-xs">Engine</TableHead>
                      <TableHead className="text-xs text-center">Cited</TableHead>
                      <TableHead className="text-xs text-right">Rank</TableHead>
                      <TableHead className="text-xs">Citation URL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keywords.map((kw) => (
                      <TableRow key={kw.id} data-testid={`visibility-row-${kw.id}`}>
                        <TableCell className="font-medium text-sm">{kw.keyword}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${engineColors[kw.engine] || ""}`}>
                            {kw.engine}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {kw.cited === 1 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {kw.rank_position ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {kw.citation_url ? (
                            <a
                              href={kw.citation_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-foreground underline"
                            >
                              {kw.citation_url}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
