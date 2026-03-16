import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  sendManagerChat,
  getManagerRoadmap,
  deployRoadmapItem,
  updateRoadmapStatus,
  queryKeys,
  type ManagerChatMessage,
  type AIRoadmapItem,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  User,
  Send,
  Rocket,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  BrainCircuit,
  ListChecks,
  ArrowUpRight,
  ChevronRight,
  ImageIcon,
  Eye,
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
// Roadmap Panel
// ─────────────────────────────────────────────────────────────

function RoadmapPanel() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.managerRoadmap(PROJECT_ID),
    queryFn: () => getManagerRoadmap(PROJECT_ID),
    refetchInterval: 5000, // Poll for new items from AI
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
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function AiManager() {
  const [messages, setMessages] = useState<ManagerChatMessage[]>([WELCOME_MESSAGE]);
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
    <div className="h-full flex flex-col sm:flex-row" data-testid="page-ai-manager">
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

      {/* Right: Roadmap Panel */}
      <div className="flex-1 min-w-0 sm:max-w-[45%]">
        <RoadmapPanel />
      </div>
    </div>
  );
}
