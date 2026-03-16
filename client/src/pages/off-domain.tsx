import { useQuery } from "@tanstack/react-query";
import {
  getOffDomainData,
  queryKeys,
  type OffDomainConnection,
  type EntityPresence,
  type SyndicationLogEntry,
  type BarnacleOutreachEntry,
  type ReviewRoutingEntry,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Loader2,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pin,
  ShoppingBag,
  Mail,
  Star,
  LinkIcon,
  Sparkles,
  TrendingUp,
  Clock,
  ExternalLink,
} from "lucide-react";

const PROJECT_ID = "proj_001";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function platformColor(platform: string): string {
  const map: Record<string, string> = {
    Pinterest: "text-red-400 bg-red-400/10 border-red-400/30",
    Reddit: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    YouTube: "text-red-500 bg-red-500/10 border-red-500/30",
    "Google Merchant": "text-blue-400 bg-blue-400/10 border-blue-400/30",
    Trustpilot: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    pinterest: "text-red-400 bg-red-400/10 border-red-400/30",
    google_merchant: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  };
  return map[platform] || "text-muted-foreground bg-muted border-border";
}

function statusBadge(status: string) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Connected
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-400/30 bg-amber-400/10">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Expired
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border bg-muted/40">
      <XCircle className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
// Connection Statuses Panel
// ─────────────────────────────────────────────────────────────

