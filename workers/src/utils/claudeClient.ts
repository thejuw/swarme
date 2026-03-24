/**
 * ============================================================
 * Swarme — Phase 1 Audit: Anthropic Claude Client Wrapper
 * ============================================================
 *
 * Circuit-broken Claude client for AI Manager fallback.
 * Used when Perplexity is unavailable (rate limited, down,
 * or circuit breaker open).
 *
 * API: Anthropic Messages API v1
 * Model: claude-sonnet-4-20250514 (balanced cost/quality)
 * Circuit Breaker: "claude" service key in CONFIG_KV
 *
 * IMPORTANT: This is strictly a fallback. Perplexity is the
 * primary provider. Claude activates only when Perplexity
 * returns a non-2xx response or the circuit is open.
 * ============================================================
 */

import type { Env } from "../index";
import { CircuitBreaker } from "./circuitBreaker";
import type { CircuitService } from "./circuitBreaker";

// ── Types ────────────────────────────────────────────────────

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeChatResult {
  reply: string;
  model: string;
  tokens_used: number;
  fallback: true;
}

// ── Constants ────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2000;

// ── Main Chat Function ───────────────────────────────────────

/**
 * Send a chat completion to Claude as a Perplexity fallback.
 * Returns null if Claude is also unavailable (key missing, circuit open, API error).
 */
export async function claudeChat(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  env: Env,
): Promise<ClaudeChatResult | null> {
  // Get API key from vault or env
  const globalConfig = await env.CONFIG_KV.get<Record<string, Record<string, string>>>(
    "global:config:keys",
    "json",
  );
  const vaultKey = globalConfig?.ai_models?.ANTHROPIC_API_KEY;
  const apiKey = (vaultKey && vaultKey.trim().length > 10)
    ? vaultKey.trim()
    : env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("[Claude] No ANTHROPIC_API_KEY configured — fallback unavailable");
    return null;
  }

  // Convert messages to Claude's format (strip system, ensure alternating roles)
  const claudeMessages: ClaudeMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (msg.role === "user" || msg.role === "assistant") {
      const lastRole = claudeMessages.length > 0
        ? claudeMessages[claudeMessages.length - 1].role
        : null;
      if (lastRole === msg.role) {
        // Merge consecutive same-role messages
        claudeMessages[claudeMessages.length - 1].content += "\n\n" + msg.content;
      } else {
        claudeMessages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Claude requires first message to be "user"
  if (claudeMessages.length === 0 || claudeMessages[0].role !== "user") {
    console.warn("[Claude] No valid user message found for fallback");
    return null;
  }

  // Use CircuitBreaker.call() which handles failure counting and circuit state
  const breaker = new CircuitBreaker("claude" as CircuitService, env.CONFIG_KV, {
    failureThreshold: 3,
    failureWindowMs: 120_000,   // 2 minute window
    cooldownMs: 60_000,         // 1 minute cooldown after tripping
  });

  try {
    const result = await breaker.call<ClaudeChatResult | null>(async () => {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: claudeMessages,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error (${response.status}): ${errText}`);
      }

      const data = await response.json() as ClaudeResponse;
      const reply = data.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n") || "";

      if (!reply) {
        throw new Error("Claude returned empty response");
      }

      console.log(
        `[Claude] Fallback response: ${data.usage.input_tokens}+${data.usage.output_tokens} tokens, model=${data.model}`,
      );

      return {
        reply,
        model: data.model,
        tokens_used: data.usage.input_tokens + data.usage.output_tokens,
        fallback: true as const,
      };
    });

    return result;
  } catch (err) {
    console.error("[Claude] Fallback failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Check if Claude fallback is available (key configured).
 */
export function isClaudeConfigured(env: Env): boolean {
  return !!env.ANTHROPIC_API_KEY;
}
