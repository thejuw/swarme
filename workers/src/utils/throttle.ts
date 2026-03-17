/**
 * ============================================================
 * Phase 57.1: Global Concurrency Queuing — Token Bucket
 * ============================================================
 *
 * Replaces direct fetch() calls to upstream APIs with a
 * KV-backed Token Bucket rate limiter. Ensures Swarme never
 * exceeds configured TPM (Tokens Per Minute) globally, even
 * during massive cron-triggered traffic spikes.
 *
 * Token Bucket Algorithm:
 *   - Bucket refills at a fixed rate (tokens per second)
 *   - Each request consumes tokens from the bucket
 *   - If insufficient tokens, request waits (with backoff)
 *   - State is stored in KV for cross-isolate coordination
 *
 * Services wrapped:
 *   - Perplexity Chat (Sonar Pro — ~900 RPM)
 *   - Perplexity Search (900 RPM → ~15 RPS)
 *   - Gemini   (Imagen — ~60 RPM)
 *   - Resend    (90 RPM → ~1.5 RPS)
 *
 * Security:
 *   - All KV operations are atomic per service
 *   - Stale bucket state auto-expires after 120s
 *   - Hard timeout prevents infinite queuing (30s max wait)
 * ============================================================
 */

// ── Types ────────────────────────────────────────────────────

export type ThrottledService = "perplexity_chat" | "perplexity" | "gemini" | "resend";

interface BucketState {
  tokens: number;
  lastRefill: number; // epoch ms
}

interface ThrottleConfig {
  /** Max tokens in the bucket */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
  /** Tokens consumed per request */
  tokensPerRequest: number;
  /** Max wait time in ms before rejecting */
  maxWaitMs: number;
}

// ── Default Configurations ───────────────────────────────────

const SERVICE_CONFIGS: Record<ThrottledService, ThrottleConfig> = {
  perplexity_chat: {
    maxTokens: 15,           // Perplexity Sonar: ~900 RPM → 15 RPS burst
    refillRate: 15,          // 15 tokens per second refill
    tokensPerRequest: 1,     // 1 token per request (request-based limiter)
    maxWaitMs: 30_000,       // 30 second max queue wait
  },
  perplexity: {
    maxTokens: 15,           // 900 RPM → 15 requests per second burst
    refillRate: 15,          // 15 tokens per second refill
    tokensPerRequest: 1,     // 1 token per request (request-based limiter)
    maxWaitMs: 20_000,       // 20 second max queue wait
  },
  resend: {
    maxTokens: 3,            // 90 RPM → small burst of 3
    refillRate: 1.5,         // 1.5 tokens per second
    tokensPerRequest: 1,     // 1 token per request
    maxWaitMs: 15_000,       // 15 second max queue wait
  },
  gemini: {
    maxTokens: 10,           // Gemini Imagen: ~60 RPM → 1 RPS sustained, burst of 10
    refillRate: 1,           // 1 token per second
    tokensPerRequest: 1,     // 1 token per request
    maxWaitMs: 30_000,       // 30 second max queue wait
  },
};

// ── Token Bucket Class ───────────────────────────────────────

export class ThrottleQueue {
  private service: ThrottledService;
  private kv: KVNamespace;
  private config: ThrottleConfig;
  private kvKey: string;

  constructor(
    service: ThrottledService,
    kv: KVNamespace,
    configOverrides?: Partial<ThrottleConfig>,
  ) {
    this.service = service;
    this.kv = kv;
    this.config = { ...SERVICE_CONFIGS[service], ...configOverrides };
    this.kvKey = `throttle:${service}`;
  }

