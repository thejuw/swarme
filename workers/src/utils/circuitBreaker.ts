/**
 * ============================================================
 * Phase 56.2: Upstream API Circuit Breakers
 * ============================================================
 *
 * Wraps upstream API calls (OpenAI, Perplexity, Resend) with
 * circuit-breaker logic to prevent cascade failures.
 *
 * States:
 *   CLOSED  → Normal operation. Failures are counted.
 *   OPEN    → Requests are rejected immediately (fail-fast).
 *             Transitions to HALF_OPEN after cooldown expires.
 *   HALF_OPEN → A single probe request is allowed through.
 *              Success → CLOSED. Failure → OPEN again.
 *
 * Default thresholds:
 *   - 3 failures in 60 seconds trips OPEN
 *   - 15-minute cooldown before HALF_OPEN probe
 *
 * KV-backed state allows circuit state to survive across
 * Worker isolate restarts and be read by the frontend.
 *
 * Usage:
 *   const breaker = new CircuitBreaker("openai", env.CONFIG_KV);
 *   const result = await breaker.call(() => fetchOpenAI(...));
 * ============================================================
 */

// ── Types ────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Max failures before tripping OPEN */
  failureThreshold: number;
  /** Window in ms for counting failures */
  failureWindowMs: number;
  /** Cooldown in ms before transitioning OPEN → HALF_OPEN */
  cooldownMs: number;
}

export interface CircuitStatus {
  service: string;
  state: CircuitState;
  failures: number;
  lastFailure: string | null;
  openedAt: string | null;
  cooldownEndsAt: string | null;
}

interface KVCircuitState {
  state: CircuitState;
  failures: number[];     // timestamps of recent failures
  openedAt: number | null; // epoch ms when circuit opened
}

// ── Default Configuration ────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  failureWindowMs: 60_000,   // 60 seconds
  cooldownMs: 900_000,       // 15 minutes
};

// ── Services Registry ────────────────────────────────────────

export const CIRCUIT_SERVICES = ["openai", "perplexity", "resend"] as const;
export type CircuitService = (typeof CIRCUIT_SERVICES)[number];

// ── Circuit Breaker Class ────────────────────────────────────

export class CircuitBreaker {
  private service: CircuitService;
  private kv: KVNamespace;
  private config: CircuitBreakerConfig;
  private kvKey: string;

  constructor(
    service: CircuitService,
    kv: KVNamespace,
    config?: Partial<CircuitBreakerConfig>,
  ) {
    this.service = service;
    this.kv = kv;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.kvKey = `circuit:${service}`;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is OPEN.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    if (state.state === "OPEN") {
      // Check if cooldown has expired → transition to HALF_OPEN
      if (
        state.openedAt &&
        Date.now() - state.openedAt >= this.config.cooldownMs
      ) {
        await this.transition("HALF_OPEN", state);
        return this.executeProbe(fn, state);
      }

      throw new CircuitOpenError(
        this.service,
        state.openedAt
          ? new Date(state.openedAt + this.config.cooldownMs).toISOString()
          : null,
      );
    }

    if (state.state === "HALF_OPEN") {
      return this.executeProbe(fn, state);
    }

    // CLOSED — normal execution
    try {
      const result = await fn();
      // Reset failure count on success
      if (state.failures.length > 0) {
        await this.saveState({ state: "CLOSED", failures: [], openedAt: null });
      }
      return result;
    } catch (err) {
      await this.recordFailure(state);
      throw err;
    }
  }

  /**
   * Get the current circuit status (for API/frontend display).
   */
  async getStatus(): Promise<CircuitStatus> {
    const state = await this.getState();

    // Check for automatic OPEN → HALF_OPEN transition
    let currentState = state.state;
    if (
      currentState === "OPEN" &&
      state.openedAt &&
      Date.now() - state.openedAt >= this.config.cooldownMs
    ) {
      currentState = "HALF_OPEN";
    }

    const lastFailureTs = state.failures.length > 0
      ? state.failures[state.failures.length - 1]
      : null;

    return {
      service: this.service,
      state: currentState,
      failures: state.failures.length,
      lastFailure: lastFailureTs ? new Date(lastFailureTs).toISOString() : null,
      openedAt: state.openedAt ? new Date(state.openedAt).toISOString() : null,
      cooldownEndsAt: state.openedAt
        ? new Date(state.openedAt + this.config.cooldownMs).toISOString()
        : null,
    };
  }

