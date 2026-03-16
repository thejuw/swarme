/**
 * ============================================================
 * Swarme — Phase 9: IndexNow Instant Indexing Utility
 * ============================================================
 *
 * Pings the IndexNow API after every successful publish to
 * force search engines (Bing, Yandex, Naver, Seznam, etc.) to
 * crawl the new URL immediately instead of waiting for their
 * normal discovery cadence.
 *
 * Protocol spec: https://www.indexnow.org/documentation
 *
 * The key is stored per-project in KV:
 *   vault:project:{projectId}:indexnow_key
 *
 * Error handling:
 *   - Failures are logged as warnings, never fatal to the
 *     publish pipeline. A failed IndexNow ping doesn't mean
 *     the content wasn't published — it just won't get instant
 *     indexing from participating engines.
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** IndexNow API endpoint. */
const INDEXNOW_API = "https://api.indexnow.org/indexnow";

/** Timeout for the IndexNow request (5 seconds — it's a lightweight ping). */
const INDEXNOW_TIMEOUT_MS = 5_000;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface IndexNowResult {
  success: boolean;
  statusCode: number | null;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// pingIndexNow
// ─────────────────────────────────────────────────────────────

/**
 * Submits a URL to the IndexNow API for instant indexing by
 * participating search engines (Bing, Yandex, Naver, Seznam).
 *
 * Uses the POST endpoint with a JSON body per the IndexNow spec:
 *   POST https://api.indexnow.org/indexnow
 *   Content-Type: application/json
 *   {
 *     "host": "example.com",
 *     "key": "<your-key>",
 *     "urlList": ["https://example.com/new-article"]
 *   }
 *
 * The key must also be discoverable at:
 *   https://{host}/{key}.txt
 * (Cloudflare Workers can serve this as a static route.)
 *
 * @param url  — The full URL of the newly published page
 * @param host — The hostname (e.g., "swarme.io" or "store.myshopify.com")
 * @param key  — The IndexNow API key for this host
 * @returns IndexNowResult indicating success or failure
 */
export async function pingIndexNow(
  url: string,
  host: string,
  key: string
): Promise<IndexNowResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INDEXNOW_TIMEOUT_MS);

  try {
    const response = await fetch(INDEXNOW_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Swarme-Edge/1.0.0",
      },
      body: JSON.stringify({
        host,
        key,
        urlList: [url],
      }),
      signal: controller.signal,
    });

    // IndexNow returns:
    //   200 — URL submitted successfully
    //   202 — URL received, will be processed later
    //   400 — Invalid request
    //   403 — Key not valid for this host
    //   422 — Invalid URL(s)
    //   429 — Too many requests
    if (response.ok || response.status === 202) {
      return {
        success: true,
        statusCode: response.status,
        message: `IndexNow accepted URL: ${url}`,
      };
    }

    const body = await response.text().catch(() => "No response body");
    return {
      success: false,
      statusCode: response.status,
      message: `IndexNow rejected (HTTP ${response.status}): ${body.slice(0, 200)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // AbortError means timeout
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    return {
      success: false,
      statusCode: null,
      message: isTimeout
        ? `IndexNow ping timed out after ${INDEXNOW_TIMEOUT_MS}ms for ${url}`
        : `IndexNow ping failed for ${url}: ${message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
