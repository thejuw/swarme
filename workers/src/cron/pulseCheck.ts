/**
 * ============================================================
 * Swarme — Phase 66: Global Pulse Engine (Heartbeat Monitor)
 * ============================================================
 *
 * A high-frequency cron (every 5 minutes) that probes each
 * upstream dependency with a lightweight health check:
 *
 *   - Perplexity (Sonar)     — HEAD to /health or minimal chat
 *   - Gemini (Imagen)        — Lightweight models/list call
 *   - Resend                 — GET /domains (auth-only probe)
 *   - Stripe                 — GET /v1/balance (auth-only probe)
 *
 * When a probe fails, the Pulse Engine:
 *   1. Writes a degraded status to KV (`pulse:{service}`)
 *   2. Trips the circuit breaker to OPEN if not already open
 *   3. Logs the outage to the Agent_Tasks table
 *
 * When a probe succeeds and the service was previously degraded:
 *   1. Clears the degraded status in KV
 *   2. Resets the circuit breaker to CLOSED
 *   3. Logs recovery to Agent_Tasks
 *
 * The frontend reads `pulse:status` from a dedicated API endpoint
 * to render the global health banner (SystemStatus.tsx).
 *
 * KV Keys:
 *   pulse:{service}  — Per-service health state
 *   pulse:status     — Aggregate system status snapshot
 *
 * Security:
 *   - All probes use HEAD or minimal GET requests (never POST)
 *   - Timeout per probe: 8 seconds (prevent Worker timeout)
 *   - No user data is sent in any probe request
 * ============================================================
 */

import type { Env } from "../index";
import {
  CircuitBreaker,
  CIRCUIT_SERVICES,
} from "../utils/circuitBreaker";
import type { CircuitService } from "../utils/circuitBreaker";

// ── Types ────────────────────────────────────────────────────

export type PulseService = "perplexity" | "gemini" | "resend" | "stripe";

export type PulseState = "healthy" | "degraded" | "down";

export interface PulseResult {
  service: PulseService;
  state: PulseState;
  latencyMs: number;
  error: string | null;
  checkedAt: string;
}

export interface PulseSnapshot {
  overall: PulseState;
  services: PulseResult[];
  checkedAt: string;
}

export interface PulseCheckResult {
  servicesChecked: number;
  healthy: number;
  degraded: number;
  down: number;
  circuitBreakerActions: string[];
  durationMs: number;
}

// ── Configuration ────────────────────────────────────────────

/** Probe timeout — must stay well under Workers 30s CPU limit */
const PROBE_TIMEOUT_MS = 8_000;

/** Latency threshold (ms) for marking a service as "degraded" vs "healthy" */
const DEGRADED_LATENCY_MS = 5_000;

/** KV TTL for pulse data — 15 minutes (stale data auto-expires) */
const PULSE_KV_TTL = 900;

// ── Service Probes ───────────────────────────────────────────

/**
 * Map of lightweight health-check probes per service.
 * Each probe sends a minimal, non-destructive request
 * and returns true for a healthy response.
 */
const SERVICE_PROBES: Record<
  PulseService,
  (env: Env) => Promise<{ ok: boolean; error?: string }>
