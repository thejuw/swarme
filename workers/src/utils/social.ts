/**
 * ============================================================
 * Swarme — Phase 17: Social Media Agent
 * ============================================================
 *
 * Generates social media drafts (Twitter thread + LinkedIn post)
 * from a published article. These drafts are NEVER posted
 * autonomously — they are saved to the Social_Drafts table with
 * status AWAITING_APPROVAL for human review.
 *
 * Constraint: Strict Copilot. The agent drafts; the human posts.
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SocialDraftOutput {
  twitter: string[];  // 3-part thread
  linkedin: string;   // Single professional post
}

export interface SavedSocialDraft {
  id: string;
  asset_id: string;
  platform: "twitter" | "linkedin";
  content_payload: string;
  status: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// LLM Prompt
// ─────────────────────────────────────────────────────────────

const SOCIAL_SYSTEM_PROMPT = `You are an expert Social Media Manager for a premium brand.
Read the article provided and draft two things:

1. An engaging 3-part Twitter/X thread summarizing the key value proposition. Each tweet should be under 280 characters. The first tweet should hook the reader. The third tweet should include a CTA linking to the article.

2. A professional, insightful LinkedIn post (150-300 words) that positions the brand as a thought leader. Include 3-5 relevant hashtags at the end.

Rules:
- Do NOT use cringey or excessive emojis. One or two per tweet max is acceptable.
- Keep the tone professional but human — not robotic or overly corporate.
- Hashtags should be industry-relevant, not generic (#marketing, #SEO, #ecommerce are fine).
- For Twitter, use line breaks for readability.
- For LinkedIn, use short paragraphs.

Output STRICTLY as JSON with no markdown, no code fences, no explanation:
{ "twitter": ["tweet1", "tweet2", "tweet3"], "linkedin": "post text here" }`;

// ─────────────────────────────────────────────────────────────
// Core Function
// ─────────────────────────────────────────────────────────────

/**
 * Generates social media drafts from an article using Perplexity.
 * Falls back to template-based drafts if no API key is configured.
 */
export async function generateSocialDrafts(
  articleUrl: string,
  articleText: string,
  articleTitle: string,
  env: Env
): Promise<SocialDraftOutput> {
  // Truncate article to ~3000 chars for the LLM context window
  const truncatedText = articleText.length > 3000
    ? articleText.slice(0, 3000) + "..."
    : articleText;

  // Try Perplexity
  if (env.PERPLEXITY_API_KEY) {
    try {
      const response = await fetch(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: SOCIAL_SYSTEM_PROMPT },
              {
                role: "user",
                content: `Article Title: "${articleTitle}"\nArticle URL: ${articleUrl}\n\n${truncatedText}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 800,
            response_format: { type: "json_object" },
          }),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        const raw = data.choices?.[0]?.message?.content?.trim();
        if (raw) {
          const parsed = JSON.parse(raw) as SocialDraftOutput;

          // Validate structure
          if (
            Array.isArray(parsed.twitter) &&
            parsed.twitter.length >= 1 &&
            typeof parsed.linkedin === "string"
          ) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.error("[Social Agent] Perplexity call failed:", err);
    }
  }

  // ── Fallback: Template-based drafts ──
  return generateFallbackDrafts(articleUrl, articleTitle);
}

/**
 * Template-based fallback when Perplexity is not available.
 */
function generateFallbackDrafts(
  articleUrl: string,
  articleTitle: string
): SocialDraftOutput {
  return {
    twitter: [
      `We just published something you'll want to read:\n\n"${articleTitle}"\n\nHere's what we found \u2193`,
      `The key takeaway? Brands that invest in quality content see compounding returns. Not just in traffic — in trust, authority, and revenue.`,
      `Read the full article here:\n${articleUrl}\n\n#SEO #ContentStrategy #Ecommerce`,
    ],
    linkedin: `We're excited to share our latest piece: "${articleTitle}"\n\nIn this article, we explore the strategies and insights that are driving real results for modern brands. From content optimization to audience engagement, the playbook is evolving — and we're here to break it down.\n\nKey highlights:\n\u2022 Why quality content compounds over time\n\u2022 The metrics that actually matter for ROI\n\u2022 How autonomous agents are changing the game\n\nRead the full article: ${articleUrl}\n\n#SEO #ContentMarketing #Ecommerce #DigitalStrategy #AI`,
  };
}

// ─────────────────────────────────────────────────────────────
// Database Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Saves generated social drafts to the Social_Drafts table.
 * Returns the IDs of the created drafts.
 */
export async function saveSocialDrafts(
  assetId: string,
  drafts: SocialDraftOutput,
  db: D1Database
): Promise<string[]> {
  const ids: string[] = [];

  // Save Twitter thread
  const twitterId = `sd_tw_${assetId}_${Date.now()}`;
  await db.prepare(
    `INSERT INTO Social_Drafts (id, asset_id, platform, content_payload, status)
     VALUES (?1, ?2, 'twitter', ?3, 'AWAITING_APPROVAL')
     ON CONFLICT(asset_id, platform) DO UPDATE SET
       content_payload = ?3,
       status = 'AWAITING_APPROVAL'`
  )
    .bind(twitterId, assetId, JSON.stringify(drafts.twitter))
    .run();
  ids.push(twitterId);

  // Save LinkedIn post
  const linkedinId = `sd_li_${assetId}_${Date.now()}`;
  await db.prepare(
    `INSERT INTO Social_Drafts (id, asset_id, platform, content_payload, status)
     VALUES (?1, ?2, 'linkedin', ?3, 'AWAITING_APPROVAL')
     ON CONFLICT(asset_id, platform) DO UPDATE SET
       content_payload = ?3,
       status = 'AWAITING_APPROVAL'`
  )
    .bind(linkedinId, assetId, JSON.stringify(drafts.linkedin))
    .run();
  ids.push(linkedinId);

  return ids;
}
