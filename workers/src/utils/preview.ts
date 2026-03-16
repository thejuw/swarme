/**
 * ============================================================
 * Swarme — Phase 37: Visual Sandbox Preview Utility
 * ============================================================
 *
 * Uses Cloudflare's Browser Rendering `/crawl` endpoint to
 * capture visual screenshots of live pages after AI agent
 * actions. These previews are stored in R2 and surfaced in:
 *   - AI Manager approval cards (before/after diffs)
 *   - Mission Control action history timeline
 *   - Rollback confirmation dialogs
 *
 * The `/crawl` endpoint is a managed browser instance that
 * returns page metadata + a screenshot buffer. No Puppeteer
 * or headless Chrome required — it's fully edge-native.
 *
 * Endpoint: https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/crawl
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PreviewScreenshot {
  /** Public URL of the stored screenshot in R2 */
  url: string;
  /** Width of the captured viewport */
  width: number;
  /** Height of the captured viewport */
  height: number;
  /** ISO timestamp when the screenshot was taken */
  capturedAt: string;
  /** The URL that was screenshotted */
  targetUrl: string;
}

export interface CrawlResponse {
  success: boolean;
  result: {
    url: string;
    status: number;
    screenshot?: string; // base64-encoded PNG
    title?: string;
    html?: string;
  }[];
  errors: { code: number; message: string }[];
  messages: string[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const SCREENSHOT_TIMEOUT_MS = 30_000;

// ─────────────────────────────────────────────────────────────
// capturePreview — Main entry point
// ─────────────────────────────────────────────────────────────

/**
 * Captures a visual screenshot of the given URL using Cloudflare's
 * Browser Rendering `/crawl` endpoint.
 *
 * Flow:
 *   1. POST to the /crawl endpoint with the target URL
 *   2. Receive a base64-encoded PNG screenshot
 *   3. Store the screenshot in R2 under `previews/{projectId}/{timestamp}.png`
 *   4. Return the public R2 URL for embedding in the UI
 *
 * @param targetUrl - The full URL to screenshot
 * @param projectId - Project ID for R2 path namespacing
 * @param env - Cloudflare Worker environment bindings
 * @returns PreviewScreenshot with the stored URL, or null on failure
 */
export async function capturePreview(
  targetUrl: string,
  projectId: string,
  env: Env
): Promise<PreviewScreenshot | null> {
  try {
    const accountId = env.CF_ACCOUNT_ID;
    const apiToken = env.CF_API_TOKEN;

    if (!accountId || !apiToken) {
      console.warn("[Preview] Missing CF_ACCOUNT_ID or CF_API_TOKEN — skipping screenshot");
      return null;
    }

    // ── Step 1: Call the Browser Rendering /crawl endpoint ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCREENSHOT_TIMEOUT_MS);

    const crawlResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: targetUrl,
          screenshotOptions: {
            type: "png",
            fullPage: false,
            clip: {
              x: 0,
              y: 0,
              width: VIEWPORT_WIDTH,
              height: VIEWPORT_HEIGHT,
            },
          },
          viewport: {
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT,
          },
          waitUntil: "networkidle0",
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!crawlResponse.ok) {
      const errorBody = await crawlResponse.text();
      console.error(`[Preview] Crawl API returned ${crawlResponse.status}: ${errorBody}`);
      return null;
    }

    const data = (await crawlResponse.json()) as CrawlResponse;

    if (!data.success || !data.result?.[0]?.screenshot) {
      console.error("[Preview] No screenshot in crawl response:", data.errors);
      return null;
    }

    const base64Screenshot = data.result[0].screenshot;
    const screenshotBuffer = base64ToUint8Array(base64Screenshot);

    // ── Step 2: Store in R2 ──
    const timestamp = Date.now();
    const r2Key = `previews/${projectId}/${timestamp}.png`;

    await env.R2_BUCKET.put(r2Key, screenshotBuffer, {
      httpMetadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        targetUrl,
        capturedAt: new Date().toISOString(),
        viewportWidth: String(VIEWPORT_WIDTH),
        viewportHeight: String(VIEWPORT_HEIGHT),
      },
    });

    // ── Step 3: Build the public URL ──
    // R2 custom domain or public bucket URL
    const r2PublicBase = env.R2_PUBLIC_URL || `https://pub-${accountId}.r2.dev`;
    const publicUrl = `${r2PublicBase}/${r2Key}`;

    return {
      url: publicUrl,
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      capturedAt: new Date().toISOString(),
      targetUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Preview] Failed to capture screenshot of ${targetUrl}: ${message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Decodes a base64 string to a Uint8Array.
 * Uses the Workers runtime's built-in atob() for efficiency.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
