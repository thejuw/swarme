import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  sendManagerChat,
  getManagerRoadmap,
  deployRoadmapItem,
  updateRoadmapStatus,
  getUGCCampaigns,
  approveUGCCampaign,
  dismissUGCCampaign,
  getProprietaryReports,
  getProprietaryReport,
  publishProprietaryReport,
  getTelemetryStatus,
  queryKeys,
  type ManagerChatMessage,
  type AIRoadmapItem,
  type UGCCampaignEntry,
  type ProprietaryReport,
  type TelemetrySubsystem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  User,
  Send,
  Rocket,
  CheckCircle2,
  Sparkles,
  Loader2,
  BrainCircuit,
  ListChecks,
  ArrowUpRight,
  ImageIcon,
  Eye,
  Video,
  DollarSign,
  XCircle,
  Package,
  Activity,
  FileText,
  Globe,
  Code2,
  Database,
  Zap,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PROJECT_ID = "proj_001";

const WELCOME_MESSAGE: ManagerChatMessage = {
  role: "assistant",
  content:
    "Welcome to the Swarm. I'm your Chief Strategy Officer — let's build your growth engine.\n\nTo start, what is the URL of your primary storefront? I'll run a deep analysis and then we'll define your goals together.",
};

// ─────────────────────────────────────────────────────────────
// Priority badge colors
// ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const variant =
    priority === "High"
      ? "destructive"
      : priority === "Medium"
        ? "default"
        : "secondary";

  return (
    <Badge variant={variant} className="text-[10px] font-mono">
      {priority}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof Sparkles; className: string }> = {
    Suggested: { icon: Sparkles, className: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
    Approved: { icon: CheckCircle2, className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
    In_Progress: { icon: Loader2, className: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
    Completed: { icon: CheckCircle2, className: "text-muted-foreground border-muted-foreground/30 bg-muted/50" },
  };

  const { icon: Icon, className } = config[status] || config.Suggested;

  return (
    <Badge variant="outline" className={`text-[10px] font-mono gap-1 ${className}`}>
      <Icon className={`h-3 w-3 ${status === "In_Progress" ? "animate-spin" : ""}`} />
      {status.replace("_", " ")}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────
// Chat Panel
// ─────────────────────────────────────────────────────────────

function ChatPanel({
  messages,
  onSend,
  isSending,
}: {
  messages: ManagerChatMessage[];
  onSend: (text: string) => void;
  isSending: boolean;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setInput("");
  }, [input, isSending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="flex flex-col h-full border-0 rounded-none sm:border sm:rounded-lg">
      <CardHeader className="py-3 px-4 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-emerald-400" />
          AI Strategy Chat
        </CardTitle>
      </CardHeader>
      <Separator />

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            data-testid={`chat-message-${i}`}
          >
            <div
              className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${
                msg.role === "assistant"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {msg.role === "assistant" ? (
                <Bot className="h-4 w-4" />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex gap-3" data-testid="chat-loading">
            <div className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-emerald-500/15 text-emerald-400">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-3 border-t shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isSending}
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="shrink-0 h-10 w-10"
            data-testid="button-send-chat"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Roadmap Item Card
// ─────────────────────────────────────────────────────────────

function RoadmapItemCard({
  item,
  onDeploy,
  onComplete,
  isDeploying,
}: {
  item: AIRoadmapItem;
  onDeploy: (id: string) => void;
  onComplete: (id: string) => void;
  isDeploying: boolean;
}) {
  const isSuggested = item.status === "Suggested";
  const isApprovedOrRunning = item.status === "Approved" || item.status === "In_Progress";

  return (
    <div
      className={`group relative p-3 rounded-lg border transition-all ${
        isSuggested
          ? "border-amber-400/30 bg-amber-400/5 hover:border-amber-400/50"
          : item.status === "Completed"
            ? "border-muted opacity-60"
            : "border-border"
      }`}
      data-testid={`roadmap-item-${item.id}`}
    >
      {/* Suggested glow indicator */}
      {isSuggested && (
        <div className="absolute -top-px -left-px -right-px h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
      )}

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-medium leading-tight">{item.title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={item.status} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">
        {item.description}
      </p>

      {/* Phase 37: Visual preview placeholder — shows sandbox screenshot when available */}
      {isSuggested && (
        <div className="mb-2.5 rounded-md border border-dashed border-amber-400/30 bg-amber-400/5 overflow-hidden" data-testid={`preview-area-${item.id}`}>
          <div className="flex items-center justify-center gap-2 py-6 text-amber-400/60">
            <ImageIcon className="h-4 w-4" />
            <span className="text-[10px] font-mono">Preview will render after deploy</span>
          </div>
        </div>
      )}

      {isApprovedOrRunning && (
        <div className="mb-2.5 rounded-md border border-emerald-400/20 bg-emerald-400/5 overflow-hidden" data-testid={`preview-active-${item.id}`}>
          <div className="relative">
            {/* Mock preview thumbnail — in production this comes from Browser Rendering /crawl */}
            <div className="h-24 bg-gradient-to-br from-emerald-500/10 via-background to-emerald-500/5 flex items-center justify-center">
              <div className="text-center">
                <Eye className="h-4 w-4 text-emerald-400/40 mx-auto mb-1" />
                <span className="text-[10px] font-mono text-emerald-400/50">Live preview</span>
              </div>
            </div>
            <div className="absolute bottom-1 right-1">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1 text-emerald-400 hover:text-emerald-300">
                    <Eye className="h-3 w-3" />
                    Expand
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle className="text-sm">Visual Sandbox Preview — {item.title}</DialogTitle>
                  </DialogHeader>
                  <div className="rounded-lg border bg-muted/30 overflow-hidden">
                    <div className="h-80 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">Browser Rendering Preview</p>
                        <p className="text-xs text-muted-foreground mt-1">Screenshot from Cloudflare Browser Rendering /crawl endpoint</p>
                        <p className="text-[10px] font-mono text-muted-foreground/60 mt-2">1280 × 800 viewport · PNG · edge-native</p>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isSuggested && (
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => onDeploy(item.id)}
            disabled={isDeploying}
            data-testid={`button-deploy-${item.id}`}
          >
            {isDeploying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Rocket className="h-3 w-3" />
            )}
            Approve & Deploy
          </Button>
        )}

        {isApprovedOrRunning && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => onComplete(item.id)}
            data-testid={`button-complete-${item.id}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            Mark Complete
          </Button>
        )}

        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UGC Campaign Action Card (Phase 50)
// ─────────────────────────────────────────────────────────────

function UGCCampaignCard({
  entry,
  onApprove,
  onDismiss,
  isApproving,
}: {
  entry: UGCCampaignEntry;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  isApproving: boolean;
}) {
  return (
    <div
      className="group relative p-3 rounded-lg border border-violet-400/30 bg-violet-400/5 hover:border-violet-400/50 transition-all"
      data-testid={`ugc-campaign-${entry.id}`}
    >
      {/* Top glow */}
      <div className="absolute -top-px -left-px -right-px h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-violet-500/15 flex items-center justify-center">
            <Package className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <h4 className="text-sm font-medium leading-tight">
            New Product Detected: {entry.product_name}
          </h4>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono gap-1 text-violet-400 border-violet-400/30 bg-violet-400/10">
          <Video className="h-3 w-3" />
          UGC
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">
        I noticed you added this to the catalog. Would you like me to dispatch a
        brief to our Creator Network (Billo/Insense) to generate 3 YouTube/TikTok
        review videos for GEO seeding? Estimated budget: ${entry.estimated_budget}.
      </p>

      {/* Budget indicator */}
      <div className="mb-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-violet-500/5 border border-violet-400/15">
        <DollarSign className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-[11px] font-mono text-violet-300">
          ${entry.estimated_budget} · 3 creator videos · YouTube + TikTok
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700"
          onClick={() => onApprove(entry.id)}
          disabled={isApproving}
          data-testid={`button-ugc-approve-${entry.id}`}
        >
          {isApproving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Rocket className="h-3 w-3" />
          )}
          Approve & Fund
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={() => onDismiss(entry.id)}
          data-testid={`button-ugc-dismiss-${entry.id}`}
        >
          <XCircle className="h-3 w-3" />
          Dismiss
        </Button>

        <span className="text-[10px] text-muted-foreground font-mono ml-auto">
          {new Date(entry.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Roadmap Panel
// ─────────────────────────────────────────────────────────────

function RoadmapPanel() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.managerRoadmap(PROJECT_ID),
    queryFn: () => getManagerRoadmap(PROJECT_ID),
    refetchInterval: 5000, // Poll for new items from AI
  });

  // Phase 50: UGC campaign suggestions query
  const { data: ugcData } = useQuery({
    queryKey: queryKeys.ugcCampaigns(PROJECT_ID),
    queryFn: () => getUGCCampaigns(PROJECT_ID),
    refetchInterval: 10000,
  });

  const deployMutation = useMutation({
    mutationFn: (taskId: string) => deployRoadmapItem(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.managerRoadmap(PROJECT_ID),
      });
      toast({
        title: "Deployed to Swarm",
        description: `Task ${taskId.slice(0, 12)}... sent to the execution queue.`,
      });
    },
    onError: () => {
      toast({
        title: "Deploy failed",
        description: "Could not dispatch the task. Try again.",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => updateRoadmapStatus(taskId, "Completed"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.managerRoadmap(PROJECT_ID),
      });
    },
  });

  // Phase 50: UGC approve + dismiss mutations
  const ugcApproveMutation = useMutation({
    mutationFn: (ledgerId: string) => approveUGCCampaign(PROJECT_ID, ledgerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ugcCampaigns(PROJECT_ID) });
      toast({
        title: "Creator Brief Dispatched",
        description: "The UGC campaign is now in progress. Briefs have been sent to the Creator Network.",
      });
    },
    onError: () => {
      toast({
        title: "Dispatch failed",
        description: "Could not send the creator brief. Try again.",
        variant: "destructive",
      });
    },
  });

  const ugcDismissMutation = useMutation({
    mutationFn: (ledgerId: string) => dismissUGCCampaign(PROJECT_ID, ledgerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ugcCampaigns(PROJECT_ID) });
      toast({ title: "Dismissed", description: "This product will not be suggested again." });
    },
  });

  const ugcSuggested = (ugcData?.entries ?? []).filter((e) => e.status === "suggested");

  const items = data?.items ?? [];
  const suggested = items.filter((i) => i.status === "Suggested");
  const active = items.filter(
    (i) => i.status === "Approved" || i.status === "In_Progress"
  );
  const completed = items.filter((i) => i.status === "Completed");

  return (
    <Card className="flex flex-col h-full border-0 rounded-none sm:border sm:rounded-lg">
      <CardHeader className="py-3 px-4 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-400" />
            Strategy Roadmap
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {items.length} items
          </Badge>
        </CardTitle>
      </CardHeader>
      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading roadmap...
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="text-center py-10 text-muted-foreground" data-testid="roadmap-empty">
              <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium mb-1">No strategy items yet</p>
              <p className="text-xs">
                Chat with the AI Manager to generate your growth roadmap.
              </p>
            </div>
          )}

          {/* Phase 50: UGC Campaign Suggestions */}
          {ugcSuggested.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Video className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  UGC Campaigns
                </span>
                <Badge variant="outline" className="text-[10px] font-mono ml-auto text-violet-400 border-violet-400/30">
                  {ugcSuggested.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {ugcSuggested.map((entry) => (
                  <UGCCampaignCard
                    key={entry.id}
                    entry={entry}
                    onApprove={(id) => ugcApproveMutation.mutate(id)}
                    onDismiss={(id) => ugcDismissMutation.mutate(id)}
                    isApproving={ugcApproveMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Suggested items (glowing section) */}
          {suggested.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Awaiting Your Approval
                </span>
                <Badge variant="outline" className="text-[10px] font-mono ml-auto text-amber-400 border-amber-400/30">
                  {suggested.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {suggested.map((item) => (
                  <RoadmapItemCard
                    key={item.id}
                    item={item}
                    onDeploy={(id) => deployMutation.mutate(id)}
                    onComplete={(id) => completeMutation.mutate(id)}
                    isDeploying={deployMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active items */}
          {active.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active
                </span>
                <Badge variant="outline" className="text-[10px] font-mono ml-auto">
                  {active.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {active.map((item) => (
                  <RoadmapItemCard
                    key={item.id}
                    item={item}
                    onDeploy={(id) => deployMutation.mutate(id)}
                    onComplete={(id) => completeMutation.mutate(id)}
                    isDeploying={deployMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed items */}
          {completed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Completed
                </span>
                <Badge variant="outline" className="text-[10px] font-mono ml-auto">
                  {completed.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {completed.map((item) => (
                  <RoadmapItemCard
                    key={item.id}
                    item={item}
                    onDeploy={(id) => deployMutation.mutate(id)}
                    onComplete={(id) => completeMutation.mutate(id)}
                    isDeploying={deployMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase 53: Current State Telemetry Widget
// ─────────────────────────────────────────────────────────────

const TELEMETRY_ICONS: Record<string, typeof Activity> = {
  llms_txt: Globe,
  rag_bait: Code2,
  proprietary_reports: FileText,
  content_indexed: Database,
  data_synthesizer: Zap,
};

const TELEMETRY_LABELS: Record<string, string> = {
  llms_txt: "/llms.txt Router",
  rag_bait: "RAG-Bait Injector",
  proprietary_reports: "Proprietary Reports",
  content_indexed: "Content Indexed",
  data_synthesizer: "Data Synthesizer",
};

const EXPLAIN_TEXTS: Record<string, string> = {
  llms_txt:
    "I am currently translating your website's architecture into /llms.txt format. This removes the visual code and feeds pure, structured data directly to Google's Gemini and OpenAI, ensuring they understand your products without friction.",
  rag_bait:
    "The RAG-Bait Injector places invisible, factual summary blocks after each section heading in your HTML. AI crawlers extract these pre-digested answer blocks and are more likely to cite them verbatim when users ask about your products.",
  proprietary_reports:
    "When your store hits data milestones (e.g., 10,000 orders), I synthesize your anonymized first-party data into proprietary research reports. Publishing original data makes your brand a primary citation source for AI engines.",
  content_indexed:
    "Every published content piece on your site is indexed into the /llms.txt manifest. More indexed content means more surface area for AI engines to discover and cite your brand.",
  data_synthesizer:
    "The Data Synthesizer runs weekly, scanning your aggregated metrics for milestone triggers. When a threshold is crossed, it generates a draft report for your review before publishing.",
};

function TelemetryWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["manager", "telemetry-status", PROJECT_ID],
    queryFn: () => getTelemetryStatus(PROJECT_ID),
    refetchInterval: 60000,
  });

  const [explainKey, setExplainKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Current State
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const status = data?.status;
  if (!status) return null;

  return (
    <Card className="border-dashed" data-testid="telemetry-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Current State — AI Parsing Subsystems
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {Object.entries(status).map(([key, sub]) => {
          const Icon = TELEMETRY_ICONS[key] ?? Activity;
          const label = TELEMETRY_LABELS[key] ?? key;
          const subsystem = sub as TelemetrySubsystem;
          const isActive = subsystem.active !== false;

          return (
            <div
              key={key}
              className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
              data-testid={`telemetry-${key}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"
                }`} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium truncate">{label}</span>
                {subsystem.total !== undefined && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {subsystem.total}
                  </Badge>
                )}
                {subsystem.summaries_cached !== undefined && subsystem.summaries_cached > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {subsystem.summaries_cached} cached
                  </Badge>
                )}
              </div>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setExplainKey(explainKey === key ? null : key)}
                      data-testid={`explain-${key}`}
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs">Explain This</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}

        {/* Explain This expandable panel */}
        {explainKey && EXPLAIN_TEXTS[explainKey] && (
          <div
            className="mt-2 p-3 rounded-md bg-primary/5 border border-primary/10 text-xs text-muted-foreground leading-relaxed"
            data-testid="explain-panel"
          >
            <div className="flex items-start gap-2">
              <BrainCircuit className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground mb-1">
                  {TELEMETRY_LABELS[explainKey]}
                </p>
                <p>{EXPLAIN_TEXTS[explainKey]}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase 52: Proprietary Reports Panel
// ─────────────────────────────────────────────────────────────

function ProprietaryReportsPanel() {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ProprietaryReport | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["manager", "reports", PROJECT_ID],
    queryFn: () => getProprietaryReports(PROJECT_ID),
  });

  const publishMutation = useMutation({
    mutationFn: (reportId: string) => publishProprietaryReport(PROJECT_ID, reportId),
    onSuccess: () => {
      toast({ title: "Report Published", description: "The report has been published to your CMS." });
      queryClient.invalidateQueries({ queryKey: ["manager", "reports", PROJECT_ID] });
      setSelectedReport(null);
    },
    onError: () => {
      toast({ title: "Publish Failed", description: "Could not publish the report.", variant: "destructive" });
    },
  });

  const viewReportMutation = useMutation({
    mutationFn: (reportId: string) => getProprietaryReport(PROJECT_ID, reportId),
    onSuccess: (data) => {
      if (data.success && data.report) {
        setSelectedReport(data.report);
      }
    },
  });

  const reports = data?.reports ?? [];
  if (isLoading || reports.length === 0) return null;

  const drafts = reports.filter((r) => r.status === "draft");
  const published = reports.filter((r) => r.status === "published");

  return (
    <Card data-testid="proprietary-reports-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Proprietary Reports
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {reports.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {drafts.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Awaiting Review ({drafts.length})
            </p>
            {drafts.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 rounded-md border border-amber-500/20 bg-amber-500/5 mb-1.5"
                data-testid={`report-draft-${r.id}`}
              >
                <div className="min-w-0 flex-1 mr-2">
                  <p className="text-xs font-medium truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Generated {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => viewReportMutation.mutate(r.id)}
                        data-testid={`view-report-${r.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Review
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="text-base">{selectedReport?.title ?? r.title}</DialogTitle>
                      </DialogHeader>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap text-xs bg-muted p-4 rounded-md">
                          {selectedReport?.report_markdown ?? "Loading..."}
                        </pre>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          onClick={() => publishMutation.mutate(r.id)}
                          disabled={publishMutation.isPending}
                          data-testid={`publish-report-${r.id}`}
                        >
                          {publishMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Approve & Publish to CMS
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
        )}

        {published.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Published ({published.length})
            </p>
            {published.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/30 mb-1"
                data-testid={`report-published-${r.id}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Published {new Date(r.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

// Proactive companion message injected when milestone reports exist
const PROACTIVE_MILESTONE_MESSAGE: ManagerChatMessage = {
  role: "assistant",
  content:
    `\ud83c\udfaf **Milestone Alert: Data-Driven Opportunity**\n\n` +
    `We just crossed a massive data milestone: **10,000 total orders**. ` +
    `I have aggregated our anonymized checkout data.\n\n` +
    `Would you like me to synthesize this into a proprietary **"2026 Consumer Buying Trends"** report?\n\n` +
    `Publishing original data makes your brand a **primary citation source** for AI engines ` +
    `like ChatGPT, Gemini, and Perplexity. When journalists or researchers ask these models ` +
    `about buying trends in your industry, they'll cite *your* data \u2014 not a competitor's.\n\n` +
    `\ud83d\udcc4 **Draft report ready.** Check the Proprietary Reports panel on the right to review it.`,
};

const PROACTIVE_TELEMETRY_MESSAGE: ManagerChatMessage = {
  role: "assistant",
  content:
    `\ud83d\udd0d **AI Parsing Status Update**\n\n` +
    `I am currently translating your website's architecture into \`/llms.txt\` format. ` +
    `This removes the visual code and feeds pure, structured data directly to Google's ` +
    `Gemini and OpenAI, ensuring they understand your products without friction.\n\n` +
    `**Active subsystems:**\n` +
    `\u2022 \`/llms.txt\` Dynamic Router \u2014 serving structured product data to AI crawlers\n` +
    `\u2022 RAG-Bait Injector \u2014 placing hidden answer blocks in your HTML for citation extraction\n` +
    `\u2022 Data Synthesizer \u2014 scanning weekly for report-triggering milestones\n\n` +
    `Check the **Current State** widget on the right panel for live status. ` +
    `Click the **?** button next to any subsystem for a detailed explanation.`,
};

// ─────────────────────────────────────────────────────────────
// Phase 57: Agent Failsafe Kill-Switch Banner
// ─────────────────────────────────────────────────────────────

export default function AiManager() {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([
    WELCOME_MESSAGE,
    PROACTIVE_TELEMETRY_MESSAGE,
    PROACTIVE_MILESTONE_MESSAGE,
  ]);
  const { toast } = useToast();

  const chatMutation = useMutation({
    mutationFn: (userMessages: ManagerChatMessage[]) =>
      sendManagerChat(PROJECT_ID, userMessages),
    onSuccess: (data) => {
      if (data.success && data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);

        // Refresh roadmap if items were added
        if (data.roadmap_items_added > 0) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.managerRoadmap(PROJECT_ID),
          });
        }
      } else {
        toast({
          title: "AI Error",
          description: data.error || "Failed to get a response.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Connection Error",
        description: "Could not reach the AI Manager. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: ManagerChatMessage = { role: "user", content: text };
      const updated = [...messages, userMsg];
      setMessages(updated);
      chatMutation.mutate(updated);
    },
    [messages, chatMutation]
  );

  return (
    <div className="h-full flex flex-col" data-testid="page-ai-manager">
    <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
      {/* Left: Chat Panel */}
      <div className="flex-1 min-w-0 sm:max-w-[55%]">
        <ChatPanel
          messages={messages}
          onSend={handleSend}
          isSending={chatMutation.isPending}
        />
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px bg-border" />
      <Separator className="sm:hidden" />

      {/* Right: Roadmap + Telemetry + Reports Panel */}
      <div className="flex-1 min-w-0 sm:max-w-[45%] flex flex-col gap-0">
        {/* Telemetry Widget (Phase 53) */}
        <div className="p-3 pb-0">
          <TelemetryWidget />
        </div>

        {/* Proprietary Reports (Phase 52) */}
        <div className="p-3 pb-0">
          <ProprietaryReportsPanel />
        </div>

        {/* Roadmap Panel */}
        <div className="flex-1 min-h-0">
          <RoadmapPanel />
        </div>
      </div>
    </div>
    </div>
  );
}
