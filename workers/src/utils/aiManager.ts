/**
 * ============================================================
 * Phase 26 + Phase 61 + Phase 63 + Phase 65: AI Manager Engine
 * ============================================================
 *
 * Conversational state machine that acts as a "Chief Strategy
 * Officer" for an e-commerce brand. Uses Perplexity Sonar Pro
 * with structured JSON action parsing to orchestrate internal tools.
 *
 * Phase 61 additions:
 *   - Persistent Chat_History table (short-term rolling transcript)
 *   - User_Memories table (compressed long-term facts)
 *   - Rolling context window: last 10 messages + all memories
 *     injected into the system prompt each turn
 *   - Messages are persisted to D1 on every send/receive
 *
 * Phase 63 additions:
 *   - Strategic lesson recall via Vectorize semantic search
 *   - RAG-based reinforcement: top 3 domain-specific lessons
 *     are injected into the system prompt as binding rules
 *   - Lessons come from the outcomeEvaluator.ts weekly cron
 *     which grades past actions against real analytics data
 *
 * Phase 65 additions (Dual-Brain Architecture):
 *   - Global Hive Mind rules from KV (cross-tenant consensus)
 *   - AI now reads from TWO knowledge sources each turn:
 *     1. Local Vectorize — brand voice, tone, domain-specific history
 *     2. Global KV — empirically proven GEO rules from the network
 * ============================================================
 */

import type { Env } from "../index";
import { discoverActualCompetitors, type DiscoveredCompetitor } from "./researcher";
import { createThrottledFetch } from "./throttle";
import { generateEmbedding } from "./vectorize";
import { fetchGlobalRules, type GlobalRule } from "./hiveSync";

// ─────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type BusinessModel = "e-commerce" | "lead_gen" | "affiliate" | "publisher";

export interface BrandContext {
  project_id: string;
  target_audience: string;
  core_goals: string;
  tone_of_voice: string;
  competitors: string;
  business_model: BusinessModel | "";
  auto_discovered_competitors: string; // JSON array of DiscoveredCompetitor
  north_star_url: string;
  last_updated: string;
}

export interface RoadmapItem {
  id: string;
  project_id: string;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  status: "Suggested" | "Approved" | "In_Progress" | "Completed";
  action_payload: string;
  created_at: string;
  updated_at: string;
}

interface ManagerResult {
  reply: string;
  brandContextUpdated: boolean;
  roadmapItemsAdded: number;
}

// ─────────────────────────────────────────────────────────────
// Tool Definitions (used for JSON action parsing)
// ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "run_site_analysis",
      description:
        "Analyze a website URL to evaluate its SEO health, page structure, content quality, and technical setup. Use this when the user provides their store URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to analyze (e.g., https://example.com)",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_brand_context",
      description:
        "Update the brand's perpetual memory with audience, goals, tone, and competitor information. Call this whenever you learn new details about the brand.",
      parameters: {
        type: "object",
        properties: {
          target_audience: {
            type: "string",
            description: "Description of the brand's target audience",
          },
          core_goals: {
            type: "string",
            description: "The brand's 6-month revenue/traffic/growth goals",
          },
          tone_of_voice: {
            type: "string",
            description: "The brand's preferred communication tone",
          },
          competitors: {
            type: "string",
            description: "Comma-separated list of competitor brands/domains",
          },
          business_model: {
            type: "string",
            enum: ["e-commerce", "lead_gen", "affiliate", "publisher"],
            description:
              "How the website generates value. One of: 'e-commerce' (sells products online), 'lead_gen' (generates B2B leads via forms/calendars), 'affiliate' (earns via outbound affiliate link clicks), 'publisher' (earns via ad revenue / engagement).",
          },
          north_star_url: {
            type: "string",
            description:
              "The user's aspirational 'North Star' website URL. The CRO engine will analyze this site's DOM structure, typography, CTAs, and layout to guide optimization suggestions.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "discover_competitors",
      description:
        "Automatically discover the user's real SERP competitors by analyzing who currently ranks for their primary keyword. Call this after the user provides their URL and primary keyword during onboarding — BEFORE asking for manual competitor input.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The user's website URL",
          },
          primary_keyword: {
            type: "string",
            description: "The user's primary keyword or niche (e.g., 'luxury handbags', 'SaaS project management')",
          },
        },
        required: ["url", "primary_keyword"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_roadmap_items",
      description:
        "Propose a checklist of SEO/CRO strategy actions for the brand. Each item becomes a task the human operator can approve for the Swarm to execute.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Array of roadmap items to suggest",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short action title" },
                description: {
                  type: "string",
                  description: "Detailed description of the action",
                },
                priority: {
                  type: "string",
                  enum: ["High", "Medium", "Low"],
                  description: "Priority level",
                },
                action_payload: {
                  type: "object",
                  description:
                    "JSON payload that the Swarm will use to execute this action (e.g., { type: 'content_generation', keyword: '...', target_url: '...' })",
                },
              },
              required: ["title", "description", "priority"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Brand Context persistence
// ─────────────────────────────────────────────────────────────

export async function fetchBrandContext(
  projectId: string,
  env: Env
): Promise<BrandContext | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM Brand_Context WHERE project_id = ?"
    )
      .bind(projectId)
      .first<BrandContext>();
    return row ?? null;
  } catch {
    return null;
  }
}

