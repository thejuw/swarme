/**
 * ============================================================
 * Phase 35: Edge-Native A/B Split Routing Middleware
 * ============================================================
 *
 * Zero-flicker traffic routing using Cloudflare HTMLRewriter.
 *
 * Flow:
 *   1. Incoming request arrives at the edge.
 *   2. Check for a `swarm_variant` cookie.
 *      - If missing, assign 'A' or 'B' with 50/50 probability.
 *   3. Look up running AB_Tests for the requested asset.
 *   4. Use HTMLRewriter to swap the target DOM element with
 *      the assigned variant's HTML before returning the response.
 *   5. Set the cohort cookie (30-day expiry, SameSite=Lax).
 *
 * This runs at the edge before the response reaches the client,
 * eliminating any client-side flicker or layout shift.
 * ============================================================
 */

import type { Env } from "../index";

/** Cookie name for variant cohort persistence */
const VARIANT_COOKIE = "swarm_variant";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Active test definition fetched from D1 */
interface ActiveTest {
  id: string;
  target_selector: string;
  variant_a_html: string;
  variant_b_html: string;
}

/**
 * Parse the variant cohort from the Cookie header.
 * Returns 'A', 'B', or null if no cookie exists.
 */
function parseVariantCookie(cookieHeader: string | null): "A" | "B" | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${VARIANT_COOKIE}=`));
  if (!match) return null;
  const value = match.split("=")[1]?.toUpperCase();
  return value === "A" || value === "B" ? value : null;
}

/**
 * Assign a variant with 50/50 probability using crypto.
 * Uses a single random byte — even = A, odd = B.
 */
function assignVariant(): "A" | "B" {
  const byte = new Uint8Array(1);
  crypto.getRandomValues(byte);
  return byte[0] % 2 === 0 ? "A" : "B";
}

/**
 * HTMLRewriter element handler that replaces the inner HTML
 * of the matched DOM element with the test variant's content.
 */
class VariantRewriter implements HTMLRewriterElementContentHandlers {
  private html: string;
  constructor(html: string) {
    this.html = html;
  }
  element(element: Element) {
    element.setInnerContent(this.html, { html: true });
  }
}

/**
 * Apply A/B split routing to an origin response.
 *
 * @param request  - The incoming request
 * @param response - The origin response (HTML page)
 * @param env      - Cloudflare Worker env bindings
 * @param assetId  - The content asset ID being served
 *
 * @returns The (potentially rewritten) response with variant cookie
 */
export async function applyAbSplit(
  request: Request,
  response: Response,
  env: Env,
  assetId: string
): Promise<Response> {
  // Only process HTML responses
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // 1. Determine variant cohort
  const cookieHeader = request.headers.get("cookie");
  let variant = parseVariantCookie(cookieHeader);
  let isNewAssignment = false;

  if (!variant) {
    variant = assignVariant();
    isNewAssignment = true;
  }

  // 2. Fetch running tests for this asset
  let activeTests: ActiveTest[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, target_selector, variant_a_html, variant_b_html
       FROM AB_Tests
       WHERE asset_id = ?1 AND status = 'Running'
       LIMIT 5`
    )
      .bind(assetId)
      .all();
    activeTests = (results || []) as unknown as ActiveTest[];
  } catch (err) {
    console.error("[AB Split] D1 query failed:", err);
    return response;
  }

  // No active tests → pass through unchanged
  if (activeTests.length === 0) {
    return response;
  }

  // 3. Apply HTMLRewriter for each active test
  let rewriter = new HTMLRewriter();
  for (const test of activeTests) {
    const html = variant === "A" ? test.variant_a_html : test.variant_b_html;
    rewriter = rewriter.on(test.target_selector, new VariantRewriter(html));
  }

  const rewrittenResponse = rewriter.transform(response);

  // 4. Set variant cookie on new assignments
  if (isNewAssignment) {
    const newHeaders = new Headers(rewrittenResponse.headers);
    newHeaders.append(
      "Set-Cookie",
      `${VARIANT_COOKIE}=${variant}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`
    );
    return new Response(rewrittenResponse.body, {
      status: rewrittenResponse.status,
      statusText: rewrittenResponse.statusText,
      headers: newHeaders,
    });
  }

  return rewrittenResponse;
}

/**
 * Increment view counter for the assigned variant.
 * Called from the telemetry ingest endpoint when a page view is tracked.
 */
export async function incrementAbView(
  env: Env,
  testId: string,
  variant: "A" | "B"
): Promise<void> {
  const column = variant === "A" ? "views_a" : "views_b";
  await env.DB.prepare(
    `UPDATE AB_Tests
     SET ${column} = ${column} + 1,
         updated_at = datetime('now')
     WHERE id = ?1 AND status = 'Running'`
  )
    .bind(testId)
    .run();
}

/**
 * Increment conversion counter for the assigned variant.
 * Called from the telemetry ingest endpoint when a CTA click is tracked.
 */
export async function incrementAbConversion(
  env: Env,
  testId: string,
  variant: "A" | "B"
): Promise<void> {
  const column = variant === "A" ? "conversions_a" : "conversions_b";
  await env.DB.prepare(
    `UPDATE AB_Tests
     SET ${column} = ${column} + 1,
         updated_at = datetime('now')
     WHERE id = ?1 AND status = 'Running'`
  )
    .bind(testId)
    .run();
}