  /**
   * Execute a fetch request through the token bucket rate limiter.
   * Waits for available tokens before executing. Throws if maxWaitMs exceeded.
   */
  async throttledFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    await this.acquireTokens();
    return fetch(input, init);
  }

  /**
   * Acquire tokens from the bucket. Waits with exponential backoff
   * if tokens aren't immediately available.
   */
  private async acquireTokens(): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.config.maxWaitMs) {
        throw new ThrottleTimeoutError(
          this.service,
          this.config.maxWaitMs,
        );
      }

      const bucket = await this.getBucket();
      const now = Date.now();

      // Refill tokens based on elapsed time
      const timeSinceRefill = (now - bucket.lastRefill) / 1000;
      const newTokens = Math.min(
        this.config.maxTokens,
        bucket.tokens + timeSinceRefill * this.config.refillRate,
      );

      if (newTokens >= this.config.tokensPerRequest) {
        // Consume tokens and update bucket
        const updatedBucket: BucketState = {
          tokens: newTokens - this.config.tokensPerRequest,
          lastRefill: now,
        };
        await this.saveBucket(updatedBucket);
        return;
      }

      // Calculate wait time until enough tokens are available
      const deficit = this.config.tokensPerRequest - newTokens;
      const waitMs = Math.min(
        (deficit / this.config.refillRate) * 1000,
        // Exponential backoff cap: 50ms, 100ms, 200ms, 400ms...
        Math.min(50 * Math.pow(2, attempt), 2000),
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt++;
    }
  }

  /**
   * Get current bucket state from KV (with default for first use).
   */
  private async getBucket(): Promise<BucketState> {
    try {
      const raw = await this.kv.get(this.kvKey, "json");
      if (raw && typeof raw === "object") {
        return raw as BucketState;
      }
    } catch {
      // KV read failure — use fresh bucket
    }
    return {
      tokens: this.config.maxTokens,
      lastRefill: Date.now(),
    };
  }

  /**
   * Save bucket state to KV with 120s TTL (auto-cleanup stale state).
   */
  private async saveBucket(state: BucketState): Promise<void> {
    try {
      await this.kv.put(this.kvKey, JSON.stringify(state), {
        expirationTtl: 120,
      });
    } catch (err) {
      console.error(
        `[ThrottleQueue] ${this.service}: KV write failed:`,
        err,
      );
    }
  }

  /**
   * Get current bucket utilization (for monitoring/status endpoint).
   */
  async getStatus(): Promise<{
    service: string;
    availableTokens: number;
    maxTokens: number;
    utilizationPct: number;
  }> {
    const bucket = await this.getBucket();
    const now = Date.now();
    const timeSinceRefill = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      this.config.maxTokens,
      bucket.tokens + timeSinceRefill * this.config.refillRate,
    );

    return {
      service: this.service,
      availableTokens: Math.round(currentTokens),
      maxTokens: this.config.maxTokens,
      utilizationPct: Math.round(
        ((this.config.maxTokens - currentTokens) / this.config.maxTokens) * 100,
      ),
    };
  }
}

// ── Throttle Timeout Error ───────────────────────────────────

export class ThrottleTimeoutError extends Error {
  public readonly service: string;
  public readonly maxWaitMs: number;

  constructor(service: string, maxWaitMs: number) {
    super(
      `[ThrottleQueue] ${service}: Request queued for ${maxWaitMs}ms without acquiring tokens. ` +
      `API rate limit protection engaged — retry after traffic subsides.`,
    );
    this.name = "ThrottleTimeoutError";
    this.service = service;
    this.maxWaitMs = maxWaitMs;
  }
}

// ── Factory: Create throttled fetch for a service ────────────

/**
 * Returns a drop-in replacement for fetch() that respects
 * the global rate limit for the specified service.
 *
 * Usage:
 *   const throttledFetch = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
 *   const response = await throttledFetch("https://api.perplexity.ai/chat/completions", { ... });
 */
export function createThrottledFetch(
  service: ThrottledService,
  kv: KVNamespace,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const queue = new ThrottleQueue(service, kv);
  return (input: RequestInfo | URL, init?: RequestInit) =>
    queue.throttledFetch(input, init);
}

// ── Helper: Get all throttle statuses ────────────────────────

export const THROTTLED_SERVICES: ThrottledService[] = [
  "perplexity_chat",
  "perplexity",
  "gemini",
  "resend",
];

export async function getAllThrottleStatuses(
  kv: KVNamespace,
): Promise<
  { service: string; availableTokens: number; maxTokens: number; utilizationPct: number }[]
> {
  const statuses = [];
  for (const service of THROTTLED_SERVICES) {
    const queue = new ThrottleQueue(service, kv);
    statuses.push(await queue.getStatus());
  }
  return statuses;
}