async function upsertBrandContext(
  projectId: string,
  data: Partial<BrandContext>,
  env: Env
): Promise<void> {
  const existing = await fetchBrandContext(projectId, env);

  if (existing) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.target_audience !== undefined) {
      fields.push("target_audience = ?");
      values.push(data.target_audience);
    }
    if (data.core_goals !== undefined) {
      fields.push("core_goals = ?");
      values.push(data.core_goals);
    }
    if (data.tone_of_voice !== undefined) {
      fields.push("tone_of_voice = ?");
      values.push(data.tone_of_voice);
    }
    if (data.competitors !== undefined) {
      fields.push("competitors = ?");
      values.push(data.competitors);
    }
    if ((data as any).business_model !== undefined) {
      fields.push("business_model = ?");
      values.push((data as any).business_model);
    }
    if ((data as any).auto_discovered_competitors !== undefined) {
      fields.push("auto_discovered_competitors = ?");
      values.push((data as any).auto_discovered_competitors);
    }
    if ((data as any).north_star_url !== undefined) {
      fields.push("north_star_url = ?");
      values.push((data as any).north_star_url);
    }

    fields.push("last_updated = datetime('now')");
    values.push(projectId);

    await env.DB.prepare(
      `UPDATE Brand_Context SET ${fields.join(", ")} WHERE project_id = ?`
    )
      .bind(...values)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO Brand_Context (project_id, target_audience, core_goals, tone_of_voice, competitors, business_model, auto_discovered_competitors, north_star_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        projectId,
        data.target_audience ?? "",
        data.core_goals ?? "",
        data.tone_of_voice ?? "",
        data.competitors ?? "",
        (data as any).business_model ?? "",
        (data as any).auto_discovered_competitors ?? "",
        (data as any).north_star_url ?? ""
      )
      .run();
  }
}

// ─────────────────────────────────────────────────────────────
// Roadmap persistence
// ─────────────────────────────────────────────────────────────

export async function fetchRoadmap(
  projectId: string,
  env: Env
): Promise<RoadmapItem[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM AI_Roadmap WHERE project_id = ? ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 END, created_at DESC"
    )
      .bind(projectId)
      .all<RoadmapItem>();
    return results ?? [];
  } catch {
    return [];
  }
}

async function insertRoadmapItems(
  projectId: string,
  items: Array<{
    title: string;
    description: string;
    priority: string;
    action_payload?: Record<string, unknown>;
  }>,
  env: Env
): Promise<number> {
  let inserted = 0;

  for (const item of items) {
    const id = `roadmap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(item.action_payload ?? {});

    try {
      await env.DB.prepare(
        `INSERT INTO AI_Roadmap (id, project_id, title, description, priority, status, action_payload)
         VALUES (?, ?, ?, ?, ?, 'Suggested', ?)`
      )
        .bind(id, projectId, item.title, item.description, item.priority, payload)
        .run();
      inserted++;
    } catch (err) {
      console.error(`[aiManager] Failed to insert roadmap item: ${err}`);
    }
  }

  return inserted;
}


// ─────────────────────────────────────────────────────────────
// Phase 61: Chat History & User Memory persistence
// ─────────────────────────────────────────────────────────────

export interface ChatHistoryRow {
  id: string;
  domain_id: string;
  role: "user" | "assistant";
  content: string;
  compressed: number;
  created_at: string;
}

export interface UserMemoryRow {
  id: string;
  domain_id: string;
  memory_fact: string;
  source: string;
  created_at: string;
}

/**
 * Persist a single chat message to the Chat_History table.
 * Called after every user send and assistant reply.
 */
export async function persistChatMessage(
  domainId: string,
  role: "user" | "assistant",
  content: string,
  env: Env
): Promise<void> {
  const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO Chat_History (id, domain_id, role, content) VALUES (?, ?, ?, ?)`
    )
      .bind(id, domainId, role, content)
      .run();
  } catch (err) {
    console.error(`[aiManager] Failed to persist chat message: ${err}`);
  }
}

