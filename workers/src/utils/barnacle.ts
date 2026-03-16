/**
 * ============================================================
 * Phase 49: Barnacle GEO Outreach Engine
 * ============================================================
 *
 * Hooks into the Phase 38 Outreach Agent to discover high-value
 * listicle inclusion opportunities.
 *
 * Discovery: Queries Perplexity for "Top 10 listicles ranking
 *            for [Target Keyword] that do not mention [domain_url]"
 *
 * Outreach:  Passes discovered URLs to Hunter.io to find authors.
 *            Drafts an email offering a RAG-ready quote or affiliate
 *            deal. Routes to Mission Control "Awaiting Approval" queue.
 *
 * The social agent constraint applies here: emails are NEVER sent
 * autonomously. All drafts go to human approval first.
 * ============================================================
 */

import type { Env } from "../index";
import { createThrottledFetch } from "./throttle";

// ── Types ────────────────────────────────────────────────────

export interface BarnacleTarget {
  listicle_url: string;
  listicle_title: string;
  keyword: string;
  estimated_traffic: string;
  domain_authority: number | null;
}

interface HunterResult {
  email: string;
  first_name: string;
  last_name: string;
  position: string | null;
  confidence: number;
}

export interface BarnacleOutreachDraft {
  domain_id: string;
  target_url: string;
  target_title: string;
  keyword: string;
  contact_email: string;
  contact_name: string;
  subject: string;
  body: string;
  status: "awaiting_approval";
  created_at: string;
}

// ── Configuration ────────────────────────────────────────────

const HUNTER_API_BASE = "https://api.hunter.io/v2";

// ─────────────────────────────────────────────────────────────
// Main Entry: Run Barnacle Discovery for a Domain
// ─────────────────────────────────────────────────────────────

export async function runBarnacleDiscovery(
  domainId: string,
  domainUrl: string,
  targetKeywords: string[],
  env: Env
): Promise<BarnacleOutreachDraft[]> {
  console.log(`[Barnacle] Starting discovery for domain ${domainId} — ${targetKeywords.length} keywords`);

  const allDrafts: BarnacleOutreachDraft[] = [];

  for (const keyword of targetKeywords.slice(0, 5)) { // Limit to 5 keywords per run
    try {
      // 1. Discover listicles via Perplexity
      const targets = await discoverListicles(keyword, domainUrl, env);

      if (targets.length === 0) {
        console.log(`[Barnacle] No targets found for keyword: ${keyword}`);
        continue;
      }

      console.log(`[Barnacle] Found ${targets.length} targets for "${keyword}"`);

      // 2. For each target, find the author and draft an email
      for (const target of targets.slice(0, 3)) { // Limit to 3 targets per keyword
        const author = await findAuthor(target.listicle_url, env);

        if (!author) {
          console.log(`[Barnacle] No author email found for ${target.listicle_url}`);
          continue;
        }

        // 3. Draft the outreach email
        const draft = buildOutreachDraft(domainId, domainUrl, target, author, keyword);
        allDrafts.push(draft);

        // 4. Save to D1 as "awaiting_approval" — NEVER send autonomously
        await saveDraftToApprovalQueue(draft, env);
      }
    } catch (err) {
      console.error(`[Barnacle] Error processing keyword "${keyword}":`, err);
    }
  }

  console.log(`[Barnacle] Discovery complete — ${allDrafts.length} drafts queued for approval.`);
  return allDrafts;
}

// ─────────────────────────────────────────────────────────────
// Step 1: Discover Listicles via Perplexity
// ─────────────────────────────────────────────────────────────