  /**
   * Force-reset the circuit to CLOSED (admin operation).
   */
  async reset(): Promise<void> {
    await this.saveState({ state: "CLOSED", failures: [], openedAt: null });
    console.log(`[CircuitBreaker] ${this.service}: Force-reset to CLOSED`);
  }

  // ── Internal Methods ───────────────────────────────────────

  private async getState(): Promise<KVCircuitState> {
    try {
      const raw = await this.kv.get(this.kvKey, "json");
      if (raw && typeof raw === "object") {
        return raw as KVCircuitState;
      }
    } catch {
      // KV read failure — default to CLOSED
    }
    return { state: "CLOSED", failures: [], openedAt: null };
  }

  private async saveState(state: KVCircuitState): Promise<void> {
    try {
      await this.kv.put(this.kvKey, JSON.stringify(state), {
        expirationTtl: 86400, // 24h TTL — auto-cleanup
      });
    } catch (err) {
      console.error(
        `[CircuitBreaker] ${this.service}: KV write failed:`,
        err,
      );
    }
  }

  private async recordFailure(current: KVCircuitState): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.failureWindowMs;

    // Keep only failures within the window
    const recentFailures = [
      ...current.failures.filter((t) => t > windowStart),
      now,
    ];

    if (recentFailures.length >= this.config.failureThreshold) {
      // Trip to OPEN
      const newState: KVCircuitState = {
        state: "OPEN",
        failures: recentFailures,
        openedAt: now,
      };
      await this.saveState(newState);
      console.warn(
        `[CircuitBreaker] ${this.service}: TRIPPED OPEN — ` +
        `${recentFailures.length} failures in ${this.config.failureWindowMs}ms window`,
      );
    } else {
      await this.saveState({
        ...current,
        failures: recentFailures,
      });
    }
  }

  private async transition(
    newState: CircuitState,
    current: KVCircuitState,
  ): Promise<void> {
    await this.saveState({
      ...current,
      state: newState,
    });
    console.log(
      `[CircuitBreaker] ${this.service}: ${current.state} → ${newState}`,
    );
  }

  private async executeProbe<T>(
    fn: () => Promise<T>,
    current: KVCircuitState,
  ): Promise<T> {
    try {
      const result = await fn();
      // Probe succeeded — close the circuit
      await this.saveState({ state: "CLOSED", failures: [], openedAt: null });
      console.log(
        `[CircuitBreaker] ${this.service}: Probe succeeded → CLOSED`,
      );
      return result;
    } catch (err) {
      // Probe failed — back to OPEN with fresh cooldown
      await this.saveState({
        state: "OPEN",
        failures: [...current.failures, Date.now()],
        openedAt: Date.now(),
      });
      console.warn(
        `[CircuitBreaker] ${this.service}: Probe failed → OPEN (cooldown reset)`,
      );
      throw err;
    }
  }
}

// ── Circuit Open Error ───────────────────────────────────────

export class CircuitOpenError extends Error {
  public readonly service: string;
  public readonly cooldownEndsAt: string | null;

  constructor(service: string, cooldownEndsAt: string | null) {
    super(
      `Circuit breaker OPEN for ${service}` +
      (cooldownEndsAt ? ` — retry after ${cooldownEndsAt}` : ""),
    );
    this.name = "CircuitOpenError";
    this.service = service;
    this.cooldownEndsAt = cooldownEndsAt;
  }
}

// ── Helper: Get All Circuit Statuses ─────────────────────────

export async function getAllCircuitStatuses(
  kv: KVNamespace,
): Promise<CircuitStatus[]> {
  const statuses: CircuitStatus[] = [];

  for (const service of CIRCUIT_SERVICES) {
    const breaker = new CircuitBreaker(service, kv);
    statuses.push(await breaker.getStatus());
  }

  return statuses;
}

// ── Helper: Wrap AI Manager calls with circuit breaker ───────

export function createCircuitWrappedFetch(
  service: CircuitService,
  kv: KVNamespace,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const breaker = new CircuitBreaker(service, kv);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return breaker.call(() => fetch(input, init));
  };
}