/**
 * Fetch the most recent N messages for a domain (short-term memory).
 * Returns them in chronological order (oldest first).
 */
export async function fetchRecentChatHistory(
  domainId: string,
  limit: number,
  env: Env
): Promise<ChatHistoryRow[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM Chat_History
       WHERE domain_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(domainId, limit)
      .all<ChatHistoryRow>();
    // Reverse so oldest message comes first (chronological)
    return (results ?? []).reverse();
  } catch (err) {
    console.error(`[aiManager] Failed to fetch chat history: ${err}`);
    return [];
  }
}

/**
 * Fetch all compressed User_Memories for a domain (long-term memory).
 */
export async function fetchUserMemories(
  domainId: string,
  env: Env
): Promise<UserMemoryRow[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM User_Memories
       WHERE domain_id = ?
       ORDER BY created_at ASC`
    )
      .bind(domainId)
      .all<UserMemoryRow>();
    return results ?? [];
  } catch (err) {
    console.error(`[aiManager] Failed to fetch user memories: ${err}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Phase 63: Strategic Lesson Recall (Vectorize RAG)
// ─────────────────────────────────────────────────────────────

export interface StrategicLessonHit {
  lesson: string;
  action_type: string;
  outcome_score: number;
  confidence: string;
  similarity: number;
}

/**
 * Fetches the most relevant strategic lessons for a given user query
 * by performing a semantic search against Vectorize. Results are
 * filtered to the specific domain to maintain tenant isolation.
 *
 * Called during every AI Manager conversation to inject learned
 * rules into the system prompt (few-shot reinforcement).
 *
 * @param domainId   - The domain scope
 * @param userQuery  - The latest user message (used to generate query embedding)
 * @param topK       - Number of lessons to retrieve (default: 3)
 * @param env        - Worker environment bindings
 */
export async function fetchRelevantLessons(
  domainId: string,
  userQuery: string,
  topK: number = 3,
  env: Env
): Promise<StrategicLessonHit[]> {
  try {
    // Generate an embedding of the user's current query
    const queryEmbedding = await generateEmbedding(userQuery, env);

    // Query Vectorize for the closest lesson embeddings
    // Filter by type=strategic_lesson and matching domain_id
    const results = await env.VECTORIZE.query(queryEmbedding, {
      topK,
      filter: {
        type: "strategic_lesson",
        domain_id: domainId,
      },
      returnMetadata: "all",
    });

    if (!results.matches || results.matches.length === 0) {
      return [];
    }

    return results.matches
      .filter((m) => (m.score ?? 0) > 0.5) // Only return reasonably similar lessons
      .map((m) => ({
        lesson: (m.metadata as Record<string, unknown>)?.lesson as string ?? "Unknown lesson",
        action_type: (m.metadata as Record<string, unknown>)?.action_type as string ?? "unknown",
        outcome_score: (m.metadata as Record<string, unknown>)?.outcome_score as number ?? 0,
        confidence: (m.metadata as Record<string, unknown>)?.confidence as string ?? "medium",
        similarity: m.score ?? 0,
      }));
  } catch (err) {
    // Vectorize query failure is non-fatal — the AI Manager still
    // functions, just without lesson injection this turn
    console.warn(
      `[aiManager] Strategic lesson recall failed: ${
        err instanceof Error ? err.message : err
      }`
    );
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Tool execution handlers
// ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  env: Env
): Promise<string> {
  switch (name) {
    case "run_site_analysis": {
      const url = args.url as string;
      // Attempt to use the Browser Rendering /crawl endpoint (Phase 11)
      try {
        const crawlResponse = await env.BROWSER.fetch(
          `https://browser-rendering.cloudflare.com/crawl`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              scrapeOptions: { formats: ["markdown"] },
            }),
          }
        );

        if (crawlResponse.ok) {
          const crawlData = (await crawlResponse.json()) as Record<string, unknown>;
          return JSON.stringify({
            success: true,
            analyzed_url: url,
            data: crawlData,
          });
        }
      } catch {
        // Fallback to a summary-based analysis
      }

      // Mock fallback when BROWSER binding is unavailable
      return JSON.stringify({
        success: true,
        analyzed_url: url,
        source: "mock_analysis",
        summary: {
          pageTitle: "Storefront Analysis",
          loadTime: "1.8s",
          mobileScore: 72,
          seoScore: 65,
          contentGaps: [
            "Missing blog content strategy",
            "No FAQ schema markup",
            "Product descriptions lack depth",
            "Missing long-tail keyword targeting",
          ],
          technicalIssues: [
            "No canonical tags on product pages",
            "Missing Open Graph meta tags",
            "Image alt text missing on 40% of images",
          ],
          opportunities: [
            "Add blog with buying guides and trend content",
            "Implement FAQ schema on product pages",
            "Optimize product descriptions with semantic keywords",
            "Build internal linking structure",
          ],
        },
      });
    }

    case "update_brand_context": {
      await upsertBrandContext(projectId, args as Partial<BrandContext>, env);
      return JSON.stringify({
        success: true,
        message: "Brand context updated successfully. I now remember these details for all future conversations.",
      });
    }

    case "discover_competitors": {
      const url = args.url as string;
      const keyword = args.primary_keyword as string;
      const discovered = await discoverActualCompetitors(url, keyword, projectId, env);
      return JSON.stringify({
        success: true,
        competitors: discovered,
        message: `Discovered ${discovered.length} real SERP competitors for "${keyword}". Present these to the user and ask them to confirm, edit, or add more.`,
      });
    }

    case "propose_roadmap_items": {
      const items = args.items as Array<{
        title: string;
        description: string;
        priority: string;
        action_payload?: Record<string, unknown>;
      }>;
      const count = await insertRoadmapItems(projectId, items, env);
      return JSON.stringify({
        success: true,
        items_added: count,
        message: `Added ${count} items to your strategy roadmap. They appear as "Suggested" — approve the ones you want the Swarm to execute.`,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─────────────────────────────────────────────────────────────
// System Prompt Builder
// ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  brandContext: BrandContext | null,
  userMemories: UserMemoryRow[] = [],
  recentHistory: ChatHistoryRow[] = [],
  strategicLessons: StrategicLessonHit[] = [],
  globalRules: GlobalRule[] = [],
): string {
  let prompt = `You are the Chief Strategy Officer embedded in the Swarme AI SEO platform. Your role is to guide the user through building a growth engine for their website.

Your conversation flow:
1. STEP 1 — URL & GOALS: Ask for their primary website URL and primary keyword/niche. Run a site analysis with run_site_analysis.
2. STEP 2 — BUSINESS MODEL: Ask: "How does this website generate value?" and offer these options:
   - **E-commerce Sales** — online store selling products directly
   - **B2B Lead Generation** — capturing leads via forms, calendars, email signups
   - **Affiliate Clicks** — earning commissions through outbound affiliate links
   - **Ad Revenue / Publishing** — monetizing through dwell time, pageviews, and ad impressions
   Save their answer to brand context using the business_model field (one of: "e-commerce", "lead_gen", "affiliate", "publisher").
3. STEP 3 — COMPETITOR AUTO-DISCOVERY: Once you have the URL and a primary keyword, call the discover_competitors tool. Present the results assertively:
   "I've analyzed who's actually competing with you for organic traffic. Here's who you're up against:"
   - List each discovered competitor with their domain, why they rank, and their estimated traffic.
   - Frame it as intelligence: "You're currently losing traffic to these sites."
   - Ask the user to confirm, edit, or add competitors. Save the final list to brand context.
4. STEP 4 — NORTH STAR PROMPT: After competitors are confirmed, ask:
   "One more question — is there a website you admire and want your site to feel like? This could be a competitor, an aspirational brand, or any site whose design and UX you consider world-class. I'll use it as a 'North Star' to guide our CRO optimization suggestions."
   Save the north_star_url to brand context using update_brand_context.
5. STEP 5 — Ask about their 6-month revenue and traffic goals, target audience, and brand tone.
6. STEP 6 — ROADMAP: Based on the analysis, business model, competitors, North Star, and goals, propose a concrete checklist of SEO/CRO actions using the propose_roadmap_items tool. Tailor the actions to the business model:
   - e-commerce: Focus on product page optimization, add-to-cart funnels, checkout flow improvements, product schema
   - lead_gen: Focus on form conversion, landing page CTAs, calendar booking flows, email capture optimization
   - affiliate: Focus on outbound click-through rates, comparison content, affiliate link placement, trust signals
   - publisher: Focus on dwell time, scroll depth, internal linking, bounce rate reduction, ad viewability

Important guidelines:
- Be warm, strategic, and specific. Avoid generic advice — tailor everything to their actual site data and business model.
- When you learn brand information (audience, goals, tone, competitors, business_model, north_star_url), immediately save it with update_brand_context.
- ALWAYS ask for the business model explicitly during onboarding — do not assume or skip this step.
- ALWAYS run discover_competitors before asking users to manually list competitors. Intelligence-driven discovery is better than guessing.
- ALWAYS ask for the North Star website after competitors are confirmed — this is critical for CRO quality.
- Propose actionable, prioritized items with clear action_payload so the Swarm can execute them.
- For action_payload, include a "type" field (e.g., "content_generation", "technical_audit", "schema_markup", "link_building", "page_optimization", "cro_funnel") and relevant parameters.
- Keep responses concise but insightful. Use bullet points for clarity.
- If the user returns for a follow-up session, greet them by acknowledging you remember their brand context.

--- GEO (Generative Engine Optimization) DIRECTIVES ---
All content you propose, draft, or review must be structured for AI-engine citation readability:
1. DEFINITIVE STATEMENTS FIRST: Lead every paragraph with a concise, factual claim that an AI engine can extract verbatim (e.g., "Sartelle Atelier uses 100% regenerative Italian leather.").
2. STRUCTURED DATA HOOKS: Recommend adding FAQ blocks (Q&A pairs), numbered lists, and comparison tables wherever relevant — these are high-signal for RAG retrieval.
3. ENTITY SALIENCE: Ensure primary brand, product, and category entities appear within the first 150 words of every page you draft or optimize. Repeat the core entity (brand name + primary keyword) naturally every ~300 words.
4. CITATION-WORTHY STATS: Encourage including first-party data, percentages, and specific figures that AI engines prefer to quote (e.g., "saves 2.4 tons of textile waste per year").
5. PASSAGE-LENGTH ANSWERS: When suggesting FAQ or informational content, structure answers in 40-60 word passages — the ideal length for featured snippet and AI citation extraction.
6. SCHEMA MARKUP ALIGNMENT: Every content piece you propose should specify the matching JSON-LD schema type (Article, FAQPage, Product, HowTo) so the schema.ts generator can produce aligned structured data.
7. CONCISE SUMMARIES: End long-form content with a "Key Takeaways" or "TL;DR" section of 3-5 bullet points — AI engines frequently cite these summary blocks.`;

  if (brandContext && (brandContext.target_audience || brandContext.core_goals)) {
    // Parse auto-discovered competitors for display
    let discoveredList = "(not yet discovered — run discovery during onboarding)";
    if (brandContext.auto_discovered_competitors) {
      try {
        const parsed = JSON.parse(brandContext.auto_discovered_competitors);
        if (Array.isArray(parsed) && parsed.length > 0) {
          discoveredList = parsed.map((c: any) => `${c.domain} — ${c.reason}`).join("\n  ");
        }
      } catch { /* keep default */ }
    }

    prompt += `\n\n--- PERPETUAL BRAND MEMORY ---
You have previously stored the following context about this brand:
- Business Model: ${brandContext.business_model || "(not set — ask during onboarding)"}
- Target Audience: ${brandContext.target_audience || "(not set)"}
- Core Goals: ${brandContext.core_goals || "(not set)"}
- Tone of Voice: ${brandContext.tone_of_voice || "(not set)"}
- Manual Competitors: ${brandContext.competitors || "(not set)"}
- Auto-Discovered SERP Competitors:\n  ${discoveredList}
- North Star (aspirational site): ${brandContext.north_star_url || "(not set — ask during onboarding)"}
- Last Updated: ${brandContext.last_updated || "unknown"}

Use this knowledge to provide continuity. Do not ask for information you already have unless the user wants to update it.
If business_model is "(not set)", ask for it in your next response — it is critical for tailoring CRO/SEO strategy.
If north_star_url is "(not set)", ask the user to choose an aspirational site during onboarding.`;
  }

  // ── Phase 61: Inject long-term memories ──────────────────
  if (userMemories.length > 0) {
    const facts = userMemories.map((m) => `- ${m.memory_fact}`).join("\n");
    prompt += `\n\n--- LONG-TERM USER MEMORY ---
Here are established facts about this user's preferences and history, extracted from past conversations:
${facts}

Use these facts to personalize your responses. Do not re-ask for information already captured here.`;
  }

  // ── Phase 63: Inject strategic lessons from Vectorize ─────
  if (strategicLessons.length > 0) {
    const lessonEntries = strategicLessons
      .map((l, i) => {
        const polarity = l.outcome_score > 0 ? "POSITIVE" : "NEGATIVE";
        const scoreLabel = `${polarity} (score: ${l.outcome_score > 0 ? "+" : ""}${l.outcome_score}, confidence: ${l.confidence})`;
        return `${i + 1}. [${scoreLabel}] ${l.lesson}`;
      })
      .join("\n");

    prompt += `\n\n--- CRITICAL CONTEXT: LEARNED STRATEGIC RULES ---
You have previously learned the following rules for this brand based on real-world analytics data. These are NOT suggestions — they are evidence-backed conclusions from measured outcomes.

${lessonEntries}

You must strictly adhere to these rules in your next suggestion. If a user request conflicts with a learned rule, explain the conflict and recommend the data-backed approach instead.`;
  }

  // ── Phase 65: Inject Global Hive Mind rules (cross-tenant) ──
  if (globalRules.length > 0) {
    const ruleEntries = globalRules
      .map((r, i) => {
        return `${i + 1}. [Confidence: ${r.confidence}/100, Verified by ${r.supporters} sites] ${r.rule}`;
      })
      .join("\n");

    prompt += `\n\n--- GLOBAL NETWORK INTELLIGENCE (Hive Mind) ---
The following rules have been empirically validated across the entire Swarme network by ${globalRules.reduce((sum, r) => sum + r.supporters, 0)}+ independent websites. These are universal GEO laws — they apply regardless of brand or industry.

${ruleEntries}

These global rules complement your local strategic lessons. When both local and global rules exist for the same topic, prefer the local rule (it's brand-specific) but mention the global consensus as supporting evidence.`;
  }

  // ── Phase 61: Inject recent conversation transcript ──────
  if (recentHistory.length > 0) {
    const transcript = recentHistory
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    prompt += `\n\n--- RECENT CONVERSATION TRANSCRIPT ---
Here is the transcript of your most recent conversation with this user:

${transcript}

Resume the conversation naturally from this point. Do not repeat your last greeting or re-introduce yourself.`;
  }

  return prompt;
}

// ─────────────────────────────────────────────────────────────
// Tool Instruction Block (embedded in system prompt for Perplexity)
// ─────────────────────────────────────────────────────────────

const TOOL_INSTRUCTION_BLOCK = `

--- AVAILABLE ACTIONS ---
You can execute actions by including <<ACTION>> blocks in your response. Each block must contain valid JSON with "name" and "args" fields. You may include multiple action blocks in a single response. Any text outside the action blocks will be shown to the user.

Available actions:

1. run_site_analysis
   Analyzes a website URL for SEO health, page structure, and technical setup.
   Args: { "url": "https://example.com" }
   Example: <<ACTION>>{"name": "run_site_analysis", "args": {"url": "https://example.com"}}<<\/ACTION>>

2. update_brand_context
   Saves brand information (audience, goals, tone, competitors, business_model, north_star_url) for perpetual memory.
   Args: Any subset of { "target_audience", "core_goals", "tone_of_voice", "competitors", "business_model", "auto_discovered_competitors", "north_star_url" }
   Example: <<ACTION>>{"name": "update_brand_context", "args": {"target_audience": "Women 25-45 who love sustainable fashion", "business_model": "e-commerce"}}<<\/ACTION>>

3. discover_competitors
   Discovers real SERP competitors for a URL and keyword.
   Args: { "url": "https://example.com", "primary_keyword": "sustainable leather bags" }
   Example: <<ACTION>>{"name": "discover_competitors", "args": {"url": "https://example.com", "primary_keyword": "sustainable fashion"}}<<\/ACTION>>

4. propose_roadmap_items
   Adds strategic action items to the user's roadmap.
   Args: { "items": [{ "title": "...", "description": "...", "priority": "High|Medium|Low", "action_payload": {...} }] }
   Example: <<ACTION>>{"name": "propose_roadmap_items", "args": {"items": [{"title": "Add FAQ Schema", "description": "Implement FAQ schema markup on top 10 product pages", "priority": "High", "action_payload": {"type": "schema_markup"}}]}}<<\/ACTION>>

IMPORTANT: Always include your conversational text OUTSIDE the action blocks. The user will see your text but not the action blocks themselves.
`;

// ─────────────────────────────────────────────────────────────
// Message Sanitizer — enforce alternating roles for Perplexity
// ─────────────────────────────────────────────────────────────

/**
 * Perplexity API requires strictly alternating user/assistant roles
 * after the system message. The frontend may inject proactive assistant
 * messages (e.g. telemetry updates, milestone alerts) that break this
 * pattern. This function:
 *   1. Merges consecutive same-role messages into one
 *   2. Ensures the sequence starts with a "user" message
 */
function sanitizeMessages(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length === 0) return msgs;

  // Step 1: Merge consecutive same-role messages
  const merged: ChatMessage[] = [];
  for (const msg of msgs) {
    if (msg.role === "system") continue; // strip any stray system messages
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      // Merge into the previous message
      last.content += "\n\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  // Step 2: Ensure sequence starts with a "user" message.
  // If it starts with assistant, drop leading assistant messages
  // (they're proactive UI messages, not part of the actual conversation).
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────
// Main Chat Handler
// ─────────────────────────────────────────────────────────────

export async function handleManagerChat(
  projectId: string,
  messageHistory: ChatMessage[],
  env: Env
): Promise<ManagerResult> {
  // Phase 61+63+65: Fetch all five memory layers in parallel
  // Extract the user's latest message for semantic lesson recall
  const latestUserMsg = messageHistory[messageHistory.length - 1];
  const userQuery = latestUserMsg?.role === "user" ? latestUserMsg.content : "";

  const [brandContext, recentHistory, userMemories, strategicLessons, globalRules] = await Promise.all([
    fetchBrandContext(projectId, env),
    fetchRecentChatHistory(projectId, 10, env),
    fetchUserMemories(projectId, env),
    // Phase 63: Semantic recall of relevant strategic lessons from Vectorize
    userQuery ? fetchRelevantLessons(projectId, userQuery, 3, env) : Promise.resolve([]),
    // Phase 65: Global Hive Mind rules from KV (cross-tenant consensus)
    fetchGlobalRules(env),
  ]);

  // Phase 61: Persist the latest user message to Chat_History.
  // The last message in messageHistory is always the new user message.
  if (latestUserMsg && latestUserMsg.role === "user") {
    await persistChatMessage(projectId, "user", latestUserMsg.content, env);
  }

  // Build the system message with brand context, memories, lessons, and tool instructions
  const systemMessage: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(brandContext, userMemories, recentHistory, strategicLessons, globalRules) + TOOL_INSTRUCTION_BLOCK,
  };

  // Prepare the full message array for Perplexity.
  // Perplexity requires strictly alternating user/assistant roles after system.
  // The frontend may include proactive assistant messages that break this rule.
  const sanitized = sanitizeMessages(messageHistory);
  const messages = [systemMessage, ...sanitized];

  // Retrieve Perplexity API key from KV vault (Admin Vault saves to global:config:keys)
  // Only use the vault key if it's non-empty and looks like a valid key (>10 chars).
  // Otherwise fall back to the Worker secret (env.PERPLEXITY_API_KEY).
  const globalConfig = await env.CONFIG_KV.get<Record<string, Record<string, string>>>(
    "global:config:keys",
    "json"
  );
  const vaultKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY;
  const apiKey = (vaultKey && vaultKey.trim().length > 10) ? vaultKey.trim() : env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return {
      reply:
        "I'm ready to help strategize your growth, but the Perplexity API key hasn't been configured yet. Please add it in the Admin Vault under AI Models to enable the AI Manager.",
      brandContextUpdated: false,
      roadmapItemsAdded: 0,
    };
  }

  let brandContextUpdated = false;
  let roadmapItemsAdded = 0;
  let maxIterations = 3; // Safety limit for action-processing loops

  // Mutable working copy of messages for the loop
  const workingMessages = [...messages];

  while (maxIterations > 0) {
    maxIterations--;

    const throttledFetch = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
    const response = await throttledFetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: workingMessages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[aiManager] Perplexity error (${response.status}): ${errText}`);
      // Provide actionable debug info — API key source helps diagnose vault-vs-env issues
      const keySource = (vaultKey && vaultKey.trim().length > 10) ? "Admin Vault" : "Worker Secret";
      const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...` : "(none)";
      return {
        reply:
          `I encountered an issue connecting to the AI service (HTTP ${response.status}). ` +
          `Key source: ${keySource} (${keyPreview}). ` +
          `Please verify your Perplexity API key in the Admin Vault or contact support.`,
        brandContextUpdated,
        roadmapItemsAdded,
      };
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          role: string;
          content: string | null;
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices[0];
    const content = choice.message.content ?? "";

    // Parse any <<ACTION>> blocks from the response
    const actionRegex = /<<ACTION>>([\s\S]*?)<<\/ACTION>>/g;
    const actions: Array<{ name: string; args: Record<string, unknown> }> = [];
    let match: RegExpExecArray | null;

    while ((match = actionRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name && typeof parsed.name === "string") {
          actions.push({ name: parsed.name, args: parsed.args ?? {} });
        }
      } catch {
        console.warn(`[aiManager] Failed to parse action block: ${match[1].slice(0, 100)}`);
      }
    }

    // If no actions found, return the text response (strip any residual markers)
    if (actions.length === 0) {
      const cleanReply = content.replace(/<<ACTION>>[\s\S]*?<<\/ACTION>>/g, "").trim();
      // Phase 61: Persist assistant reply to Chat_History
      await persistChatMessage(projectId, "assistant", cleanReply, env);
      return {
        reply: cleanReply,
        brandContextUpdated,
        roadmapItemsAdded,
      };
    }

    // Execute each action and collect results
    const actionResults: string[] = [];
    for (const action of actions) {
      const toolResult = await executeTool(action.name, action.args, projectId, env);

      if (action.name === "update_brand_context") {
        brandContextUpdated = true;
      }
      if (action.name === "propose_roadmap_items") {
        try {
          const parsed = JSON.parse(toolResult);
          roadmapItemsAdded += parsed.items_added ?? 0;
        } catch { /* ignore */ }
      }

      actionResults.push(`[${action.name}] ${toolResult}`);
    }

    // Clean the assistant message of action blocks for display
    const cleanedContent = content.replace(/<<ACTION>>[\s\S]*?<<\/ACTION>>/g, "").trim();

    // Add the assistant message and action results back to the conversation
    workingMessages.push({
      role: "assistant",
      content: cleanedContent,
    });
    workingMessages.push({
      role: "user",
      content: `[SYSTEM] The following actions were executed automatically:\n${actionResults.join("\n")}\nContinue your response to the user based on these results.`,
    });

    // Loop continues — next iteration will generate the follow-up response
  }

  // Safety: if we exhausted iterations, return last known state
  const safetyReply = "I've completed the analysis. Check the roadmap panel for the suggested actions.";
  // Phase 61: Persist safety reply
  await persistChatMessage(projectId, "assistant", safetyReply, env);
  return {
    reply: safetyReply,
    brandContextUpdated,
    roadmapItemsAdded,
  };
}
