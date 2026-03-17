/**
 * ============================================================
 * Swarme — Phase 18: Content Decay Refresh Agent
 * ============================================================
 *
 * Generates an updated/modernized version of an aging article
 * via Perplexity and stages it for human review. The refresh draft
 * is NEVER published automatically — strict copilot constraint.
 *
 * Pipeline:
 *   1. Receive old HTML + target keyword from the DO
 *   2. Call Perplexity Sonar to rewrite the content
 *   3. Save the refresh draft payload to Content_Assets
 *   4. Set refresh_status = AWAITING_APPROVAL
 *
 * The dashboard Decay Manager page surfaces these for the
 * human operator to review side-by-side and approve/discard.
 * ============================================================
 */

import { createThrottledFetch } from "./throttle";

// ─────────────────────────────────────────────────────────────
// LLM Refresh Content Generation
// ─────────────────────────────────────────────────────────────

const REFRESH_SYSTEM_PROMPT = `You are an SEO Editor for a premium content team.

Your task is to refresh aging web content so it reflects current-year standards, trends, and best practices.

Guidelines:
- Preserve the article's core thesis, structure, and brand voice
- Update any outdated statistics, dates, references, or examples
- Add a new section covering recent trends and developments relevant to the topic
- Improve formatting: add subheadings, bullet points, and short paragraphs for readability
- Ensure keyword relevance without keyword stuffing
- Maintain or improve the existing SEO structure (H1, H2, H3 hierarchy)
- Add schema-friendly markup where appropriate
- Current year is ${new Date().getFullYear()}
- Output the completely rewritten HTML content (article body only, no <html>/<head>/<body> wrappers)`;

/**
 * Calls Perplexity to generate refreshed/modernized content for
 * an aging article. Falls back to a simple mock if no API key
 * is available.
 *
 * @param oldHtml          The existing published HTML content
 * @param targetKeyword    The primary keyword the article targets
 * @param perplexityApiKey     Perplexity API key (from KV vault or env)
 * @returns                The refreshed HTML content string
 */
export async function generateRefreshedContent(
  oldHtml: string,
  targetKeyword: string,
  perplexityApiKey: string
): Promise<string> {
  // If no API key, return a structured mock
  if (!perplexityApiKey) {
    console.log("[Refresh Agent] No Perplexity key — generating mock refresh");
    return generateMockRefresh(oldHtml, targetKeyword);
  }

  try {
    const userPrompt = `Review this aging article targeting "${targetKeyword}". Update the content to reflect ${new Date().getFullYear()} standards. Add a new section covering recent trends. Improve the formatting. Output the completely rewritten HTML.

--- EXISTING ARTICLE ---
${oldHtml.slice(0, 12000)}
--- END ---`;

    const throttledPplx = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
    const response = await throttledPplx("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: REFRESH_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Refresh Agent] Perplexity error ${response.status}:`,
        errorText
      );
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const refreshedContent = data.choices?.[0]?.message?.content?.trim();

    if (!refreshedContent) {
      throw new Error("Empty response from Perplexity");
    }

    console.log(
      `[Refresh Agent] Generated ${refreshedContent.length} chars of refreshed content`
    );

    return refreshedContent;
  } catch (err) {
    console.error("[Refresh Agent] LLM call failed, using mock:", err);
    return generateMockRefresh(oldHtml, targetKeyword);
  }
}

/**
 * Mock refresh: wraps the existing content with an "Updated"
 * banner and adds a placeholder new section. Used when no
 * API key is available or the LLM call fails.
 */
function generateMockRefresh(oldHtml: string, keyword: string): string {
  const year = new Date().getFullYear();
  return `<div class="refresh-update-banner">
  <p><strong>📝 Updated for ${year}</strong> — This article has been refreshed with current data, trends, and best practices for "${keyword}".</p>
</div>

${oldHtml}

<h2>${year} Trends & Updates</h2>
<p>The landscape for ${keyword} has evolved significantly. Here are the key developments:</p>
<ul>
  <li><strong>AI-Driven Optimization:</strong> Machine learning models now handle real-time content scoring and keyword clustering at scale.</li>
  <li><strong>Zero-Click Search Dominance:</strong> Featured snippets and AI Overviews account for an increasing share of SERP real estate — structured data and concise answers are critical.</li>
  <li><strong>Core Web Vitals ${year}:</strong> Google's latest performance thresholds emphasise Interaction to Next Paint (INP) over First Input Delay.</li>
  <li><strong>E-E-A-T Signals:</strong> Experience, Expertise, Authoritativeness, and Trustworthiness continue to be primary quality signals for content ranking.</li>
</ul>

<h3>What This Means for Your Strategy</h3>
<p>Brands targeting "${keyword}" should prioritise experience-led content, fast-loading pages, and structured data markup. The shift from traditional SEO to Generative Engine Optimization (GEO) means your content must be written for both humans and AI citation engines.</p>`;
}

// ─────────────────────────────────────────────────────────────
// D1 Persistence
// ─────────────────────────────────────────────────────────────

/**
 * Saves the refreshed content draft to the Content_Assets table.
 * Sets refresh_status = AWAITING_APPROVAL so the Decay Manager
 * UI surfaces it for human review. Parameterized queries prevent
 * SQL injection.
 */
export async function saveRefreshDraft(
  db: D1Database,
  assetId: string,
  refreshedHtml: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE Content_Assets
       SET refresh_draft_payload = ?1,
           refresh_status = 'AWAITING_APPROVAL',
           updated_at = datetime('now')
       WHERE id = ?2`
    )
    .bind(refreshedHtml, assetId)
    .run();
}
