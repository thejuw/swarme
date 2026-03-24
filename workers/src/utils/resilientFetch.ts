/**
 * ============================================================
 * Swarme — Phase 66: Resilient Fetch (Unified Outbound Guard)
 * ============================================================
 *
 * Chains the full resilience stack into a single fetch wrapper:
 *
 *   1. Pulse Guard    — Checks KV pulse state; if service is "down",
 *                       rejects immediately without burning tokens/quota
 *   2. Circuit Breaker — CLOSED/OPEN/HALF_OPEN state machine
 *   3. Throttle       — Token-bucket rate limiter
 *   4. Actual fetch() — The real outbound HTTP request
 *
 * Usage:
 *   const resilientFetch = createResilientFetch("perplexity_chat", env);
 *   const response = await resilientFetch("https://api.perplexity.ai/...", { ... });
 *
 * Error types thrown:
 *   - ServiceDegradedError — Pulse reports service is down
 *   - CircuitOpenError     — Circuit breaker is tripped
 *   - ThrottleTimeoutError — Rate limit queue timeout
 *   - Standard fetch errors — Network/DNS/timeout from actual request
 *
 * This module replaces the pattern of manually stacking
 * createThrottledFetch + createCircuitWrappedFetch in call sites.
 * ============================================================
 */

import type { Env } from "../index";
import { CircuitBreaker, CircuitOpenError } from "./circuitBreaker";
import type { CircuitService } from "./circuitBreaker";
import { ThrottleQueue, ThrottleTimeoutError } from "./throttle";
import type { ThrottledService } from "./throttle";
import type { PulseState } from "../cron/pulseCheck";

// ── Types ────────────────────────────────────────────────────

export type ResilientService = "perplexity_chat" | "perplexity" | "gemini" | "resend";

export interface ResilientFetchOptions {
  /** Skip the pulse check (for recovery probes) */
  skipPulseGuard?: boolean;
  /** Skip the throttle (for priority requests) */
  skipThrottle?: boolean;
}

// ── Pulse service mapping ────────────────────────────────────
// Maps resilient service names to their pulse check key.
// perplexity_chat and perplexity both map to the "perplexity" pulse.

const SERVICE_TO_PULSE: Record<ResilientService, string> = {
  perplexity_chat: "perplexity",
  perplexity: "perplexity",
  gemini: "gemini",
  resend: "resend",
};

// ── ServiceDegradedError ─────────────────────────────────────

export class ServiceDegradedError extends Error {
  public readonly service: string;
  public readonly pulseState: PulseState;
  public readonly checkedAt: string | null;

  constructor(service: string, pulseState: PulseState, checkedAt: string | null) {
    super(
      `[ResilientFetch] ${service}: Service is ${pulseState} — ` +
      `request blocked by pulse guard. Last check: ${checkedAt || "unknown"}`,
    );
    this.name = "ServiceDegradedError";
    this.service = service;
    this.pulseState = pulseState;
    this.checkedAt = checkedAt;
  }
}

// ── Factory ──────────────────────────────────────────────────

/**
 * Create a resilient fetch function that chains:
 * pulse guard -> circuit breaker -> throttle -> fetch
 */
export function createResilientFetch(
  service: ResilientService,
  env: Env,
): (
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ResilientFetchOptions,
) => Promise<Response> {
  const breaker = new CircuitBreaker(service as CircuitService, env.CONFIG_KV);
  const throttle = new ThrottleQueue(service as ThrottledService, env.CONFIG_KV);
  const pulseKey = `pulse:${SERVICE_TO_PULSE[service]}`;

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: ResilientFetchOptions,
  ): Promise<Response> => {
    // ── Layer 1: Pulse Guard ──────────────────────────────
    if (!options?.skipPulseGuard) {
      try {
        const pulseRaw = await env.CONFIG_KV.get(pulseKey, "json");
        if (pulseRaw && typeof pulseRaw === "object") {
          const pulse = pulseRaw as { state: PulseState; checkedAt?: string };
          if (pulse.state === "down") {
            throw new ServiceDegradedError(
              service,
              pulse.state,
              pulse.checkedAt || null,
            );
          }
        }
      } catch (err) {
        // If it's our own ServiceDegradedError, re-throw
        if (err instanceof ServiceDegradedError) throw err;
        // KV read failure — proceed (fail-open for pulse guard)
      }
    }

    // ── Layer 2: Circuit Breaker ──────────────────────────
    // breaker.call() will throw CircuitOpenError if OPEN
    return breaker.call(async () => {
      // ── Layer 3: Throttle ─────────────────────────────
      if (options?.skipThrottle) {
        return fetch(input, init);
      }
      return throttle.throttledFetch(input, init);
    });
  };
}

// ── Re-exports for convenience ───────────────────────────────

export { CircuitOpenError, ThrottleTimeoutError };
