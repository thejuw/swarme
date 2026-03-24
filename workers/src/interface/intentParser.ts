/**
 * ============================================================
 * Swarme — Phase 68: Intent Parser
 * ============================================================
 *
 * Extracts structured intent from natural language messages.
 * Uses Workers AI (@cf/meta/llama-3.1-8b-instruct) for NLP,
 * with a rule-based fallback for common command patterns.
 *
 * Supported Intents:
 *   - deploy_rule       — Push new HTMLRewriter / edge rules
 *   - update_config     — Change KV configuration
 *   - check_status      — Query system health and metrics
 *   - run_audit         — Trigger visibility or site audit
 *   - manage_content    — Content operations (draft, approve, schedule)
 *   - manage_agents     — Agent task control (pause, resume, reassign)
 *   - query_analytics   — Analytics and reporting queries
 *   - emergency_stop    — Doomsday protocol / circuit breaker
 *   - help              — Show available commands
 *   - unknown           — Unrecognized intent (ask for clarification)
 *
 * The parser produces a ChatOpsCommand payload that the
 * orchestrator Workflow consumes for durable execution.
 * ============================================================
 */

import type { Env } from "../index";
import type { NormalizedMessage } from "./moltworker";
import type { ChannelType } from "./channelAdapters";

// ── Types ────────────────────────────────────────────────────

export interface ChatOpsCommand {
  id: string;
  intent: IntentType;
  confidence: number;
  parameters: Record<string, any>;
  original_text: string;

  // Appended by moltworker before Workflow dispatch
  source_channel: ChannelType;
  channel_id: string;
  thread_id?: string;
  user_id: string;
  user_name: string;

  // Metadata
  parsed_at: string;
  parser_method: "ai" | "rule" | "fallback";
}

export type IntentType =
  | "deploy_rule"
  | "update_config"
  | "check_status"
  | "run_audit"
  | "manage_content"
  | "manage_agents"
  | "query_analytics"
  | "emergency_stop"
  | "help"
  | "unknown";

// ── Main Parser ──────────────────────────────────────────────

export async function parseIntent(
  env: Env,
  msg: NormalizedMessage,
): Promise<ChatOpsCommand | null> {
  const text = msg.text.trim();
  if (!text || text.length < 2) return null;

  const commandId = `cmd_${crypto.randomUUID().slice(0, 12)}`;

  // Try rule-based parsing first (fast, no AI call)
  const ruleResult = ruleBasedParse(text);
  if (ruleResult && ruleResult.confidence >= 0.8) {
    return {
      id: commandId,
      ...ruleResult,
      original_text: text,
      source_channel: msg.source_channel,
      channel_id: msg.channel_id,
      thread_id: msg.thread_id,
      user_id: msg.user_id,
      user_name: msg.user_name,
      parsed_at: new Date().toISOString(),
      parser_method: "rule",
    };
  }

  // Try AI-based parsing for complex/ambiguous messages
  try {
    const aiResult = await aiBasedParse(env, text);
    if (aiResult) {
      return {
        id: commandId,
        ...aiResult,
        original_text: text,
        source_channel: msg.source_channel,
        channel_id: msg.channel_id,
        thread_id: msg.thread_id,
        user_id: msg.user_id,
        user_name: msg.user_name,
        parsed_at: new Date().toISOString(),
        parser_method: "ai",
      };
    }
  } catch (err) {
    console.warn("[IntentParser] AI parse failed, using fallback:", err);
  }

  // Fallback: if rule-based had a low-confidence match, use it
  if (ruleResult) {
    return {
      id: commandId,
      ...ruleResult,
      original_text: text,
      source_channel: msg.source_channel,
      channel_id: msg.channel_id,
      thread_id: msg.thread_id,
      user_id: msg.user_id,
      user_name: msg.user_name,
      parsed_at: new Date().toISOString(),
      parser_method: "fallback",
    };
  }

  // Unknown intent — return for clarification
  return {
    id: commandId,
    intent: "unknown",
    confidence: 0,
    parameters: {},
    original_text: text,
    source_channel: msg.source_channel,
    channel_id: msg.channel_id,
    thread_id: msg.thread_id,
    user_id: msg.user_id,
    user_name: msg.user_name,
    parsed_at: new Date().toISOString(),
    parser_method: "fallback",
  };
}

// ── Rule-Based Parser ────────────────────────────────────────

interface ParseResult {
  intent: IntentType;
  confidence: number;
  parameters: Record<string, any>;
}

