/**
 * Comms — Unified Swarme Inbox at /#/comms
 *
 * Displays email threads initiated by Swarme agents (outreach pitches,
 * review requests). Chat-like UI lets the user read replies and manually
 * take over conversations to finalize deals.
 *
 * Two routing engines feed into this inbox:
 *   1. OAuth Engine (Gmail/MS365) → high-touch outreach to bloggers/influencers
 *   2. Resend Engine (transactional) → post-purchase review requests
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getCommsThreads,
  getCommsThread,
  replyToCommsThread,
  queryKeys,
  type CommsThreadPreview,
  type CommsThread,
  type CommsMessage,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProjectId } from "@/hooks/use-project-id";
import {
  Inbox,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  ArrowLeft,
  MessageSquare,
  User,
  Bot,
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  needs_reply: { label: "Needs Reply", color: "bg-red-500/10 text-red-400 border-red-500/25", icon: AlertCircle },
  awaiting: { label: "Awaiting Response", color: "bg-amber-500/10 text-amber-400 border-amber-500/25", icon: Clock },
  replied: { label: "Replied", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function extractName(email: string): string {
  const local = email.split("@")[0];
  return local
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ThreadList({
  threads,
  isLoading,
  selectedId,
  onSelect,
}: {
  threads: CommsThreadPreview[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {threads.map((thread) => {
        const sc = statusConfig[thread.status] || statusConfig.awaiting;
        const isSelected = thread.id === selectedId;
        const otherParticipant = thread.participants[1] || thread.participants[0];
        return (
          <button
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            className={`w-full text-left p-3 rounded-lg transition-colors ${
              isSelected
                ? "bg-primary/10 border border-primary/25"
                : "hover:bg-muted/50 border border-transparent"
            }`}
            data-testid={`thread-item-${thread.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${sc.color}`}>
                    {sc.label}
                  </Badge>
                  {thread.campaign_id ? (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">outreach</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">transactional</Badge>
                  )}
                </div>
                <p className="text-sm font-medium truncate">{extractName(otherParticipant)}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.subject}</p>
                <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                  {thread.last_message_preview}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground">{timeAgo(thread.last_message_at)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{thread.message_count} msg{thread.message_count !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ThreadView({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
}) {
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.commsThread(PROJECT_ID, threadId),
    queryFn: () => getCommsThread(PROJECT_ID, threadId),
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => replyToCommsThread(PROJECT_ID, threadId, body),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: queryKeys.commsThread(PROJECT_ID, threadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.commsThreads(PROJECT_ID) });
    },
  });

  const thread = data?.thread;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-4 flex-1">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-3/4" />
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Thread not found
      </div>
    );
  }

  const otherEmail = thread.participants[1] || thread.participants[0];
  const sc = statusConfig[thread.status] || statusConfig.awaiting;

  return (
    <div className="flex flex-col h-full" data-testid="thread-view">
      {/* Thread header */}
      <div className="p-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{thread.subject}</p>
              <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${sc.color}`}>
                {sc.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              with {extractName(otherEmail)} ({otherEmail})
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-4 max-w-2xl mx-auto">
          {thread.messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isOutbound ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.id}`}
              >
                {!isOutbound && (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
                    isOutbound
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/60 border border-border/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {isOutbound && <Bot className="h-3 w-3 text-primary/70" />}
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {isOutbound ? "Swarme" : extractName(msg.from)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(msg.sent_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-line leading-relaxed">{msg.body}</p>
                </div>
                {isOutbound && (
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Reply compose */}
      <div className="p-3 border-t border-border/50 shrink-0">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Take over the conversation..."
            className="min-h-[60px] max-h-[120px] resize-none text-sm"
            data-testid="input-reply"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && replyText.trim()) {
                replyMutation.mutate(replyText.trim());
              }
            }}
          />
          <Button
            size="icon"
            className="h-[60px] w-10 shrink-0"
            disabled={!replyText.trim() || replyMutation.isPending}
            onClick={() => replyText.trim() && replyMutation.mutate(replyText.trim())}
            data-testid="button-send-reply"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Ctrl+Enter to send \u2022 Sent from your connected outbox via OAuth
        </p>
      </div>
    </div>
  );
}

export default function CommsPage() {
  const PROJECT_ID = useProjectId();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.commsThreads(PROJECT_ID),
    queryFn: () => getCommsThreads(PROJECT_ID),
    refetchInterval: 15_000,
  });

  const threads = data?.threads || [];
  const summary = data?.summary;

  return (
    <div className="h-full flex flex-col" data-testid="page-comms">
      <div className="p-4 pb-0">
        <h2 className="text-lg font-semibold tracking-tight">Comms</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Unified inbox for all Swarme-initiated conversations. Review replies and take over to close deals.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 pt-3">
        <Card className="border-border/50" data-testid="card-needs-reply">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Needs Reply</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold tabular-nums text-red-400">{summary?.needs_reply ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50" data-testid="card-awaiting">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Awaiting Response</CardTitle>
            <Clock className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold tabular-nums text-amber-400">{summary?.awaiting ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50" data-testid="card-replied">
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Replied</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold tabular-nums text-emerald-400">{summary?.replied ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main content: thread list + thread view */}
      <div className="flex-1 mt-3 px-4 pb-4 min-h-0">
        <Card className="border-border/50 h-full overflow-hidden" data-testid="comms-panel">
          <div className="flex h-full">
            {/* Thread list sidebar */}
            <div className={`border-r border-border/50 shrink-0 overflow-y-auto ${selectedThreadId ? "hidden sm:block w-[320px]" : "w-full sm:w-[320px]"}`}>
              <div className="p-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Threads</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">{threads.length}</Badge>
                </div>
              </div>
              <ScrollArea className="h-[calc(100%-44px)]">
                <ThreadList
                  threads={threads}
                  isLoading={isLoading}
                  selectedId={selectedThreadId}
                  onSelect={setSelectedThreadId}
                />
              </ScrollArea>
            </div>

            {/* Thread detail view */}
            <div className={`flex-1 min-w-0 ${!selectedThreadId ? "hidden sm:flex items-center justify-center" : ""}`}>
              {selectedThreadId ? (
                <ThreadView threadId={selectedThreadId} onBack={() => setSelectedThreadId(null)} />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Mail className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a thread to view the conversation</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
