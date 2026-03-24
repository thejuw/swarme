/**
 * ChatOps Tab — Phase 68
 *
 * Admin settings tab for the Executive ChatOps Interface.
 * Sections:
 *   1. Channel Connections — Enable/disable channels, configure credentials
 *   2. Command History — Recent commands with intent, status, channel
 *   3. Active Sessions — Current conversation sessions
 *   4. Webhook URLs — Copy-paste webhook endpoints for each platform
 *   5. Configuration — Global ChatOps settings
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  MessageSquare,
  Hash,
  Phone,
  Send,
  Bot,
  Shield,
  Clock,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings2,
  History,
  Users,
  Link2,
  ToggleLeft,
  ToggleRight,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

// ── Types ────────────────────────────────────────────────────

interface Channel {
  id: string;
  channel_type: string;
  display_name: string;
  enabled: number;
  config_json: string;
  webhook_url: string;
  last_message_at: string | null;
  total_commands: number;
}

interface ChatOpsCommand {
  id: string;
  intent: string;
  status: string;
  source_channel: string;
  user_name: string;
  original_text: string;
  parser_method: string;
  created_at: string;
}

interface Session {
  id: string;
  channel_type: string;
  user_id: string;
  user_name: string;
  message_count: number;
  last_intent: string;
  last_active_at: string;
}

interface ChatOpsStats {
  total_commands: number;
  commands_today: number;
  active_channels: number;
  active_sessions: number;
  top_intent: string;
}

// ── Channel Icons & Colors ───────────────────────────────────

const CHANNEL_META: Record<string, { icon: typeof MessageSquare; color: string; tier: string }> = {
  slack: { icon: Hash, color: "text-purple-500", tier: "Enterprise" },
  teams: { icon: Users, color: "text-blue-500", tier: "Enterprise" },
  whatsapp: { icon: Phone, color: "text-green-500", tier: "Boutique" },
  telegram: { icon: Send, color: "text-sky-500", tier: "Technical" },
  discord: { icon: Bot, color: "text-indigo-500", tier: "Technical" },
  sms: { icon: Phone, color: "text-orange-500", tier: "Emergency" },
};

// ── Component ────────────────────────────────────────────────

export function ChatOpsTab() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Queries
  const channelsQuery = useQuery<{ success: boolean; channels: Channel[] }>({
    queryKey: ["/api/admin/chatops/channels"],
  });

  const commandsQuery = useQuery<{ success: boolean; commands: ChatOpsCommand[] }>({
    queryKey: ["/api/admin/chatops/commands"],
  });

  const sessionsQuery = useQuery<{ success: boolean; sessions: Session[] }>({
    queryKey: ["/api/admin/chatops/sessions"],
  });

  const statsQuery = useQuery<{ success: boolean; stats: ChatOpsStats }>({
    queryKey: ["/api/admin/chatops/stats"],
  });

  const channels = channelsQuery.data?.channels || [];
  const commands = commandsQuery.data?.commands || [];
  const sessions = sessionsQuery.data?.sessions || [];
  const stats = statsQuery.data?.stats;

  // Mutations
  const toggleChannelMutation = useMutation({
    mutationFn: async ({ channelType, enabled }: { channelType: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/chatops/channels/${channelType}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chatops/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chatops/stats"] });
    },
  });

  const baseUrl = "https://api.swarme.io/api/chatops";

  function copyWebhookUrl(channel: string) {
    const url = `${baseUrl}/${channel}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrl(channel);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  return (
    <div className="space-y-8" data-testid="chatops-tab">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5" />
          ChatOps Interface
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Omnichannel executive command center. Receive natural language commands
          from Slack, Teams, WhatsApp, Telegram, Discord, or SMS and execute them
          through the durable Workflows engine.
        </p>
      </div>

      <Separator />

      {/* ── Overview Stats ──────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={MessageSquare} label="Total Commands" value={String(stats.total_commands)} />
          <StatCard icon={Clock} label="Today" value={String(stats.commands_today)} />
          <StatCard
            icon={CheckCircle2}
            label="Active Channels"
            value={String(stats.active_channels)}
            variant={stats.active_channels > 0 ? "success" : "muted"}
          />
          <StatCard icon={Users} label="Sessions" value={String(stats.active_sessions)} />
          <StatCard icon={Zap} label="Top Intent" value={stats.top_intent || "none"} />
        </div>
      )}

      <Separator />

      {/* ── Section 1: Channel Connections ───────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Channel Connections
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Enable channels and configure their credentials. Webhook URLs are
          provided below for each platform's bot configuration.
        </p>

        <div className="space-y-2">
          {channels.map((ch) => {
            const meta = CHANNEL_META[ch.channel_type] || { icon: MessageSquare, color: "text-muted-foreground", tier: "Other" };
            const Icon = meta.icon;
            const isEnabled = ch.enabled === 1;

            return (
              <div
                key={ch.id}
                className="flex items-center justify-between bg-muted/20 rounded-lg px-4 py-3 border border-border/30"
                data-testid={`channel-row-${ch.channel_type}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${meta.color}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{ch.display_name}</p>
                      <Badge variant="outline" className="text-[10px]">{meta.tier}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {ch.total_commands} commands
                      {ch.last_message_at
                        ? ` | Last: ${new Date(ch.last_message_at).toLocaleDateString()}`
                        : " | No messages yet"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={isEnabled ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {isEnabled ? "Connected" : "Disabled"}
                  </Badge>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) =>
                      toggleChannelMutation.mutate({
                        channelType: ch.channel_type,
                        enabled: checked,
                      })
                    }
                    data-testid={`toggle-${ch.channel_type}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* ── Section 2: Webhook URLs ─────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Webhook Endpoints
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Configure these URLs in each platform's bot/webhook settings.
          All endpoints validate platform-specific signatures.
        </p>

        <div className="space-y-1.5">
          {["slack", "teams", "whatsapp", "telegram", "discord", "sms"].map((ch) => (
            <div
              key={ch}
              className="flex items-center justify-between bg-muted/10 rounded px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium capitalize w-20">{ch}</span>
                <code className="text-[11px] text-muted-foreground font-mono">
                  {baseUrl}/{ch}
                </code>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyWebhookUrl(ch)}
                className="h-7"
                data-testid={`copy-url-${ch}`}
              >
                {copiedUrl === ch ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Section 3: Command History ──────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent Commands
        </h3>
        {commandsQuery.isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3 animate-pulse h-10" />
            ))}
          </div>
        ) : commands.length === 0 ? (
          <p className="text-xs text-muted-foreground">No commands received yet.</p>
        ) : (
          <div className="space-y-1.5">
            {commands.slice(0, 15).map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between bg-muted/10 rounded px-3 py-2 text-xs"
                data-testid={`command-${cmd.id}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <StatusIcon status={cmd.status} />
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {cmd.source_channel}
                  </Badge>
                  <span className="font-medium shrink-0">{cmd.intent}</span>
                  <span className="text-muted-foreground truncate">{cmd.original_text}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge
                    variant={cmd.parser_method === "ai" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {cmd.parser_method}
                  </Badge>
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(cmd.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 4: Active Sessions ──────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Active Sessions
        </h3>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active sessions.</p>
        ) : (
          <div className="space-y-1.5">
            {sessions.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-muted/10 rounded px-3 py-2 text-xs"
                data-testid={`session-${s.id}`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{s.channel_type}</Badge>
                  <span className="font-medium">{s.user_name || s.user_id}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{s.message_count} msgs</span>
                  <span>Last: {s.last_intent || "none"}</span>
                  <span>
                    {new Date(s.last_active_at).toLocaleString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Section 5: Configuration ────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Global Configuration
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <ConfigRow label="Intent Parser" value="Workers AI (Llama 3.1 8B) + Rule-based fallback" />
          <ConfigRow label="Execution Engine" value="Cloudflare Workflows (durable, retryable)" />
          <ConfigRow label="Signature Validation" value="HMAC-SHA256 (Slack, Twilio) / Ed25519 (Discord)" />
          <ConfigRow label="Boundary Policy" value="Moltworker: Interface only | Workflows: Execution only" />
          <ConfigRow label="PII Handling" value="No raw messages stored in KV; D1 audit log only" />
          <ConfigRow label="Response Routing" value="Bidirectional — Workflows callbacks to originating channel" />
          <ConfigRow label="Emergency Protocol" value="'emergency stop' via any channel activates doomsday" />
          <ConfigRow label="Content Approval" value="All content ops require human operator confirmation" />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "failed":
    case "rejected":
      return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case "processing":
      return <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0 animate-pulse" />;
    default:
      return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: typeof MessageSquare;
  label: string;
  value: string;
  variant?: "default" | "success" | "muted";
}) {
  const colorMap = {
    default: "text-foreground",
    success: "text-green-600 dark:text-green-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className="bg-muted/20 rounded-lg px-3 py-2.5 border border-border/30">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${colorMap[variant]}`}>{value}</p>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/10 rounded px-3 py-2 border border-border/20">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}
