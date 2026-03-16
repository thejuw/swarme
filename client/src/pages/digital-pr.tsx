/**
 * DigitalPR — Full-page Digital PR / Outreach dashboard at /#/pr
 *
 * Shows outreach campaigns, prospect pipeline, and link-building progress.
 * Pulls data from the outreach campaigns API.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getOutreachCampaigns,
  queryKeys,
  type OutreachCampaign,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  ExternalLink,
  Clock,
  CheckCircle2,
  Send,
  FileEdit,
  XCircle,
  Target,
} from "lucide-react";

const PROJECT_ID = "proj_001";

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  draft: { color: "bg-slate-500/10 text-slate-400 border-slate-500/25", icon: FileEdit },
  pending_approval: { color: "bg-amber-500/10 text-amber-400 border-amber-500/25", icon: Clock },
  approved: { color: "bg-blue-500/10 text-blue-400 border-blue-500/25", icon: CheckCircle2 },
  sent: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", icon: Send },
  replied: { color: "bg-teal-500/10 text-teal-400 border-teal-500/25", icon: Mail },
  rejected: { color: "bg-red-500/10 text-red-400 border-red-500/25", icon: XCircle },
  link_placed: { color: "bg-green-500/10 text-green-400 border-green-500/25", icon: ExternalLink },
};

function formatStatus(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DigitalPR() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.outreachCampaigns(PROJECT_ID),
    queryFn: () => getOutreachCampaigns(PROJECT_ID),
    refetchInterval: 30_000,
  });

  const campaigns: OutreachCampaign[] = data?.campaigns || [];
  const filtered = statusFilter === "all"
    ? campaigns
    : campaigns.filter((c) => c.status === statusFilter);

  const totalSent = campaigns.filter((c) => c.status === "sent" || c.status === "replied" || c.status === "link_placed").length;
  const totalLinked = campaigns.filter((c) => c.status === "link_placed").length;
  const totalDraft = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval").length;

  return (
    <div className="h-full flex flex-col" data-testid="page-digital-pr">
      <div className="p-4 pb-0 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Digital PR</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Outreach campaigns and link-building pipeline managed by the Outreach Agent.
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border/50" data-testid="card-total-campaigns">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Campaigns
                </CardTitle>
                <Target className="h-4 w-4 text-blue-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums">{campaigns.length}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-sent-count">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Outreach Sent
                </CardTitle>
                <Send className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-emerald-400">{totalSent}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-links-placed">
              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Links Placed
                </CardTitle>
                <ExternalLink className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold tabular-nums text-green-400">{totalLinked}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Filter + Table */}
          <Card className="border-border/50" data-testid="table-outreach-campaigns">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Outreach Pipeline</CardTitle>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px] h-7 text-xs" data-testid="select-pr-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="link_placed">Link Placed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  No campaigns match the selected filter.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Target Site</TableHead>
                      <TableHead className="text-xs">Contact</TableHead>
                      <TableHead className="text-xs">Keyword</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((campaign) => {
                      const sc = statusConfig[campaign.status] || statusConfig.draft;
                      const StatusIcon = sc.icon;
                      return (
                        <TableRow key={campaign.id} data-testid={`pr-row-${campaign.id}`}>
                          <TableCell className="font-medium text-sm">
                            {campaign.target_url ? (
                              <a
                                href={campaign.target_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline flex items-center gap-1"
                              >
                                {new URL(campaign.target_url).hostname}
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{campaign.contact_email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {campaign.keyword}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${sc.color}`}>
                              <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                              {formatStatus(campaign.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(campaign.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