async function discoverListicles(
  keyword: string,
  domainUrl: string,
  env: Env
): Promise<BarnacleTarget[]> {
  if (!env.PERPLEXITY_API_KEY) {
    console.warn("[Barnacle] PERPLEXITY_API_KEY not set — skipping discovery.");
    return [];
  }

  const cleanDomain = domainUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

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
            content: "You are an SEO researcher. Respond ONLY with a valid JSON array.",
          },
          {
            role: "user",
            content: `Find the top 10 listicle/roundup articles currently ranking for "${keyword}" that do NOT mention ${cleanDomain}. For each, return: {"listicle_url": "...", "listicle_title": "...", "keyword": "${keyword}", "estimated_traffic": "high|medium|low", "domain_authority": number|null}. Return a JSON array.`,
          },
        ],
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      console.error(`[Barnacle] Perplexity API error: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON array
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as BarnacleTarget[];
      return parsed.filter(
        (t) => t.listicle_url && t.listicle_title
      );
    }

    return [];
  } catch (err) {
    console.error("[Barnacle] Listicle discovery failed:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Step 2: Find Author via Hunter.io
// ─────────────────────────────────────────────────────────────

async function findAuthor(
  targetUrl: string,
  env: Env
): Promise<HunterResult | null> {
  if (!env.HUNTER_API_KEY) {
    console.warn("[Barnacle] HUNTER_API_KEY not set — skipping author lookup.");
    return null;
  }

  try {
    // Extract domain from URL
    const targetDomain = new URL(targetUrl).hostname;

    const res = await fetch(
      `${HUNTER_API_BASE}/domain-search?domain=${encodeURIComponent(targetDomain)}&type=personal&limit=1&api_key=${env.HUNTER_API_KEY}`
    );

    if (!res.ok) {
      console.error(`[Barnacle] Hunter.io error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      data: {
        emails: Array<{
          value: string;
          first_name: string;
          last_name: string;
          position: string | null;
          confidence: number;
        }>;
      };
    };

    const emails = data.data?.emails;
    if (emails && emails.length > 0) {
      const top = emails[0];
      return {
        email: top.value,
        first_name: top.first_name,
        last_name: top.last_name,
        position: top.position,
        confidence: top.confidence,
      };
    }

    return null;
  } catch (err) {
    console.error("[Barnacle] Hunter.io lookup failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Step 3: Draft Outreach Email
// ─────────────────────────────────────────────────────────────

function buildOutreachDraft(
  domainId: string,
  domainUrl: string,
  target: BarnacleTarget,
  author: HunterResult,
  keyword: string
): BarnacleOutreachDraft {
  const brandDomain = domainUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const firstName = author.first_name || "there";

  const subject = `Quick addition to your "${keyword}" roundup?`;

  const body = `Hi ${firstName},

I came across your article "${target.listicle_title}" while researching ${keyword} — it's a fantastic resource.

I noticed ${brandDomain} isn't included yet, and I think it would be a valuable addition for your readers. Here's a quick summary you can drop in:

"${brandDomain} — [BRAND_DESCRIPTION_HERE]. Their approach to ${keyword} focuses on quality, sustainability, and transparency."

I'm happy to provide:
• A fully formatted, ready-to-paste blurb with relevant stats
• High-resolution product images
• An exclusive affiliate deal for your audience (if applicable)

Would you be open to adding us? I'd be grateful for the inclusion.

Best regards,
The ${brandDomain} Team`;

  return {
    domain_id: domainId,
    target_url: target.listicle_url,
    target_title: target.listicle_title,
    keyword,
    contact_email: author.email,
    contact_name: `${author.first_name} ${author.last_name}`.trim(),
    subject,
    body,
    status: "awaiting_approval",
    created_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Step 4: Save to Approval Queue (NEVER auto-send)
// ─────────────────────────────────────────────────────────────

async function saveDraftToApprovalQueue(
  draft: BarnacleOutreachDraft,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO Barnacle_Outreach (domain_id, target_url, target_title, keyword, contact_email, contact_name, subject, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', ?)`
  )
    .bind(
      draft.domain_id,
      draft.target_url,
      draft.target_title,
      draft.keyword,
      draft.contact_email,
      draft.contact_name,
      draft.subject,
      draft.body,
      draft.created_at,
    )
    .run();
}