const RULE_PATTERNS: Array<{
  patterns: RegExp[];
  intent: IntentType;
  extractParams?: (match: RegExpMatchArray, text: string) => Record<string, any>;
}> = [
  // Help
  {
    patterns: [/^\/?(help|commands|menu|what can you do)\b/i],
    intent: "help",
  },
  // Emergency Stop
  {
    patterns: [
      /\b(emergency|doomsday|kill switch|circuit.?break|halt all|stop everything)\b/i,
    ],
    intent: "emergency_stop",
  },
  // Deploy Rule
  {
    patterns: [
      /\b(deploy|push|apply|rollout|ship)\s+(rule|config|rewrite|change)\b/i,
      /\b(enable|disable|toggle)\s+(feature|flag|rule)\s+(.+)/i,
    ],
    intent: "deploy_rule",
    extractParams: (_m, text) => {
      const ruleMatch = text.match(/(?:rule|flag|feature)\s+['"]?([^'"]+)['"]?/i);
      const valueMatch = text.match(/\b(enable|disable|toggle|on|off|true|false)\b/i);
      return {
        rule_name: ruleMatch?.[1]?.trim() || "",
        action: valueMatch?.[1]?.toLowerCase() || "enable",
      };
    },
  },
  // Update Config
  {
    patterns: [
      /\b(set|update|change|configure)\s+(config|setting|threshold|mode)\b/i,
      /\bset\s+(\w+)\s+(to|=)\s+(.+)/i,
    ],
    intent: "update_config",
    extractParams: (_m, text) => {
      const kvMatch = text.match(/set\s+(\w+)\s+(?:to|=)\s+(.+)/i);
      return {
        key: kvMatch?.[1] || "",
        value: kvMatch?.[2]?.trim() || "",
      };
    },
  },
  // Check Status
  {
    patterns: [
      /\b(status|health|how.?(?:is|are)|check|pulse|uptime|ping)\b/i,
    ],
    intent: "check_status",
    extractParams: (_m, text) => {
      const serviceMatch = text.match(/(?:status|health|check)\s+(?:of\s+)?(\w+)/i);
      return { service: serviceMatch?.[1] || "all" };
    },
  },
  // Run Audit
  {
    patterns: [
      /\b(audit|scan|analyze|inspect)\s+(site|seo|content|visibility|links)\b/i,
      /\brun\s+(audit|scan|check)\b/i,
    ],
    intent: "run_audit",
    extractParams: (_m, text) => {
      const typeMatch = text.match(/(?:audit|scan)\s+(\w+)/i);
      return { audit_type: typeMatch?.[1] || "full" };
    },
  },
  // Manage Content
  {
    patterns: [
      /\b(draft|write|approve|reject|schedule|publish|unpublish)\s+(content|post|article|blog|page)\b/i,
    ],
    intent: "manage_content",
    extractParams: (_m, text) => {
      const actionMatch = text.match(/\b(draft|approve|reject|schedule|publish|unpublish)\b/i);
      return { action: actionMatch?.[1]?.toLowerCase() || "" };
    },
  },
  // Manage Agents
  {
    patterns: [
      /\b(pause|resume|restart|reassign|cancel)\s+(agent|task|worker|job)\b/i,
      /\bagent\s+(status|list|queue)\b/i,
    ],
    intent: "manage_agents",
    extractParams: (_m, text) => {
      const actionMatch = text.match(/\b(pause|resume|restart|reassign|cancel|status|list)\b/i);
      const agentMatch = text.match(/(?:agent|task)\s+(?:type\s+)?(\w+)/i);
      return {
        action: actionMatch?.[1]?.toLowerCase() || "",
        agent_type: agentMatch?.[1] || "",
      };
    },
  },
  // Query Analytics
  {
    patterns: [
      /\b(analytics|metrics|report|traffic|conversion|revenue|roi)\b/i,
      /\bhow (?:many|much)\b/i,
      /\bshow\s+(?:me\s+)?(?:the\s+)?(stats|numbers|data|dashboard)\b/i,
    ],
    intent: "query_analytics",
    extractParams: (_m, text) => {
      const periodMatch = text.match(/\b(today|yesterday|this week|this month|last \w+)\b/i);
      const metricMatch = text.match(/\b(traffic|conversions?|revenue|keywords?|visitors?|impressions?)\b/i);
      return {
        period: periodMatch?.[1] || "today",
        metric: metricMatch?.[1] || "overview",
      };
    },
  },
];

function ruleBasedParse(text: string): ParseResult | null {
  for (const rule of RULE_PATTERNS) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match) {
        const params = rule.extractParams ? rule.extractParams(match, text) : {};
        return {
          intent: rule.intent,
          confidence: 0.85,
          parameters: params,
        };
      }
    }
  }
  return null;
}

// ── AI-Based Parser ──────────────────────────────────────────

async function aiBasedParse(
  env: Env,
  text: string,
): Promise<ParseResult | null> {
  const systemPrompt = `You are the Swarme ChatOps intent classifier. Given a user message, extract the intent and parameters.

Available intents:
- deploy_rule: Deploy, enable, disable, or toggle edge rules and feature flags
- update_config: Change configuration values, thresholds, or modes
- check_status: Check system health, service status, or uptime
- run_audit: Trigger SEO, visibility, content, or link audits
- manage_content: Draft, approve, reject, schedule, or publish content
- manage_agents: Pause, resume, restart, or reassign AI agent tasks
- query_analytics: Request metrics, reports, traffic data, or analytics
- emergency_stop: Emergency halt, doomsday protocol, circuit breaker activation
- help: User wants to see available commands
- unknown: Cannot determine intent

Respond ONLY with valid JSON: {"intent": "...", "confidence": 0.0-1.0, "parameters": {...}}`;

  try {
    const response: any = await (env.AI as any).run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const responseText = response?.response || "";
    // Extract JSON from potential markdown wrapping
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.intent || typeof parsed.confidence !== "number") return null;

    return {
      intent: parsed.intent as IntentType,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      parameters: parsed.parameters || {},
    };
  } catch (err) {
    console.warn("[IntentParser] AI classification failed:", err);
    return null;
  }
}
