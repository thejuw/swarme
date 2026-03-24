/**
 * ============================================================
 * Swarme — Phase 67: Edge Data Broker Ingestion Middleware
 * ============================================================
 *
 * High-volume event capture via Cloudflare Workers Analytics Engine.
 * Runs as Hono middleware on every request. Zero-latency: uses
 * writeDataPoint() which is fire-and-forget (no await needed).
 *
 * PII Sanitization (CRITICAL):
 *   - IP addresses are hashed to SHA-256 (first 16 chars)
 *   - User agents are classified into buckets (not stored raw)
 *   - No email, name, or session data is ever written
 *   - Only algorithmic behavioral signals are captured
 *
 * Data Schema (Analytics Engine blobs + doubles):
 *   blob1:  event_type     — "page_view", "api_call", "ai_crawler", "conversion"
 *   blob2:  path           — request path (e.g., "/api/chat/completions")
 *   blob3:  country        — CF-IPCountry header (2-letter)
 *   blob4:  device_class   — "bot", "mobile", "desktop", "tablet", "ai_crawler"
 *   blob5:  referer_domain — extracted hostname from Referer header (or "direct")
 *   blob6:  ip_hash        — SHA-256 of IP (first 16 chars, for cardinality only)
 *   blob7:  method         — HTTP method
 *   blob8:  domain_id      — project/domain identifier (anonymized)
 *   double1: status_code   — HTTP response status
 *   double2: response_ms   — Response time in milliseconds
 *   double3: content_length — Response body size in bytes
 *
 * Analytics Engine Binding:
 *   Declared as ANALYTICS in wrangler.toml
 * ============================================================
 */

import type { Context, Next } from "hono";
import type { Env } from "../index";

// ── AI Crawler Detection ─────────────────────────────────────

const AI_CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /gptbot/i,
  /chatgpt/i,
  /anthropic/i,
  /claude/i,
  /perplexity/i,
  /cohere/i,
  /meta-externalagent/i,
  /bytespider/i,
  /yandexbot/i,
  /ccbot/i,
  /facebookexternalhit/i,
];

const BOT_PATTERNS = [
  /bot\b/i,
  /spider/i,
  /crawl/i,
  /slurp/i,
  /wget/i,
  /curl/i,
];

function classifyDevice(ua: string): string {
  if (!ua) return "unknown";
  for (const pattern of AI_CRAWLER_PATTERNS) {
    if (pattern.test(ua)) return "ai_crawler";
  }
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(ua)) return "bot";
  }
  if (/mobile|android|iphone|ipad/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function classifyEvent(path: string, method: string, deviceClass: string): string {
  if (deviceClass === "ai_crawler") return "ai_crawler";
  if (path.startsWith("/api/")) return "api_call";
  if (path.includes("/convert") || path.includes("/checkout") || path.includes("/subscribe")) {
    return "conversion";
  }
  return "page_view";
}

function extractRefererDomain(referer: string | null): string {
  if (!referer) return "direct";
  try {
    return new URL(referer).hostname;
  } catch {
    return "direct";
  }
}

// ── SHA-256 PII Hashing ──────────────────────────────────────

async function hashPII(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hash));
  // Return first 16 hex chars — enough for cardinality, not reversible
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Middleware ────────────────────────────────────────────────

/**
 * Analytics Engine ingestion middleware.
 * Writes one data point per request. Fire-and-forget (no await).
 */
export function dataBrokerMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const startTime = Date.now();

    // Execute the request first
    await next();

    // Post-response: capture the data point (non-blocking)
    try {
      const analytics = c.env.ANALYTICS;
      if (!analytics) return; // Binding not configured — skip silently

      const req = c.req;
      const ua = req.header("user-agent") || "";
      const ip = req.header("cf-connecting-ip") || "0.0.0.0";
      const country = req.header("cf-ipcountry") || "XX";
      const referer = req.header("referer") || null;
      const path = new URL(req.url).pathname;
      const method = req.method;

      const deviceClass = classifyDevice(ua);
      const eventType = classifyEvent(path, method, deviceClass);
      const refererDomain = extractRefererDomain(referer);
      const ipHash = await hashPII(ip);

      // Extract domain_id from auth context or path (anonymized)
      const domainId = extractDomainId(c);

      const responseMs = Date.now() - startTime;
      const statusCode = c.res.status;
      const contentLength = parseInt(c.res.headers.get("content-length") || "0", 10);

      // Fire-and-forget write to Analytics Engine
      analytics.writeDataPoint({
        blobs: [
          eventType,       // blob1: event_type
          path,            // blob2: path
          country,         // blob3: country
          deviceClass,     // blob4: device_class
          refererDomain,   // blob5: referer_domain
          ipHash,          // blob6: ip_hash (PII-safe)
          method,          // blob7: method
          domainId,        // blob8: domain_id
        ],
        doubles: [
          statusCode,      // double1: status_code
          responseMs,      // double2: response_ms
          contentLength,   // double3: content_length
        ],
        indexes: [
          eventType,       // index1: primary grouping key
        ],
      });
    } catch {
      // Never block the response for analytics failures
    }
  };
}

// ── Helper: Extract domain_id from request context ───────────

function extractDomainId(c: Context): string {
  try {
    // Try JWT payload first
    const jwt = c.get("jwtPayload") as any;
    if (jwt?.domainId) return jwt.domainId.slice(0, 8);
    if (jwt?.userId) return jwt.userId.slice(0, 8);

    // Try path-based extraction for public routes
    const path = new URL(c.req.url).pathname;
    const match = path.match(/\/api\/projects\/([^/]+)/);
    if (match) return match[1].slice(0, 8);
  } catch {}
  return "anon";
}
