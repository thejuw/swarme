/**
 * outreach.ts — Phase 38: Autonomous Link Building & Outreach
 *
 * Pipeline:
 *  1. findLinkProspects(keyword, env) → Perplexity API discovers relevant blogs
 *  2. Hunter.io /v2/domain-search extracts contact emails
 *  3. Heavy LLM (OpenAI) drafts personalized outreach emails
 *  4. Drafts are saved to D1 as "Draft" — NEVER sent autonomously
 *  5. Human operator reviews/edits/approves in Mission Control → Outreach tab
 *  6. Approved emails are dispatched via Resend API
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LinkProspect {
  url: string;
  domain: string;
  title: string;
  relevance_snippet: string;
}

export interface EnrichedProspect extends LinkProspect {
  contact_name: string | null;
  contact_email: string | null;
  domain_authority: number | null;
}

export interface OutreachDraft {
  prospect: EnrichedProspect;
  subject: string;
  body: string;
}

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PERPLEXITY_API_KEY: string;
  OPENAI_API_KEY: string;
  HUNTER_API_KEY: string;
  RESEND_API_KEY: string;
}

// ─────────────────────────────────────────────────────────────
// Step 1: Discover link prospects via Perplexity
// ─────────────────────────────────────────────────────────────

export async function findLinkProspects(
  keyword: string,
  env: Env,
): Promise<LinkProspect[]> {
  const prompt = `Find 10 high-quality blogs and resource pages that write about "${keyword}" and would be good targets for guest posts or link placement. For each result, provide the exact URL, page title, and a one-sentence summary of why it's relevant. Return ONLY valid JSON as an array of objects with keys: url, title, relevance_snippet. No markdown.`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You are a link-building research assistant. Return ONLY valid JSON arrays, no markdown fences." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const raw = data.choices?.[0]?.message?.content ?? "[]";
  // Strip potential markdown fences
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").trim();
  const prospects: LinkProspect[] = JSON.parse(cleaned);

  return prospects.map((p) => ({
    url: p.url,
    domain: new URL(p.url).hostname.replace(/^www\./, ""),
    title: p.title,
    relevance_snippet: p.relevance_snippet,
  }));
}

// ─────────────────────────────────────────────────────────────
// Step 2: Enrich with Hunter.io Domain Search
// ─────────────────────────────────────────────────────────────

export async function enrichWithHunter(
  prospects: LinkProspect[],
  env: Env,
): Promise<EnrichedProspect[]> {
  const enriched: EnrichedProspect[] = [];

  for (const prospect of prospects) {
    try {
      const hunterUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(prospect.domain)}&api_key=${env.HUNTER_API_KEY}&limit=1&type=personal`;

      const res = await fetch(hunterUrl);
      if (!res.ok) {
        enriched.push({
          ...prospect,
          contact_name: null,
          contact_email: null,
          domain_authority: null,
        });
        continue;
      }

      const data = (await res.json()) as {
        data: {
          emails: { value: string; first_name: string; last_name: string }[];
          organization?: string;
        };
      };

      const topEmail = data.data?.emails?.[0];
      enriched.push({
        ...prospect,
        contact_name: topEmail
          ? `${topEmail.first_name} ${topEmail.last_name}`.trim()
          : null,
        contact_email: topEmail?.value ?? null,
        domain_authority: null, // Could integrate Moz/Ahrefs API in future
      });
    } catch {
      enriched.push({
        ...prospect,
        contact_name: null,
        contact_email: null,
        domain_authority: null,
      });
    }
  }

  return enriched;
}

// ─────────────────────────────────────────────────────────────
// Step 3: Draft personalized outreach emails via OpenAI
// ─────────────────────────────────────────────────────────────

export async function draftOutreachEmails(
  prospects: EnrichedProspect[],
  keyword: string,
  brandName: string,
  brandUrl: string,
  env: Env,
): Promise<OutreachDraft[]> {
  const drafts: OutreachDraft[] = [];

  for (const prospect of prospects) {
    if (!prospect.contact_email) continue;

    const systemPrompt = `You are an expert outreach copywriter for ${brandName}. Write professional, warm, non-spammy outreach emails for link-building. Keep emails under 150 words. Be specific about the prospect's content.`;

    const userPrompt = `Draft a personalized outreach email to ${prospect.contact_name || "the editor"} at ${prospect.domain}.

Context:
- Their page: "${prospect.title}" (${prospect.url})
- Why relevant: ${prospect.relevance_snippet}
- Our brand: ${brandName} (${brandUrl})
- Target keyword: "${keyword}"

Return JSON with keys: subject, body. The body should be plain text with \\n for line breaks. No markdown.`;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };

      const raw = data.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { subject: string; body: string };

      drafts.push({
        prospect,
        subject: parsed.subject,
        body: parsed.body,
      });
    } catch {
      // Skip failed drafts — operator can manually draft
    }
  }

  return drafts;
}

// ─────────────────────────────────────────────────────────────
// Step 4: Persist drafts to D1 (status = 'Draft')
// ─────────────────────────────────────────────────────────────

export async function saveDraftsToD1(
  drafts: OutreachDraft[],
  projectId: string,
  keyword: string,
  env: Env,
): Promise<string[]> {
  const ids: string[] = [];

  for (const draft of drafts) {
    const id = `oc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(
      `INSERT INTO Outreach_Campaigns
        (id, project_id, keyword, target_url, target_email, contact_name, outreach_draft, status, domain_authority, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
    )
      .bind(
        id,
        projectId,
        keyword,
        draft.prospect.url,
        draft.prospect.contact_email,
        draft.prospect.contact_name,
        JSON.stringify({ subject: draft.subject, body: draft.body }),
        draft.prospect.domain_authority,
        null,
      )
      .run();

    ids.push(id);
  }

  return ids;
}

// ─────────────────────────────────────────────────────────────
// Step 5: Send approved email via Resend
// ─────────────────────────────────────────────────────────────

export async function sendOutreachEmail(
  campaignId: string,
  fromEmail: string,
  env: Env,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Fetch campaign from D1
  const row = await env.DB.prepare(
    `SELECT * FROM Outreach_Campaigns WHERE id = ?`,
  )
    .bind(campaignId)
    .first<{
      id: string;
      target_email: string;
      contact_name: string | null;
      outreach_draft: string;
      status: string;
    }>();

  if (!row) return { success: false, error: "Campaign not found" };
  if (row.status !== "Approved") {
    return { success: false, error: `Cannot send — status is "${row.status}", must be "Approved"` };
  }
  if (!row.target_email) {
    return { success: false, error: "No target email address" };
  }

  const draft = JSON.parse(row.outreach_draft) as {
    subject: string;
    body: string;
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: row.target_email,
      subject: draft.subject,
      text: draft.body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Resend error ${res.status}: ${errText}` };
  }

  const result = (await res.json()) as { id: string };

  // Update status to Sent
  await env.DB.prepare(
    `UPDATE Outreach_Campaigns SET status = 'Sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(campaignId)
    .run();

  return { success: true, messageId: result.id };
}

// ─────────────────────────────────────────────────────────────
// Orchestrator: Full pipeline (called by cron or manual trigger)
// ─────────────────────────────────────────────────────────────

export async function runOutreachPipeline(
  projectId: string,
  keyword: string,
  brandName: string,
  brandUrl: string,
  env: Env,
): Promise<{ prospects_found: number; drafts_created: number; ids: string[] }> {
  // 1. Discover
  const prospects = await findLinkProspects(keyword, env);

  // 2. Enrich
  const enriched = await enrichWithHunter(prospects, env);

  // 3. Draft
  const drafts = await draftOutreachEmails(enriched, keyword, brandName, brandUrl, env);

  // 4. Save — all as Draft, NEVER sent autonomously
  const ids = await saveDraftsToD1(drafts, projectId, keyword, env);

  return {
    prospects_found: prospects.length,
    drafts_created: drafts.length,
    ids,
  };
}
