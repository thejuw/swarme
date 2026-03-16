/**
 * ============================================================
 * Phase 49: Algorithmic Review Dispersal Engine
 * ============================================================
 *
 * Routes happy customers to the highest-leverage review platform.
 *
 * Trigger: Intercepts `order.fulfilled` webhook via the CMS
 *          adapter — stores fulfilled orders in D1 with a
 *          configurable delay (shipping buffer).
 *
 * Logic:   After X days, the Heavy LLM queries Perplexity:
 *          "Does [domain_url] have a lower trust score on
 *           Trustpilot or Reddit?"
 *
 * Action:  If Trustpilot is weak → email customer a Trustpilot
 *          review link via Resend.
 *          If Reddit is weak → email customer asking them to
 *          share their experience in a relevant Subreddit.
 *
 * All queries use domain_id for strict compartmentalization.
 * ============================================================
 */

import type { Env } from "../index";
import { createThrottledFetch } from "../utils/throttle";

// ── Types ────────────────────────────────────────────────────

interface FulfilledOrder {
  id: string;
  domain_id: string;
  customer_email: string;
  customer_name: string;
  order_number: string;
  fulfilled_at: string;
  review_requested_at: string | null;
  domain_url: string;
}

interface TrustAssessment {
  weakest_platform: "trustpilot" | "reddit" | "none";
  trustpilot_score: number | null;
  reddit_sentiment: string | null;
  reasoning: string;
}

// ── Configuration ────────────────────────────────────────────

const REVIEW_DELAY_DAYS = 5; // Wait 5 days after fulfillment
const RESEND_API_URL = "https://api.resend.com/emails";

// ─────────────────────────────────────────────────────────────
// Main Cron Handler — Called by scheduled trigger
// ─────────────────────────────────────────────────────────────

export async function handleReviewRouting(env: Env): Promise<void> {
  console.log("[ReviewRouting] Starting review dispersal scan...");

  // Find fulfilled orders that are past the delay window and haven't
  // been sent a review request yet. Always query by domain_id.
  const cutoff = new Date(Date.now() - REVIEW_DELAY_DAYS * 86400000).toISOString();

  const orders = await env.DB.prepare(
    `SELECT fo.id, fo.domain_id, fo.customer_email, fo.customer_name,
            fo.order_number, fo.fulfilled_at, fo.review_requested_at,
            d.url as domain_url
     FROM Fulfilled_Orders fo
     JOIN Domains d ON d.id = fo.domain_id
     WHERE fo.fulfilled_at <= ?
       AND fo.review_requested_at IS NULL
     ORDER BY fo.fulfilled_at ASC
     LIMIT 10`
  )
    .bind(cutoff)
    .all<FulfilledOrder>();

  if (!orders.results || orders.results.length === 0) {
    console.log("[ReviewRouting] No orders ready for review request.");
    return;
  }

  console.log(`[ReviewRouting] Found ${orders.results.length} orders ready for review routing.`);

  for (const order of orders.results) {
    try {
      // 1. Assess which platform is weakest for this domain
      const assessment = await assessTrustWeakness(order.domain_url, env);

      if (assessment.weakest_platform === "none") {
        console.log(`[ReviewRouting] ${order.domain_url} trust is balanced — skipping order ${order.order_number}.`);
        await markReviewRequested(order.id, env);
        continue;
      }

      // 2. Send the appropriate review email
      await sendReviewEmail(order, assessment, env);

      // 3. Mark order as review-requested
      await markReviewRequested(order.id, env);

      console.log(
        `[ReviewRouting] Sent ${assessment.weakest_platform} review request to ${order.customer_email} for order ${order.order_number}.`
      );
    } catch (err) {
      console.error(`[ReviewRouting] Error processing order ${order.order_number}:`, err);
    }
  }

  console.log("[ReviewRouting] Review dispersal scan complete.");
}

// ─────────────────────────────────────────────────────────────
// Trust Assessment via Perplexity
// ─────────────────────────────────────────────────────────────

async function assessTrustWeakness(domainUrl: string, env: Env): Promise<TrustAssessment> {
  if (!env.PERPLEXITY_API_KEY) {
    console.warn("[ReviewRouting] PERPLEXITY_API_KEY not set — defaulting to Trustpilot.");
    return { weakest_platform: "trustpilot", trustpilot_score: null, reddit_sentiment: null, reasoning: "API key not configured" };
  }

  try {
    const throttledPerplexity = createThrottledFetch("perplexity", env.CONFIG_KV);
    const res = await throttledPerplexity("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a brand trust analyst. Respond ONLY with valid JSON.",
          },
          {
            role: "user",
            content: `Analyze the online trust profile of ${domainUrl}. Compare their presence on Trustpilot vs Reddit. Which platform has weaker brand representation? Respond in JSON: {"weakest_platform": "trustpilot" | "reddit" | "none", "trustpilot_score": number|null, "reddit_sentiment": "positive"|"negative"|"absent"|null, "reasoning": "brief explanation"}`,
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      console.error(`[ReviewRouting] Perplexity API error: ${res.status}`);
      return { weakest_platform: "trustpilot", trustpilot_score: null, reddit_sentiment: null, reasoning: "API error — defaulting" };
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as TrustAssessment;
      return parsed;
    }

    return { weakest_platform: "trustpilot", trustpilot_score: null, reddit_sentiment: null, reasoning: "Could not parse LLM response" };
  } catch (err) {
    console.error("[ReviewRouting] Trust assessment failed:", err);
    return { weakest_platform: "trustpilot", trustpilot_score: null, reddit_sentiment: null, reasoning: "Assessment error" };
  }
}

// ─────────────────────────────────────────────────────────────
// Email Sender via Resend API
// ─────────────────────────────────────────────────────────────

async function sendReviewEmail(
  order: FulfilledOrder,
  assessment: TrustAssessment,
  env: Env
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn("[ReviewRouting] RESEND_API_KEY not set — skipping email.");
    return;
  }

  const brandDomain = order.domain_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const firstName = order.customer_name.split(" ")[0] || "there";

  let subject: string;
  let body: string;

  if (assessment.weakest_platform === "trustpilot") {
    subject = `${firstName}, how was your experience?`;
    body = `Hi ${firstName},\n\nWe hope you're loving your recent order (#${order.order_number})!\n\nIf you have a moment, we'd be incredibly grateful for a quick review on Trustpilot. It helps other customers discover us and means the world to our team.\n\n👉 Leave a review: https://www.trustpilot.com/review/${brandDomain}\n\nThank you for your support!\n\nBest,\nThe ${brandDomain} Team`;
  } else {
    subject = `${firstName}, share your experience with the community!`;
    body = `Hi ${firstName},\n\nWe hope you're enjoying your recent order (#${order.order_number})!\n\nWe'd love if you shared your honest experience with the Reddit community. Your insights could help others looking for similar products.\n\nYou can post in a relevant subreddit like r/BuyItForLife, r/shutupandtakemymoney, or a niche community that fits your purchase.\n\nThank you for being part of our community!\n\nBest,\nThe ${brandDomain} Team`;
  }

  await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `reviews@${brandDomain}`,
      to: order.customer_email,
      subject,
      text: body,
    }),
  });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function markReviewRequested(orderId: string, env: Env): Promise<void> {
  await env.DB.prepare(
    `UPDATE Fulfilled_Orders SET review_requested_at = datetime('now') WHERE id = ?`
  )
    .bind(orderId)
    .run();
}