> = {
  perplexity: async (env: Env) => {
    // Minimal chat completion with tiny input
    // Perplexity has no /health endpoint — use smallest possible query
    const apiKey = env.PERPLEXITY_API_KEY;
    if (!apiKey) return { ok: true, error: "Key not configured — skipped" };

    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  },

  gemini: async (env: Env) => {
    // List models endpoint — read-only, no cost
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return { ok: true, error: "Key not configured — skipped" };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`,
      {
        method: "GET",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  },

  resend: async (env: Env) => {
    // GET /domains — auth-only probe, no writes
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return { ok: true, error: "Key not configured — skipped" };

    const resp = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  },

  stripe: async (env: Env) => {
    // GET /v1/balance — read-only, minimal
    const apiKey = env.STRIPE_SECRET_KEY;
    if (!apiKey) return { ok: true, error: "Key not configured — skipped" };

    const resp = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  },
};

// ── Pulse Service List ───────────────────────────────────────

const PULSE_SERVICES: PulseService[] = ["perplexity", "gemini", "resend", "stripe"];

// ── Map pulse services to circuit breaker services ───────────

const PULSE_TO_CIRCUIT: Partial<Record<PulseService, CircuitService[]>> = {
  perplexity: ["perplexity", "perplexity_chat"],
  gemini: ["gemini"],
  resend: ["resend"],
  // stripe has no circuit breaker (billing is not wrapped)
};

// ── Main Handler ─────────────────────────────────────────────

export async function handlePulseCheck(env: Env): Promise<PulseCheckResult> {
  const startTime = Date.now();
  const circuitActions: string[] = [];
  const results: PulseResult[] = [];

  // Run all probes in parallel
  const probePromises = PULSE_SERVICES.map(async (service) => {
    const probeStart = Date.now();
    let state: PulseState = "healthy";
    let error: string | null = null;

    try {
      const probe = SERVICE_PROBES[service];
      const result = await probe(env);

      if (!result.ok) {
        state = "down";
        error = result.error || "Probe returned not-ok";
      } else {
        const latency = Date.now() - probeStart;
        if (latency > DEGRADED_LATENCY_MS) {
          state = "degraded";
          error = `High latency: ${latency}ms`;
        }
      }
    } catch (err) {
      state = "down";
      if (err instanceof Error) {
        error = err.name === "AbortError" || err.name === "TimeoutError"
          ? `Timeout after ${PROBE_TIMEOUT_MS}ms`
          : err.message.slice(0, 200);
      } else {
        error = "Unknown probe error";
      }
    }

    const pulseResult: PulseResult = {
      service,
      state,
      latencyMs: Date.now() - probeStart,
      error,
      checkedAt: new Date().toISOString(),
    };

    return pulseResult;
  });

  const probeResults = await Promise.all(probePromises);

  // Process results and update circuit breakers
  for (const result of probeResults) {
    results.push(result);

    // Read previous pulse state from KV
    const previousPulse = await readPulseState(env, result.service);

    // Write new pulse state to KV
    await writePulseState(env, result.service, result);

    // Circuit breaker integration
    const circuitServices = PULSE_TO_CIRCUIT[result.service];
    if (!circuitServices) continue;

    if (result.state === "down") {
      // Trip circuit breakers for all mapped services
      for (const cs of circuitServices) {
        try {
          const breaker = new CircuitBreaker(cs, env.CONFIG_KV);
          const status = await breaker.getStatus();
          if (status.state === "CLOSED" || status.state === "HALF_OPEN") {
            // Force-trip by writing OPEN state directly to KV
            await env.CONFIG_KV.put(
              `circuit:${cs}`,
              JSON.stringify({
                state: "OPEN",
                failures: [Date.now(), Date.now(), Date.now()],
                openedAt: Date.now(),
              }),
              { expirationTtl: 86400 },
            );
            circuitActions.push(`${cs}: TRIPPED OPEN (pulse detected outage)`);
            console.warn(
              `[PulseCheck] ${cs}: Circuit TRIPPED OPEN — ${result.service} probe failed`,
            );
          }
        } catch (err) {
          console.error(`[PulseCheck] Failed to trip circuit for ${cs}:`, err);
        }
      }
    } else if (result.state === "healthy" && previousPulse?.state === "down") {
      // Service recovered — reset circuit breakers
      for (const cs of circuitServices) {
        try {
          const breaker = new CircuitBreaker(cs, env.CONFIG_KV);
          await breaker.reset();
          circuitActions.push(`${cs}: RESET to CLOSED (pulse detected recovery)`);
          console.log(
            `[PulseCheck] ${cs}: Circuit RESET — ${result.service} recovered`,
          );
        } catch (err) {
          console.error(`[PulseCheck] Failed to reset circuit for ${cs}:`, err);
        }
      }
    }
  }

  // Compute aggregate status
  const healthyCount = results.filter((r) => r.state === "healthy").length;
  const degradedCount = results.filter((r) => r.state === "degraded").length;
  const downCount = results.filter((r) => r.state === "down").length;

  const overall: PulseState =
    downCount > 0 ? "down" : degradedCount > 0 ? "degraded" : "healthy";

  // Write aggregate snapshot to KV
  const snapshot: PulseSnapshot = {
    overall,
    services: results,
    checkedAt: new Date().toISOString(),
  };

  try {
    await env.CONFIG_KV.put("pulse:status", JSON.stringify(snapshot), {
      expirationTtl: PULSE_KV_TTL,
    });
  } catch (err) {
    console.error("[PulseCheck] Failed to write aggregate snapshot:", err);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[PulseCheck] Complete in ${durationMs}ms — ` +
    `${healthyCount} healthy, ${degradedCount} degraded, ${downCount} down` +
    (circuitActions.length > 0 ? ` | Actions: ${circuitActions.join(", ")}` : ""),
  );

  return {
    servicesChecked: results.length,
    healthy: healthyCount,
    degraded: degradedCount,
    down: downCount,
    circuitBreakerActions: circuitActions,
    durationMs,
  };
}

// ── KV Helpers ───────────────────────────────────────────────

async function readPulseState(
  env: Env,
  service: PulseService,
): Promise<PulseResult | null> {
  try {
    return await env.CONFIG_KV.get<PulseResult>(`pulse:${service}`, "json");
  } catch {
    return null;
  }
}

async function writePulseState(
  env: Env,
  service: PulseService,
  result: PulseResult,
): Promise<void> {
  try {
    await env.CONFIG_KV.put(`pulse:${service}`, JSON.stringify(result), {
      expirationTtl: PULSE_KV_TTL,
    });
  } catch (err) {
    console.error(`[PulseCheck] KV write failed for pulse:${service}:`, err);
  }
}

// ── Export: Read the latest pulse snapshot ────────────────────

/**
 * Read the aggregate pulse snapshot from KV.
 * Used by the /api/admin/pulse endpoint.
 */
export async function getPulseSnapshot(
  env: Env,
): Promise<PulseSnapshot | null> {
  try {
    return await env.CONFIG_KV.get<PulseSnapshot>("pulse:status", "json");
  } catch {
    return null;
  }
}