function ConnectionsPanel({ connections }: { connections: OffDomainConnection[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-blue-400" />
          Platform Connections
        </CardTitle>
        <CardDescription className="text-xs">
          OAuth status for off-domain networks
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2" data-testid="off-domain-connections">
          {connections.map((conn) => (
            <div key={conn.platform} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold ${platformColor(conn.platform)}`}>
                  {conn.platform.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-medium">{conn.platform}</span>
                  {conn.connected_at && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      Connected {timeAgo(conn.connected_at)}
                      {conn.scopes && ` \u00b7 ${conn.scopes}`}
                    </p>
                  )}
                </div>
              </div>
              {statusBadge(conn.status)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Entity Presence Radar Chart
// ─────────────────────────────────────────────────────────────

function EntityRadarChart({ data }: { data: EntityPresence[] }) {
  const chartData = data.map((d) => ({
    platform: d.platform,
    score: d.score,
    fullMark: 100,
  }));

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Globe className="h-4 w-4 text-violet-400" />
          Entity Presence Radar
        </CardTitle>
        <CardDescription className="text-xs">
          Brand visibility across the web (0-100 per platform)
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4" data-testid="entity-radar-chart">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="platform"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              axisLine={false}
            />
            <Radar
              name="Entity Score"
              dataKey="score"
              stroke="hsl(142, 71%, 45%)"
              fill="hsl(142, 71%, 45%)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number) => [`${value}/100`, "Score"]}
            />
          </RadarChart>
        </ResponsiveContainer>
        {/* Legend below chart */}
        <div className="flex flex-wrap gap-2 mt-2 justify-center">
          {data.map((d) => (
            <Badge
              key={d.platform}
              variant="outline"
              className={`text-[10px] font-mono ${d.score >= 60 ? "text-emerald-400 border-emerald-400/30" : d.score >= 40 ? "text-amber-400 border-amber-400/30" : "text-red-400 border-red-400/30"}`}
            >
              {d.platform}: {d.score}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Syndication Log
// ─────────────────────────────────────────────────────────────

function SyndicationLog({ entries }: { entries: SyndicationLogEntry[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Pin className="h-4 w-4 text-red-400" />
          Syndication Log
        </CardTitle>
        <CardDescription className="text-xs">
          Pins created and products pushed to external platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2" data-testid="syndication-log">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-7 w-7 rounded flex items-center justify-center ${entry.platform === "pinterest" ? "bg-red-400/10 text-red-400" : "bg-blue-400/10 text-blue-400"}`}>
                  {entry.platform === "pinterest" ? <Pin className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{entry.title}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                    <span>{entry.platform}</span>
                    <span>{entry.content_type}</span>
                    <span>{timeAgo(entry.created_at)}</span>
                  </div>
                </div>
              </div>
              <div>
                {entry.success ? (
                  <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Synced
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/30 bg-red-400/10">
                    <XCircle className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Barnacle Outreach Queue
// ─────────────────────────────────────────────────────────────

function BarnacleOutreach({ entries }: { entries: BarnacleOutreachEntry[] }) {
  function outreachBadge(status: string) {
    if (status === "awaiting_approval") {
      return (
        <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-400/30 bg-amber-400/10">
          <Clock className="h-3 w-3 mr-1" />
          Awaiting Approval
        </Badge>
      );
    }
    if (status === "sent") {
      return (
        <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
          <Mail className="h-3 w-3 mr-1" />
          Sent
        </Badge>
      );
    }
    if (status === "approved") {
      return (
        <Badge variant="outline" className="text-[10px] font-mono text-blue-400 border-blue-400/30 bg-blue-400/10">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approved
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] font-mono text-red-400 border-red-400/30 bg-red-400/10">
        <XCircle className="h-3 w-3 mr-1" />
        Rejected
      </Badge>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-violet-400" />
          Barnacle GEO Outreach
        </CardTitle>
        <CardDescription className="text-xs">
          Listicle inclusion requests queued for approval
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2" data-testid="barnacle-outreach">
          {entries.map((entry) => (
            <div key={entry.id} className="p-2.5 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium truncate max-w-[280px]" title={entry.target_title}>
                  {entry.target_title}
                </p>
                {outreachBadge(entry.status)}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                <span>Keyword: {entry.keyword}</span>
                <span>To: {entry.contact_name}</span>
                <span>{timeAgo(entry.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Review Routing Log
// ─────────────────────────────────────────────────────────────

function ReviewRoutingLog({ entries }: { entries: ReviewRoutingEntry[] }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          Review Routing
        </CardTitle>
        <CardDescription className="text-xs">
          Customer reviews algorithmically routed to highest-leverage platforms
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2" data-testid="review-routing-log">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div>
                <p className="text-xs font-medium">{entry.customer_name}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Order {entry.order_number} &middot; {timeAgo(entry.sent_at)}
                </p>
              </div>
              <Badge variant="outline" className={`text-[10px] font-mono ${entry.platform_routed === "Trustpilot" ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" : "text-orange-400 border-orange-400/30 bg-orange-400/10"}`}>
                {entry.platform_routed}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function OffDomain() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.offDomain(PROJECT_ID),
    queryFn: () => getOffDomainData(PROJECT_ID),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="off-domain-loading">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading Off-Domain Trust...
      </div>
    );
  }

  if (!data) return null;

  const { summary, connections, entity_presence, syndication_log, barnacle_outreach, review_routing } = data;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px]" data-testid="page-off-domain">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Globe className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Off-Domain Trust</h1>
            <p className="text-xs text-muted-foreground">
              Entity presence, syndication, barnacle outreach, and review routing
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="off-domain-kpis">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Entity Score</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-entity-score">{summary.entity_score}/100</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <LinkIcon className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Platforms</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-platforms">{summary.platforms_connected}/{connections.length}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Pin className="h-3.5 w-3.5 text-red-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Pins Created</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-pins">{summary.pins_created}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Outreach Pending</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-outreach">{summary.outreach_pending}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Reviews Routed</span>
            </div>
            <p className="text-xl font-semibold tabular-nums" data-testid="kpi-reviews">{summary.reviews_routed}</p>
          </Card>
        </div>

        {/* Radar + Connections side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EntityRadarChart data={entity_presence} />
          <ConnectionsPanel connections={connections} />
        </div>

        {/* Tabbed: Syndication / Outreach / Reviews */}
        <Tabs defaultValue="syndication" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="syndication" data-testid="tab-syndication">Syndication</TabsTrigger>
            <TabsTrigger value="outreach" data-testid="tab-barnacle">Barnacle GEO</TabsTrigger>
            <TabsTrigger value="reviews" data-testid="tab-reviews">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="syndication" className="mt-4">
            <SyndicationLog entries={syndication_log} />
          </TabsContent>

          <TabsContent value="outreach" className="mt-4">
            <BarnacleOutreach entries={barnacle_outreach} />
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <ReviewRoutingLog entries={review_routing} />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
