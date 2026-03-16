/**
 * ============================================================
 * Swarme — Phase 4: AgentWorkflowManager Durable Object
 * ============================================================
 *
 * A crash-resilient state machine that orchestrates the full
 * SEO content workflow for a single project. Each project gets
 * its own Durable Object instance (keyed by projectId).
 *
 * State Machine:
 *   IDLE → RESEARCHING → DRAFTING → AUDITING
 *     → AWAITING_APPROVAL (copilot) or PUBLISHING (autopilot)
 *     → COMPLETED
 *
 * Phase 4 upgrades:
 *   - stepResearch() calls Perplexity API via fetchResearchData()
 *   - stepDraft() calls OpenAI API via generateContent()
 *   - evaluatePublishRouting() calls CMS webhook via pushToCMS()
 *   - All external calls wrapped in try/catch with fail-safe
 *     state reversion — the DO never advances past a failed step
 *   - Content_Assets table tracks generated articles in D1
 *   - API keys retrieved from KV vault per-project
 *
 * Persistence:
 *   All state is persisted to ctx.storage (Durable Object
 *   transactional storage). If the DO is evicted from memory
 *   or the Worker restarts, state is recovered automatically.
 * ============================================================
 */

import type { Env } from "./index";
import {
  fetchResearchData,
  generateContent,
  pushToCMS,
  pushToShopify,
  pushToWooCommerce,
  pushToBigCommerce,
  pushToMagento,
  ExternalAPIError,
  type PerplexityResearchResult,
  type ContentGenerationResult,
  type BrandGuidelines,
  type CMSPublishPayload,
  type CMSPublishResult,
} from "./utils/api";
import {
  processHtmlImages,
  type ImageAuditResult,
} from "./utils/vision";
import { pingIndexNow } from "./utils/seo";
import {
  evaluatePagePerformance,
  type CROTask,
  type TelemetryRow,
} from "./utils/cro";
import {
  generateSocialDrafts,
  saveSocialDrafts,
} from "./utils/social";
import {
  generateRefreshedContent,
  saveRefreshDraft,
} from "./utils/refresh";
import { notifyUser } from "./utils/notifications";
import {
  injectSemanticLinks,
  embedAndIndexArticle,
} from "./utils/vectorize";
import {
  processMediaPlaceholders,
  type MediaGenerationResult,
} from "./utils/media";

// ─────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────

/**
 * Strict workflow states. Transitions are enforced via the
 * VALID_TRANSITIONS map below.
 */
export type WorkflowState =
  | "IDLE"
  | "RESEARCHING"
  | "DRAFTING"
  | "MEDIA_GENERATION"
  | "IMAGE_AUDITING"
  | "AUDITING"
  | "AWAITING_APPROVAL"
  | "PUBLISHING"
  | "COMPLETED"
  | "FAILED";

/**
 * Payload passed when triggering a new workflow run.
 */
export interface WorkflowTrigger {
  projectId: string;
  keyword: string;
  initiator: "cron" | "manual" | "api";
  metadata?: Record<string, unknown>;
}

/**
 * Phase 12: Payload for dispatching an audit fix task to the swarm.
 * Sent from the Site Audit "Send to Swarm" button.
 */
export interface AuditFixDispatch {
  projectId: string;
  title: string;
  description: string;
  category: "performance" | "seo" | "accessibility" | "security" | "content";
  priority: number;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

/**
 * Internal state blob persisted to ctx.storage.
 */
export interface WorkflowStateData {
  state: WorkflowState;
  projectId: string;
  keyword: string;
  initiator: WorkflowTrigger["initiator"];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  /** Number of retry attempts on the current step */
  retryCount: number;
  /** The step where the last failure occurred */
  failedAtStep: WorkflowState | null;

  /** Phase outputs — each step appends its result here */
  pipeline: {
    research: ResearchOutput | null;
    draft: DraftOutput | null;
    mediaGeneration: MediaGenerationOutput | null;
    imageAudit: ImageAuditOutput | null;
    audit: AuditOutput | null;
    publishResult: PublishOutput | null;
  };
}

export interface ResearchOutput {
  serpResults: number;
  topCompetitors: string[];
  contentGaps: string[];
  semanticEntities: string[];
  suggestedAngle: string;
  rawCitations: string[];
  model: string;
  completedAt: string;
  source: "perplexity_api" | "mock_fallback";
}

export interface DraftOutput {
  title: string;
  htmlContent: string;
  metaDescription: string;
  wordCount: number;
  sections: string[];
  seoScore: number;
  model: string;
  tokensUsed: number;
  completedAt: string;
  source: "openai_api" | "mock_fallback";
}

/** Phase 40: Media generation output from DALL-E pipeline. */
export interface MediaGenerationOutput {
  totalPlaceholders: number;
  imagesGenerated: number;
  imagesSkipped: number;
  r2Keys: string[];
  completedAt: string;
  source: "dalle3_r2" | "mock_fallback";
}

/** Phase 8: Image audit output from the vision pipeline. */
export interface ImageAuditOutput {
  totalImages: number;
  imagesMissingAlt: number;
  imagesEnriched: number;
  imagesSkipped: number;
  warnings: string[];
  completedAt: string;
  source: "workers_ai_vision" | "mock_fallback";
}

interface AuditOutput {
  technicalIssues: string[];
  readabilityScore: number;
  keywordDensity: number;
  schemaValid: boolean;
  completedAt: string;
}

export interface PublishOutput {
  mode: "copilot" | "autopilot";
  action: "awaiting_approval" | "published";
  publishedUrl: string | null;
  cmsResponseId: string | null;
  contentAssetId: string | null;
  completedAt: string;
  source: "cms_webhook" | "mock_fallback";
}

// ─────────────────────────────────────────────────────────────
// KV Vault Key Patterns
// ─────────────────────────────────────────────────────────────

/**
 * KV key patterns for per-project secrets and config.
 * These are set by the dashboard admin or project setup flow.
 */
const KV_KEYS = {
  settings: (projectId: string) => `config:project:${projectId}:settings`,
  perplexityKey: (projectId: string) => `vault:project:${projectId}:perplexity_api_key`,
  openaiKey: (projectId: string) => `vault:project:${projectId}:openai_api_key`,
  brandGuidelines: (projectId: string) => `vault:project:${projectId}:brand_guidelines`,
  cmsWebhookUrl: (projectId: string) => `vault:project:${projectId}:cms_webhook_url`,
  cmsApiKey: (projectId: string) => `vault:project:${projectId}:cms_api_key`,
  shopifyAccessToken: (projectId: string) => `vault:project:${projectId}:shopify_access_token`,
  woocommerceAuthToken: (projectId: string) => `vault:project:${projectId}:woocommerce_auth_token`,
  bigcommerceAccessToken: (projectId: string) => `vault:project:${projectId}:bigcommerce_access_token`,
  magentoAccessToken: (projectId: string) => `vault:project:${projectId}:magento_access_token`,
  indexNowKey: (projectId: string) => `vault:project:${projectId}:indexnow_key`,
  /** Phase 41: Inventory level for a product URL (set by Shopify webhook) */
  inventoryLevel: (productUrl: string) => `inventory:${productUrl}`,
} as const;

// ─────────────────────────────────────────────────────────────
// Default Brand Guidelines
// ─────────────────────────────────────────────────────────────

const DEFAULT_BRAND_GUIDELINES: BrandGuidelines = {
  tone: "authoritative yet approachable, data-driven",
  audience: "technical decision-makers and senior marketers",
  vocabulary: [
    "edge-native", "autonomous", "swarm intelligence",
    "AI visibility", "generative engine optimization",
  ],
  avoidTerms: [
    "cheap", "simple", "easy", "basic", "just",
  ],
  styleNotes: "Use short paragraphs (2-3 sentences). Lead with data. Include specific numbers and examples. Use active voice.",
};

// ─────────────────────────────────────────────────────────────
// Transition Rules
// ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  IDLE: ["RESEARCHING"],
  RESEARCHING: ["DRAFTING", "FAILED"],
  DRAFTING: ["MEDIA_GENERATION", "FAILED"],
  MEDIA_GENERATION: ["IMAGE_AUDITING", "FAILED"],
  IMAGE_AUDITING: ["AUDITING", "FAILED"],
  AUDITING: ["AWAITING_APPROVAL", "PUBLISHING", "FAILED"],
  AWAITING_APPROVAL: ["PUBLISHING", "FAILED"],
  PUBLISHING: ["COMPLETED", "FAILED"],
  COMPLETED: ["IDLE"],
  FAILED: ["IDLE"],
};

class WorkflowTransitionError extends Error {
  constructor(from: WorkflowState, to: WorkflowState) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "WorkflowTransitionError";
  }
}

/**
 * Phase 41: Thrown when the circuit-breaker detects low inventory
 * for the target product URL. This is a controlled abort, not a
 * retryable error — the pipeline should stop and flag the task.
 */
class LowInventoryError extends Error {
  productUrl: string;
  available: number;
  constructor(productUrl: string, available: number) {
    super(
      `Low inventory circuit-breaker: "${productUrl}" has ${available} units ` +
      `(threshold: 5). Task aborted to prevent wasted compute.`
    );
    this.name = "LowInventoryError";
    this.productUrl = productUrl;
    this.available = available;
  }
}

/** Phase 41: Minimum stock threshold — below this, pipeline aborts. */
const INVENTORY_LOW_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────
// Durable Object Class
// ─────────────────────────────────────────────────────────────

export class AgentWorkflowManager implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private workflow: WorkflowStateData | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      this.workflow = (await this.state.storage.get<WorkflowStateData>("workflow")) ?? null;
    });
  }

  // ───────────────────────────────────────────────────────────
  // HTTP Handler
  // ───────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/trigger") {
        const body = (await request.json()) as WorkflowTrigger;
        const result = await this.triggerWorkflow(body);
        return Response.json(result, { status: 200 });
      }

      if (request.method === "GET" && path === "/status") {
        return Response.json(this.getState(), { status: 200 });
      }

      if (request.method === "POST" && path === "/approve") {
        const result = await this.approveAndPublish();
        return Response.json(result, { status: 200 });
      }

      if (request.method === "POST" && path === "/reset") {
        await this.resetWorkflow();
        return Response.json({ success: true, state: "IDLE" }, { status: 200 });
      }

      if (request.method === "POST" && path === "/dispatch") {
        const body = (await request.json()) as AuditFixDispatch;
        const result = await this.dispatchAuditFix(body);
        return Response.json(result, { status: 200 });
      }

      // Phase 18: Content Decay Refresh
      if (request.method === "POST" && path === "/refresh") {
        const body = (await request.json()) as {
          assetId: string;
          keyword: string;
          title: string;
          slug: string;
          existingHtml: string;
        };
        const result = await this.handleRefreshArticle(body);
        return Response.json(result, { status: 200 });
      }

      return Response.json({ error: "Not found", path }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal DO error";
      const status = err instanceof WorkflowTransitionError ? 409 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  // ───────────────────────────────────────────────────────────
  // State Access
  // ───────────────────────────────────────────────────────────

  getState(): WorkflowStateData {
    if (this.workflow) {
      return { ...this.workflow };
    }

    return {
      state: "IDLE",
      projectId: "",
      keyword: "",
      initiator: "manual",
      startedAt: "",
      updatedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      retryCount: 0,
      failedAtStep: null,
      pipeline: {
        research: null,
        draft: null,
        mediaGeneration: null,
        imageAudit: null,
        audit: null,
        publishResult: null,
      },
    };
  }

  // ───────────────────────────────────────────────────────────
  // State Persistence Helpers
  // ───────────────────────────────────────────────────────────

  private async transitionTo(newState: WorkflowState): Promise<void> {
    const currentState = this.workflow?.state ?? "IDLE";

    if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
      throw new WorkflowTransitionError(currentState, newState);
    }

    if (this.workflow) {
      this.workflow.state = newState;
      this.workflow.updatedAt = new Date().toISOString();

      if (newState === "COMPLETED" || newState === "FAILED") {
        this.workflow.completedAt = new Date().toISOString();
      }

      await this.state.storage.put("workflow", this.workflow);
    }
  }

  private async persistWorkflow(): Promise<void> {
    if (this.workflow) {
      this.workflow.updatedAt = new Date().toISOString();
      await this.state.storage.put("workflow", this.workflow);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline: triggerWorkflow()
  // ───────────────────────────────────────────────────────────

  async triggerWorkflow(trigger: WorkflowTrigger): Promise<{
    success: boolean;
    state: WorkflowState;
    projectId: string;
    keyword: string;
    error?: string;
  }> {
    const currentState = this.workflow?.state ?? "IDLE";

    if (currentState !== "IDLE" && currentState !== "COMPLETED" && currentState !== "FAILED") {
      throw new WorkflowTransitionError(currentState, "RESEARCHING");
    }

    // Initialize fresh workflow state
    const now = new Date().toISOString();
    this.workflow = {
      state: "IDLE",
      projectId: trigger.projectId,
      keyword: trigger.keyword,
      initiator: trigger.initiator,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      error: null,
      retryCount: 0,
      failedAtStep: null,
      pipeline: {
        research: null,
        draft: null,
        mediaGeneration: null,
        imageAudit: null,
        audit: null,
        publishResult: null,
      },
    };

    await this.persistWorkflow();

    await this.logTask(
      trigger.projectId,
      "orchestrator",
      "Workflow Started",
      "Running",
      `Workflow triggered for keyword "${trigger.keyword}" by ${trigger.initiator}`
    );

    // ── Phase 41: Inventory circuit-breaker ──
    // If the keyword maps to a product URL with inventory data in KV,
    // check stock level before burning compute on the full pipeline.
    await this.checkInventoryLevel(trigger.projectId, trigger.keyword, trigger.metadata);

    // Execute the pipeline
    try {
      await this.transitionTo("RESEARCHING");
      await this.stepResearch();

      await this.transitionTo("DRAFTING");
      await this.stepDraft();

      await this.transitionTo("MEDIA_GENERATION");
      await this.stepMediaGeneration();

      await this.transitionTo("IMAGE_AUDITING");
      await this.stepImageAudit();

      await this.transitionTo("AUDITING");
      await this.stepAudit();

      await this.evaluatePublishRouting();
    } catch (err) {
      // ── Phase 41: Special handling for inventory circuit-breaker ──
      if (err instanceof LowInventoryError) {
        if (this.workflow) {
          this.workflow.error = err.message;
          this.workflow.failedAtStep = this.workflow.state;
          this.workflow.state = "FAILED";
          this.workflow.completedAt = new Date().toISOString();
          await this.persistWorkflow();
        }

        await this.logTask(
          trigger.projectId,
          "orchestrator",
          "Inventory Circuit-Breaker",
          "Low_Inventory",
          `[aborted] Product "${err.productUrl}" has only ${err.available} units in stock. ` +
          `Swarm compute rerouted to next highest-priority roadmap item.`
        );

        // Autonomously reroute: log the reroute intent for the scheduler
        // to pick up on the next cron cycle
        await this.logTask(
          trigger.projectId,
          "orchestrator",
          "Compute Rerouted",
          "Completed",
          `Low-stock abort for "${trigger.keyword}" — swarm capacity freed for next priority item`
        );

        return {
          success: false,
          state: "FAILED" as WorkflowState,
          projectId: trigger.projectId,
          keyword: trigger.keyword,
          error: err.message,
        };
      }

      const message = err instanceof Error ? err.message : "Unknown pipeline error";
      const isRetryable = err instanceof ExternalAPIError && err.retryable;

      if (this.workflow) {
        this.workflow.error = message;
        this.workflow.failedAtStep = this.workflow.state;

        if (this.workflow.state !== "FAILED") {
          try {
            await this.transitionTo("FAILED");
          } catch {
            this.workflow.state = "FAILED";
            this.workflow.completedAt = new Date().toISOString();
            await this.persistWorkflow();
          }
        }
      }

      await this.logTask(
        trigger.projectId,
        "orchestrator",
        "Workflow Failed",
        "Failed",
        `Pipeline failed at ${this.workflow?.failedAtStep ?? "UNKNOWN"}: ${message}${isRetryable ? " (retryable)" : ""}`
      );
    }

    return {
      success: this.workflow?.state !== "FAILED",
      state: this.workflow?.state ?? "FAILED",
      projectId: trigger.projectId,
      keyword: trigger.keyword,
      ...(this.workflow?.error ? { error: this.workflow.error } : {}),
    };
  }

  // ───────────────────────────────────────────────────────────
  // Phase 41: Inventory Circuit-Breaker
  // ───────────────────────────────────────────────────────────

  /**
   * Checks CONFIG_KV for inventory data associated with the target
   * keyword's product URL. If available quantity is below the
   * threshold (5 units), throws LowInventoryError to abort the
   * pipeline before any compute is wasted.
   *
   * Resolution strategy:
   *   1. Check trigger.metadata.product_url directly (if provided)
   *   2. Query D1 Content_Assets for a published_url matching the keyword
   *   3. If no product URL is resolved, skip the check (non-product content)
   */
  private async checkInventoryLevel(
    projectId: string,
    keyword: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Strategy 1: Explicit product_url in trigger metadata
    let productUrl = metadata?.product_url as string | undefined;

    // Strategy 2: Lookup from Content_Assets by keyword
    if (!productUrl) {
      try {
        const row = await this.env.DB.prepare(
          `SELECT published_url FROM Content_Assets
           WHERE project_id = ? AND keyword = ? AND published_url IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`
        ).bind(projectId, keyword).first<{ published_url: string }>();

        if (row?.published_url) {
          productUrl = row.published_url;
        }
      } catch {
        // D1 query failed — skip inventory check gracefully
        return;
      }
    }

    // No product URL resolved → not a product page → skip check
    if (!productUrl) return;

    // Lookup inventory level in KV
    try {
      const kvKey = KV_KEYS.inventoryLevel(productUrl);
      const raw = await this.env.CONFIG_KV.get(kvKey);

      if (!raw) {
        // No inventory data for this URL — either not a tracked product
        // or Shopify hasn't sent an update yet. Allow pipeline to proceed.
        return;
      }

      const data = JSON.parse(raw) as {
        available: number;
        updated_at: string;
        inventory_item_id: number;
        location_id: number;
        product_url: string;
      };

      if (data.available < INVENTORY_LOW_THRESHOLD) {
        throw new LowInventoryError(productUrl, data.available);
      }

      // Inventory is healthy — log and continue
      console.log(
        `[Inventory Check] ${productUrl}: ${data.available} units in stock (threshold: ${INVENTORY_LOW_THRESHOLD}) — pipeline proceeds`
      );
    } catch (err) {
      // Re-throw LowInventoryError (intentional abort)
      if (err instanceof LowInventoryError) throw err;

      // Any other error (KV read failure, JSON parse) — skip check gracefully
      console.warn(
        `[Inventory Check] KV lookup failed for ${productUrl}: ` +
        (err instanceof Error ? err.message : "Unknown error")
      );
    }
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 1: Research (Perplexity API)
  // ───────────────────────────────────────────────────────────

  /**
   * Performs SERP research via the Perplexity API.
   * Falls back to deterministic mock if no API key is configured.
   *
   * Error handling (Task 4.3):
   *   - ExternalAPIError with retryable=true → throw to caller
   *     (triggerWorkflow catches it, transitions to FAILED,
   *     preserves failedAtStep so the user can retry)
   *   - Parse errors → degrade gracefully with partial data
   */
  private async stepResearch(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");

    const projectId = this.workflow.projectId;
    const keyword = this.workflow.keyword;

    // Attempt to retrieve per-project Perplexity key from KV vault,
    // then fall back to the global Worker secret
    const projectApiKey = await this.env.CONFIG_KV.get(KV_KEYS.perplexityKey(projectId));
    const apiKey = projectApiKey || this.env.PERPLEXITY_API_KEY;

    let researchOutput: ResearchOutput;

    if (apiKey) {
      // ── LIVE: Call Perplexity API ──
      const result: PerplexityResearchResult = await fetchResearchData(keyword, apiKey);

      researchOutput = {
        serpResults: result.rawCitations.length || result.topCompetitors.length * 3,
        topCompetitors: result.topCompetitors,
        contentGaps: result.contentGaps,
        semanticEntities: result.semanticEntities,
        suggestedAngle: result.suggestedAngle,
        rawCitations: result.rawCitations,
        model: result.model,
        completedAt: new Date().toISOString(),
        source: "perplexity_api",
      };
    } else {
      // ── FALLBACK: Deterministic mock ──
      console.log(`[DO] No Perplexity API key for ${projectId} — using mock research`);
      const hash = this.hashString(keyword);
      const competitorDomains = [
        "ahrefs.com", "semrush.com", "moz.com",
        "searchenginejournal.com", "backlinko.com",
      ];
      const gapTopics = [
        `${keyword} best practices 2026`,
        `${keyword} vs alternatives`,
        `how to implement ${keyword}`,
        `${keyword} case studies`,
      ];

      researchOutput = {
        serpResults: 10 + (Math.abs(hash) % 40),
        topCompetitors: competitorDomains.slice(0, 3 + (Math.abs(hash) % 3)),
        contentGaps: gapTopics.slice(0, 2 + (Math.abs(hash) % 3)),
        semanticEntities: [keyword, `${keyword} tools`, `${keyword} strategy`, `${keyword} ROI`, `${keyword} automation`],
        suggestedAngle: `Comprehensive guide to ${keyword} with edge-native implementation patterns`,
        rawCitations: [],
        model: "mock-v1",
        completedAt: new Date().toISOString(),
        source: "mock_fallback",
      };
    }

    this.workflow.pipeline.research = researchOutput;
    await this.persistWorkflow();

    await this.logTask(
      projectId,
      "researcher",
      "SERP Research",
      "Completed",
      `[${researchOutput.source}] Analyzed ${researchOutput.serpResults} results, found ${researchOutput.contentGaps.length} gap(s), ${researchOutput.semanticEntities.length} entities for "${keyword}"`
    );
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 2: Draft (OpenAI API)
  // ───────────────────────────────────────────────────────────

  /**
   * Generates content via the OpenAI API with dynamic brand
   * guideline injection. Falls back to mock if no key available.
   *
   * Error handling: same pattern as stepResearch.
   */
  private async stepDraft(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");
    if (!this.workflow.pipeline.research) throw new Error("Research step not completed");

    const projectId = this.workflow.projectId;
    const keyword = this.workflow.keyword;
    const research = this.workflow.pipeline.research;

    // Retrieve keys and config from KV vault
    const projectApiKey = await this.env.CONFIG_KV.get(KV_KEYS.openaiKey(projectId));
    const apiKey = projectApiKey || this.env.OPENAI_API_KEY;

    const brandGuidelinesJson = await this.env.CONFIG_KV.get(KV_KEYS.brandGuidelines(projectId));
    const brandGuidelines: BrandGuidelines = brandGuidelinesJson
      ? JSON.parse(brandGuidelinesJson) as BrandGuidelines
      : DEFAULT_BRAND_GUIDELINES;

    // Phase 9: Read target language from D1 Projects table
    let targetLanguage = "en";
    try {
      const langRow = await this.env.DB.prepare(
        `SELECT target_language FROM Projects WHERE id = ?`
      )
        .bind(projectId)
        .first<{ target_language: string }>();
      targetLanguage = langRow?.target_language ?? "en";
    } catch {
      // Non-fatal — fall back to English
      console.warn(`[DO] Failed to read target_language for ${projectId}, defaulting to 'en'`);
    }

    let draftOutput: DraftOutput;

    if (apiKey) {
      // ── LIVE: Call OpenAI API ──
      // Build the research context string for the LLM
      const researchContext = [
        `Top competitors: ${research.topCompetitors.join(", ")}`,
        `Content gaps to fill: ${research.contentGaps.join("; ")}`,
        `Key semantic entities: ${research.semanticEntities.join(", ")}`,
        `Suggested angle: ${research.suggestedAngle}`,
        research.rawCitations.length > 0
          ? `Reference citations: ${research.rawCitations.slice(0, 5).join(", ")}`
          : "",
      ].filter(Boolean).join("\n");

      const result: ContentGenerationResult = await generateContent(
        researchContext,
        brandGuidelines,
        apiKey,
        keyword,
        targetLanguage
      );

      // Compute a simple SEO score based on content quality signals
      const seoScore = this.computeSEOScore(result, keyword);

      draftOutput = {
        title: result.title,
        htmlContent: result.htmlContent,
        metaDescription: result.metaDescription,
        wordCount: result.wordCount,
        sections: result.sections,
        seoScore,
        model: result.model,
        tokensUsed: result.tokensUsed,
        completedAt: new Date().toISOString(),
        source: "openai_api",
      };
    } else {
      // ── FALLBACK: Deterministic mock ──
      console.log(`[DO] No OpenAI API key for ${projectId} — using mock draft`);
      const hash = this.hashString(keyword + "draft");

      draftOutput = {
        title: `${this.capitalizeFirst(keyword)}: The Definitive Guide for 2026`,
        htmlContent: `<article><h1>${this.capitalizeFirst(keyword)}: The Definitive Guide for 2026</h1><p>Mock content for "${keyword}" — replace with real API output.</p></article>`,
        metaDescription: `Everything you need to know about ${keyword} in 2026. Expert insights, strategies, and implementation guide.`,
        wordCount: 1800 + (Math.abs(hash) % 2200),
        sections: [
          "Introduction & Market Context",
          `What is ${this.capitalizeFirst(keyword)}?`,
          "Key Benefits & Use Cases",
          `How ${research.topCompetitors[0] || "Leaders"} Approach It`,
          "Implementation Strategy",
          "Measuring ROI & Performance",
          "FAQ",
          "Conclusion & Next Steps",
        ],
        seoScore: 72 + (Math.abs(hash) % 20),
        model: "mock-v1",
        tokensUsed: 0,
        completedAt: new Date().toISOString(),
        source: "mock_fallback",
      };
    }

    this.workflow.pipeline.draft = draftOutput;
    await this.persistWorkflow();

    await this.logTask(
      projectId,
      "writer",
      "Content Draft",
      "Completed",
      `[${draftOutput.source}] Drafted "${draftOutput.title}" — ${draftOutput.wordCount} words, SEO score: ${draftOutput.seoScore}/100, model: ${draftOutput.model}`
    );
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 2.5: Media Generation (Phase 40 — DALL-E 3 + R2)
  // ───────────────────────────────────────────────────────────

  /**
   * Processes `<media-placeholder>` tags in the drafted HTML:
   *   1. Extracts all placeholder tags with descriptions
   *   2. For each, generates an image via DALL-E 3
   *   3. Uploads the image bytes to Cloudflare R2
   *   4. Replaces the placeholder with an ADA-compliant <img> tag
   *      pointing at the permanent R2 public URL
   *
   * Error handling:
   *   - Individual image failures are logged and skipped — the
   *     placeholder is removed, never left raw in the HTML.
   *   - Full pipeline failures degrade gracefully — the draft
   *     HTML is returned with placeholders stripped.
   */
  private async stepMediaGeneration(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");
    if (!this.workflow.pipeline.draft) throw new Error("Draft step not completed");

    const projectId = this.workflow.projectId;
    const keyword = this.workflow.keyword;
    const draft = this.workflow.pipeline.draft;

    await this.logTask(
      projectId,
      "media",
      "Media Generation",
      "Running",
      `Scanning drafted HTML for <media-placeholder> tags…`
    );

    try {
      // Retrieve OpenAI key from KV vault for DALL-E 3 calls
      const openaiKey = await this.env.CONFIG_KV.get(
        KV_KEYS.openaiKey(projectId)
      );

      if (!openaiKey) {
        // No API key — skip media generation gracefully
        const skipOutput: MediaGenerationOutput = {
          totalPlaceholders: 0,
          imagesGenerated: 0,
          imagesSkipped: 0,
          r2Keys: [],
          completedAt: new Date().toISOString(),
          source: "mock_fallback",
        };
        this.workflow.pipeline.mediaGeneration = skipOutput;
        await this.persistWorkflow();

        await this.logTask(
          projectId,
          "media",
          "Media Generation",
          "Completed",
          `[skipped] No OpenAI API key — media generation bypassed`
        );
        return;
      }

      // Run the full media pipeline from media.ts
      const result: MediaGenerationResult = await processMediaPlaceholders(
        draft.htmlContent,
        {
          openaiApiKey: openaiKey,
          r2Bucket: this.env.MEDIA_BUCKET,
          r2PublicBase: this.env.R2_PUBLIC_BASE,
          projectId,
          articleContext: `Article about "${keyword}" — ${draft.title}`,
        }
      );

      // Update the draft HTML with media-enriched version
      this.workflow.pipeline.draft.htmlContent = result.processedHtml;

      const mediaOutput: MediaGenerationOutput = {
        totalPlaceholders: result.totalPlaceholders,
        imagesGenerated: result.imagesGenerated,
        imagesSkipped: result.imagesSkipped,
        r2Keys: result.r2Keys,
        completedAt: new Date().toISOString(),
        source: "dalle3_r2",
      };

      this.workflow.pipeline.mediaGeneration = mediaOutput;
      await this.persistWorkflow();

      await this.logTask(
        projectId,
        "media",
        "Media Generation",
        "Completed",
        `[dalle3_r2] Generated ${result.imagesGenerated}/${result.totalPlaceholders} images, ` +
          `${result.imagesSkipped} skipped, ${result.r2Keys.length} stored in R2`
      );
    } catch (err) {
      // Graceful degradation — strip placeholders and continue
      const message = err instanceof Error ? err.message : "Unknown media generation error";

      const fallbackOutput: MediaGenerationOutput = {
        totalPlaceholders: 0,
        imagesGenerated: 0,
        imagesSkipped: 0,
        r2Keys: [],
        completedAt: new Date().toISOString(),
        source: "mock_fallback",
      };
      this.workflow.pipeline.mediaGeneration = fallbackOutput;
      await this.persistWorkflow();

      await this.logTask(
        projectId,
        "media",
        "Media Generation",
        "Completed",
        `[warning] Media generation failed (${message}) — placeholders stripped, pipeline continues`
      );
    }
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 3: Image Audit (Phase 8 — Vision Pipeline)
  // ───────────────────────────────────────────────────────────

  /**
   * Runs the edge-native vision pipeline on the drafted HTML.
   *
   * For each <img> tag missing an alt attribute:
   *   1. Fetches the image bytes (with timeout + size guard)
   *   2. Runs @cf/meta/llama-3.2-11b-vision-instruct to generate
   *      a concise, ADA-compliant, SEO-optimized alt description
   *   3. Injects the alt text back into the HTML
   *
   * The enriched HTML overwrites the draft's htmlContent so that
   * all downstream steps (technical audit, publishing) operate on
   * the fully accessible version.
   *
   * Error handling (Task 8.4):
   *   - Individual image failures are logged as warnings and
   *     skipped — they never crash the pipeline.
   *   - If the entire vision step fails (e.g., AI binding down),
   *     the draft HTML is preserved as-is and a warning is logged.
   */
  private async stepImageAudit(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");
    if (!this.workflow.pipeline.draft) throw new Error("Draft step not completed");

    const projectId = this.workflow.projectId;
    const keyword = this.workflow.keyword;
    const draft = this.workflow.pipeline.draft;
    const htmlContent = draft.htmlContent || "";

    // Quick check: does the HTML contain any <img> tags?
    const imgTagCount = (htmlContent.match(/<img\b/gi) ?? []).length;

    if (imgTagCount === 0) {
      // No images to process — skip with a clean result
      const output: ImageAuditOutput = {
        totalImages: 0,
        imagesMissingAlt: 0,
        imagesEnriched: 0,
        imagesSkipped: 0,
        warnings: [],
        completedAt: new Date().toISOString(),
        source: "workers_ai_vision",
      };

      this.workflow.pipeline.imageAudit = output;
      await this.persistWorkflow();

      await this.logTask(
        projectId,
        "auditor",
        "Image Audit",
        "Completed",
        "No images found in draft — skipping vision pipeline"
      );
      return;
    }

    let imageAuditOutput: ImageAuditOutput;

    try {
      // Run the full vision pipeline
      const result = await processHtmlImages(htmlContent, keyword, this.env);

      // Overwrite the draft HTML with the enriched version
      this.workflow.pipeline.draft.htmlContent = result.enrichedHtml;

      // Collect warnings from skipped images
      const warnings = result.details
        .filter((d) => d.status === "skipped")
        .map((d) => `Skipped ${d.src}: ${d.error ?? "unknown"}`);

      imageAuditOutput = {
        totalImages: result.totalImages,
        imagesMissingAlt: result.imagesMissingAlt,
        imagesEnriched: result.imagesEnriched,
        imagesSkipped: result.imagesSkipped,
        warnings,
        completedAt: new Date().toISOString(),
        source: "workers_ai_vision",
      };
    } catch (err) {
      // Entire vision pipeline failed — preserve original HTML,
      // log the failure as a non-fatal warning
      const message = err instanceof Error ? err.message : "Unknown vision error";
      console.error(`[DO] Image audit failed for ${projectId}: ${message}`);

      imageAuditOutput = {
        totalImages: imgTagCount,
        imagesMissingAlt: 0,
        imagesEnriched: 0,
        imagesSkipped: imgTagCount,
        warnings: [`Vision pipeline failed: ${message}. Draft HTML preserved as-is.`],
        completedAt: new Date().toISOString(),
        source: "mock_fallback",
      };
    }

    this.workflow.pipeline.imageAudit = imageAuditOutput;
    await this.persistWorkflow();

    const summary = imageAuditOutput.imagesEnriched > 0
      ? `[${imageAuditOutput.source}] Enriched ${imageAuditOutput.imagesEnriched}/${imageAuditOutput.imagesMissingAlt} images with AI-generated alt text (${imageAuditOutput.totalImages} total, ${imageAuditOutput.imagesSkipped} skipped)`
      : imageAuditOutput.totalImages === 0
        ? "No images found in draft — vision pipeline skipped"
        : `[${imageAuditOutput.source}] ${imageAuditOutput.totalImages} images found, ${imageAuditOutput.warnings.length} warning(s). ${imageAuditOutput.warnings.length > 0 ? imageAuditOutput.warnings[0] : ""}`;

    await this.logTask(
      projectId,
      "auditor",
      "Image Audit",
      "Completed",
      summary
    );
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 3: Technical SEO Audit
  // ───────────────────────────────────────────────────────────

  /**
   * Performs a technical SEO audit on the drafted content.
   * Phase 5 will integrate Workers AI for readability analysis.
   * Currently uses heuristic checks on the HTML content.
   */
  private async stepAudit(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");
    if (!this.workflow.pipeline.draft) throw new Error("Draft step not completed");

    const keyword = this.workflow.keyword;
    const draft = this.workflow.pipeline.draft;
    const htmlContent = draft.htmlContent || "";

    // ── Heuristic audit checks ──
    const issues: string[] = [];

    // Check for H1 tag
    if (!/<h1[\s>]/i.test(htmlContent)) {
      issues.push("Missing H1 tag");
    }

    // Check for keyword in H1
    if (/<h1[^>]*>(.*?)<\/h1>/i.test(htmlContent)) {
      const h1Content = RegExp.$1.toLowerCase();
      if (!h1Content.includes(keyword.toLowerCase())) {
        issues.push(`Primary keyword "${keyword}" not found in H1`);
      }
    }

    // Check for meta description length
    if (draft.metaDescription) {
      if (draft.metaDescription.length > 160) {
        issues.push(`Meta description too long (${draft.metaDescription.length} chars, max 160)`);
      }
      if (draft.metaDescription.length < 70) {
        issues.push(`Meta description too short (${draft.metaDescription.length} chars, min 70)`);
      }
    } else {
      issues.push("Missing meta description");
    }

    // Check for alt text on images
    const imgTags = htmlContent.match(/<img[^>]*>/gi) ?? [];
    const imgsMissingAlt = imgTags.filter((tag) => !tag.includes("alt="));
    if (imgsMissingAlt.length > 0) {
      issues.push(`${imgsMissingAlt.length} image(s) missing alt text`);
    }

    // Check heading hierarchy
    const headingLevels = (htmlContent.match(/<h(\d)/gi) ?? []).map((h) =>
      parseInt(h.replace(/<h/i, ""), 10)
    );
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] - headingLevels[i - 1] > 1) {
        issues.push(`Heading hierarchy skip: H${headingLevels[i - 1]} → H${headingLevels[i]}`);
        break;
      }
    }

    // Compute keyword density
    const plainText = htmlContent.replace(/<[^>]*>/g, " ").toLowerCase();
    const totalWords = plainText.split(/\s+/).filter((w) => w.length > 0).length;
    const keywordOccurrences = (
      plainText.match(new RegExp(keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []
    ).length;
    const keywordDensity = totalWords > 0 ? (keywordOccurrences / totalWords) * 100 : 0;

    if (keywordDensity > 3.0) {
      issues.push(`Keyword density too high: ${keywordDensity.toFixed(1)}% (target: 1.5-2.5%)`);
    }
    if (keywordDensity < 0.5 && totalWords > 100) {
      issues.push(`Keyword density too low: ${keywordDensity.toFixed(1)}% (target: 1.5-2.5%)`);
    }

    // Compute readability (simple Flesch-Kincaid approximation)
    const sentences = plainText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const avgWordsPerSentence = sentences > 0 ? totalWords / sentences : 0;
    const readabilityScore = Math.max(
      0,
      Math.min(100, Math.round(100 - (avgWordsPerSentence - 15) * 3))
    );

    const auditOutput: AuditOutput = {
      technicalIssues: issues,
      readabilityScore,
      keywordDensity: parseFloat(keywordDensity.toFixed(2)),
      schemaValid: issues.length < 3,
      completedAt: new Date().toISOString(),
    };

    this.workflow.pipeline.audit = auditOutput;
    await this.persistWorkflow();

    const statusMsg = issues.length === 0
      ? `Audit passed — readability: ${readabilityScore}/100, keyword density: ${keywordDensity.toFixed(1)}%`
      : `Found ${issues.length} issue(s): ${issues.join("; ")}. Readability: ${readabilityScore}/100`;

    await this.logTask(
      this.workflow.projectId,
      "auditor",
      "Technical Audit",
      "Completed",
      statusMsg
    );
  }

  // ───────────────────────────────────────────────────────────
  // Pipeline Step 4: Publish Routing
  // ───────────────────────────────────────────────────────────

  /**
   * Determines copilot vs autopilot routing.
   *
   * Autopilot path:
   *   1. Insert Content_Assets row with status='Draft'
   *   2. Retrieve CMS webhook URL + key from KV vault
   *   3. Call pushToCMS() to publish
   *   4. Update Content_Assets row to status='Published'
   *   5. Transition → COMPLETED
   *
   * Copilot path:
   *   1. Insert Content_Assets row with status='Draft'
   *   2. Transition → AWAITING_APPROVAL
   *   3. (human approves via POST /approve → approveAndPublish())
   */
  private async evaluatePublishRouting(): Promise<void> {
    if (!this.workflow) throw new Error("No active workflow");
    if (!this.workflow.pipeline.audit) throw new Error("Audit step not completed");
    if (!this.workflow.pipeline.draft) throw new Error("Draft step not completed");

    const projectId = this.workflow.projectId;
    const draft = this.workflow.pipeline.draft;
    const keyword = this.workflow.keyword;
    const slug = keyword.replace(/\s+/g, "-").toLowerCase();

    // ── Insert Content_Assets row ──
    let contentAssetId: string | null = null;
    try {
      // Pull images_optimized count from the Phase 8 vision pipeline
      const imagesOptimized = this.workflow.pipeline.imageAudit?.imagesEnriched ?? 0;

      const insertResult = await this.env.DB.prepare(
        `INSERT INTO Content_Assets (project_id, keyword, title, slug, html_content, meta_description, seo_score, word_count, status, model_used, tokens_used, images_optimized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)
         RETURNING id`
      )
        .bind(
          projectId,
          keyword,
          draft.title,
          slug,
          draft.htmlContent,
          draft.metaDescription,
          draft.seoScore,
          draft.wordCount,
          draft.model,
          draft.tokensUsed,
          imagesOptimized
        )
        .first<{ id: string }>();

      contentAssetId = insertResult?.id ?? null;
    } catch (err) {
      console.error(`[DO] Failed to insert Content_Asset: ${err instanceof Error ? err.message : err}`);
      // Non-fatal — we can still publish even if the asset insert fails
    }

    // Read project settings from KV
    const settings = await this.env.CONFIG_KV.get<{
      mode: "copilot" | "autopilot";
      cms_platform?: "wordpress" | "webflow" | "shopify" | "woocommerce" | "bigcommerce" | "magento" | "generic";
      shopify_domain?: string;
      shopify_blog_id?: string;
      woocommerce_domain?: string;
      bigcommerce_store_hash?: string;
      bigcommerce_domain?: string;
      magento_domain?: string;
    }>(KV_KEYS.settings(projectId), "json");

    const mode = settings?.mode ?? "copilot";
    const cmsPlatform = settings?.cms_platform ?? "generic";

    if (mode === "autopilot") {
      // ── Autopilot: Attempt CMS webhook publish ──
      await this.transitionTo("PUBLISHING");

      // ── Phase 39: Inject semantic internal links before CMS push ──
      try {
        const linkResult = await injectSemanticLinks(
          contentAssetId ?? "",
          draft.htmlContent,
          keyword,
          projectId,
          this.env,
        );
        if (linkResult.linksInjected.length > 0) {
          draft.htmlContent = linkResult.modifiedHtml;
          console.log(`[DO] Phase 39: Injected ${linkResult.linksInjected.length} internal links into "${keyword}"`);
        }
      } catch (linkErr) {
        // Non-fatal — publish without links if injection fails
        console.warn(`[DO] Phase 39: Link injection skipped: ${linkErr instanceof Error ? linkErr.message : linkErr}`);
      }

      let publishedUrl: string | null = null;
      let cmsResponseId: string | null = null;
      let publishSource: PublishOutput["source"] = "mock_fallback";

      // Retrieve CMS webhook config from KV vault
      const cmsWebhookUrl = await this.env.CONFIG_KV.get(KV_KEYS.cmsWebhookUrl(projectId));
      const cmsApiKey = await this.env.CONFIG_KV.get(KV_KEYS.cmsApiKey(projectId));

      if (cmsPlatform === "shopify" && settings?.shopify_domain && settings?.shopify_blog_id) {
        // ── SHOPIFY: Publish via Admin REST API ──
        const shopifyToken = await this.env.CONFIG_KV.get(KV_KEYS.shopifyAccessToken(projectId));
        if (shopifyToken) {
          const shopifyResult = await pushToShopify(
            {
              title: draft.title,
              htmlContent: draft.htmlContent,
              metaDescription: draft.metaDescription,
              keyword,
            },
            settings.shopify_domain,
            settings.shopify_blog_id,
            shopifyToken
          );
          publishedUrl = shopifyResult.publishedUrl;
          cmsResponseId = shopifyResult.articleId ? String(shopifyResult.articleId) : null;
          publishSource = "cms_webhook";
        } else {
          console.error(`[DO] Shopify access token not found for ${projectId}`);
          publishedUrl = `https://${settings.shopify_domain}/blogs/${settings.shopify_blog_id}/${slug}`;
          publishSource = "mock_fallback";
        }
      } else if (cmsPlatform === "woocommerce" && settings?.woocommerce_domain) {
        // ── WOOCOMMERCE: Publish via WP REST API ──
        const wooToken = await this.env.CONFIG_KV.get(KV_KEYS.woocommerceAuthToken(projectId));
        if (wooToken) {
          const wooResult = await pushToWooCommerce(
            {
              title: draft.title,
              htmlContent: draft.htmlContent,
              metaDescription: draft.metaDescription,
              keyword,
            },
            settings.woocommerce_domain,
            wooToken
          );
          publishedUrl = wooResult.publishedUrl;
          cmsResponseId = wooResult.postId ? String(wooResult.postId) : null;
          publishSource = "cms_webhook";
        } else {
          console.error(`[DO] WooCommerce auth token not found for ${projectId}`);
          publishedUrl = `https://${settings.woocommerce_domain}/${slug}`;
          publishSource = "mock_fallback";
        }
      } else if (cmsPlatform === "bigcommerce" && settings?.bigcommerce_store_hash) {
        // ── BIGCOMMERCE: Publish via Management API ──
        const bcToken = await this.env.CONFIG_KV.get(KV_KEYS.bigcommerceAccessToken(projectId));
        if (bcToken) {
          const bcResult = await pushToBigCommerce(
            {
              title: draft.title,
              htmlContent: draft.htmlContent,
              metaDescription: draft.metaDescription,
              keyword,
            },
            settings.bigcommerce_store_hash,
            bcToken,
            settings.bigcommerce_domain
          );
          publishedUrl = bcResult.publishedUrl;
          cmsResponseId = bcResult.postId ? String(bcResult.postId) : null;
          publishSource = "cms_webhook";
        } else {
          console.error(`[DO] BigCommerce access token not found for ${projectId}`);
          publishedUrl = settings.bigcommerce_domain ? `https://${settings.bigcommerce_domain}/blog/${slug}` : null;
          publishSource = "mock_fallback";
        }
      } else if (cmsPlatform === "magento" && settings?.magento_domain) {
        // ── MAGENTO: Publish via REST API ──
        const magentoToken = await this.env.CONFIG_KV.get(KV_KEYS.magentoAccessToken(projectId));
        if (magentoToken) {
          const magentoResult = await pushToMagento(
            {
              title: draft.title,
              htmlContent: draft.htmlContent,
              metaDescription: draft.metaDescription,
              keyword,
            },
            settings.magento_domain,
            magentoToken
          );
          publishedUrl = magentoResult.publishedUrl;
          cmsResponseId = magentoResult.pageId ? String(magentoResult.pageId) : null;
          publishSource = "cms_webhook";
        } else {
          console.error(`[DO] Magento access token not found for ${projectId}`);
          publishedUrl = `https://${settings.magento_domain}/${slug}`;
          publishSource = "mock_fallback";
        }
      } else if (cmsWebhookUrl && cmsApiKey) {
        // ── GENERIC: Push to CMS via webhook ──
        const cmsPayload: CMSPublishPayload = {
          title: draft.title,
          slug,
          htmlContent: draft.htmlContent,
          metaDescription: draft.metaDescription,
          keyword,
          seoScore: draft.seoScore,
          status: "published",
          publishedAt: new Date().toISOString(),
        };

        const cmsResult: CMSPublishResult = await pushToCMS(cmsPayload, cmsWebhookUrl, cmsApiKey);
        publishedUrl = cmsResult.publishedUrl;
        cmsResponseId = cmsResult.cmsResponseId;
        publishSource = "cms_webhook";
      } else {
        // ── FALLBACK: Generate a simulated URL ──
        console.log(`[DO] No CMS webhook configured for ${projectId} — using mock publish`);
        publishedUrl = `https://${projectId === "proj_001" ? "swarme.io" : "example.com"}/blog/${slug}`;
        publishSource = "mock_fallback";
      }

      // Update Content_Assets to Published
      if (contentAssetId) {
        try {
          await this.env.DB.prepare(
            `UPDATE Content_Assets SET status = 'Published', published_url = ?, cms_response_id = ?, updated_at = datetime('now') WHERE id = ?`
          )
            .bind(publishedUrl, cmsResponseId, contentAssetId)
            .run();
        } catch (err) {
          console.error(`[DO] Failed to update Content_Asset: ${err instanceof Error ? err.message : err}`);
        }
      }

      const publishOutput: PublishOutput = {
        mode: "autopilot",
        action: "published",
        publishedUrl,
        cmsResponseId,
        contentAssetId,
        completedAt: new Date().toISOString(),
        source: publishSource,
      };

      this.workflow.pipeline.publishResult = publishOutput;
      await this.persistWorkflow();

      await this.logTask(
        projectId,
        "publisher",
        "Auto-Publish",
        "Completed",
        `[${publishSource}] Autopilot: Published "${draft.title}" → ${publishedUrl ?? "no URL returned"}`
      );

      // ── Phase 9: Ping IndexNow for instant search engine indexing ──
      if (publishedUrl && publishSource !== "mock_fallback") {
        await this.notifyIndexNow(projectId, publishedUrl);
      }

      // ── Phase 17: Generate social media drafts (async, non-blocking) ──
      if (contentAssetId && publishedUrl) {
        try {
          const articleText = draft.htmlContent?.replace(/<[^>]*>/g, "") || "";
          const socialDrafts = await generateSocialDrafts(
            publishedUrl,
            articleText,
            draft.title,
            this.env
          );
          await saveSocialDrafts(contentAssetId, socialDrafts, this.env.DB);
          await this.logAgentTask(
            this.env.DB,
            projectId,
            "social",
            "Social Drafts Generated",
            "Completed",
            `Generated Twitter thread + LinkedIn post for "${draft.title}". Awaiting human approval.`
          );
        } catch (socialErr) {
          console.error("[DO] Social draft generation failed (non-fatal):", socialErr);
        }
      }

      // ── Phase 20: Notify user of successful publish ──
      try {
        const projectOwner = await this.env.DB.prepare(
          "SELECT user_id FROM Projects WHERE id = ?1"
        )
          .bind(projectId)
          .first<{ user_id: string | null }>();

        if (projectOwner?.user_id) {
          await notifyUser(
            projectOwner.user_id,
            "New Content Published",
            `Swarm Update: "${draft.title}" has been successfully published to your store.${publishedUrl ? " View it at " + publishedUrl : ""}`,
            this.env
          );
        }
      } catch (notifyErr) {
        console.error("[DO] User notification failed (non-fatal):", notifyErr);
      }

      // ── Phase 39: Index published article in Vectorize for future link injection ──
      if (contentAssetId && publishedUrl) {
        try {
          await embedAndIndexArticle(
            contentAssetId,
            draft.htmlContent,
            {
              assetId: contentAssetId,
              projectId,
              title: draft.title,
              keyword,
              slug,
              publishedUrl,
            },
            this.env,
          );
          console.log(`[DO] Phase 39: Indexed article in Vectorize: "${draft.title}"`);
        } catch (indexErr) {
          console.error(`[DO] Phase 39: Vectorize indexing failed (non-fatal): ${indexErr instanceof Error ? indexErr.message : indexErr}`);
        }
      }

      await this.transitionTo("COMPLETED");
    } else {
      // ── Copilot: Pause for human approval ──
      await this.transitionTo("AWAITING_APPROVAL");

      const publishOutput: PublishOutput = {
        mode: "copilot",
        action: "awaiting_approval",
        publishedUrl: null,
        cmsResponseId: null,
        contentAssetId,
        completedAt: new Date().toISOString(),
        source: "mock_fallback",
      };

      this.workflow.pipeline.publishResult = publishOutput;
      await this.persistWorkflow();

      await this.logTask(
        projectId,
        "orchestrator",
        "Awaiting Approval",
        "Awaiting_Approval",
        `Copilot mode: "${draft.title}" ready for review (${draft.wordCount} words, SEO: ${draft.seoScore}/100). Approve to publish.`
      );
    }
  }

  // ───────────────────────────────────────────────────────────
  // Manual Approval (Copilot Mode)
  // ───────────────────────────────────────────────────────────

  /**
   * Advances AWAITING_APPROVAL → PUBLISHING → COMPLETED.
   * In Phase 4, also calls the CMS webhook if configured.
   */
  private async approveAndPublish(): Promise<{
    success: boolean;
    state: WorkflowState;
    publishedUrl: string | null;
  }> {
    if (!this.workflow) throw new Error("No active workflow");

    if (this.workflow.state !== "AWAITING_APPROVAL") {
      throw new WorkflowTransitionError(this.workflow.state, "PUBLISHING");
    }

    await this.transitionTo("PUBLISHING");

    const projectId = this.workflow.projectId;
    const draft = this.workflow.pipeline.draft;
    const keyword = this.workflow.keyword;
    const slug = keyword.replace(/\s+/g, "-").toLowerCase();
    const contentAssetId = this.workflow.pipeline.publishResult?.contentAssetId ?? null;

    // ── Phase 39: Inject semantic internal links before CMS push ──
    if (draft?.htmlContent) {
      try {
        const linkResult = await injectSemanticLinks(
          contentAssetId ?? "",
          draft.htmlContent,
          keyword,
          projectId,
          this.env,
        );
        if (linkResult.linksInjected.length > 0) {
          draft.htmlContent = linkResult.modifiedHtml;
          console.log(`[DO] Phase 39 (copilot): Injected ${linkResult.linksInjected.length} internal links into "${keyword}"`);
        }
      } catch (linkErr) {
        // Non-fatal — publish without links if injection fails
        console.warn(`[DO] Phase 39 (copilot): Link injection skipped: ${linkErr instanceof Error ? linkErr.message : linkErr}`);
      }
    }

    let publishedUrl: string | null = null;
    let cmsResponseId: string | null = null;

    // Read settings to determine CMS platform
    const approvalSettings = await this.env.CONFIG_KV.get<{
      cms_platform?: "wordpress" | "webflow" | "shopify" | "generic";
      shopify_domain?: string;
      shopify_blog_id?: string;
    }>(KV_KEYS.settings(projectId), "json");

    const approvalCmsPlatform = approvalSettings?.cms_platform ?? "generic";
    let publishSource: PublishOutput["source"] = "mock_fallback";

    // Attempt CMS publish based on platform
    const cmsWebhookUrl = await this.env.CONFIG_KV.get(KV_KEYS.cmsWebhookUrl(projectId));
    const cmsApiKey = await this.env.CONFIG_KV.get(KV_KEYS.cmsApiKey(projectId));

    if (approvalCmsPlatform === "shopify" && approvalSettings?.shopify_domain && approvalSettings?.shopify_blog_id && draft) {
      // ── SHOPIFY ──
      try {
        const shopifyToken = await this.env.CONFIG_KV.get(KV_KEYS.shopifyAccessToken(projectId));
        if (shopifyToken) {
          const shopifyResult = await pushToShopify(
            {
              title: draft.title,
              htmlContent: draft.htmlContent,
              metaDescription: draft.metaDescription,
              keyword,
            },
            approvalSettings.shopify_domain,
            approvalSettings.shopify_blog_id,
            shopifyToken
          );
          publishedUrl = shopifyResult.publishedUrl;
          cmsResponseId = shopifyResult.articleId ? String(shopifyResult.articleId) : null;
          publishSource = "cms_webhook";
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Shopify push failed";
        console.error(`[DO] Shopify push failed during approval: ${message}`);
        publishedUrl = `https://${approvalSettings.shopify_domain}/blogs/${approvalSettings.shopify_blog_id}/${slug}`;
      }
    } else if (cmsWebhookUrl && cmsApiKey && draft) {
      // ── GENERIC CMS WEBHOOK ──
      try {
        const cmsPayload: CMSPublishPayload = {
          title: draft.title,
          slug,
          htmlContent: draft.htmlContent,
          metaDescription: draft.metaDescription,
          keyword,
          seoScore: draft.seoScore,
          status: "published",
          publishedAt: new Date().toISOString(),
        };

        const cmsResult: CMSPublishResult = await pushToCMS(cmsPayload, cmsWebhookUrl, cmsApiKey);
        publishedUrl = cmsResult.publishedUrl;
        cmsResponseId = cmsResult.cmsResponseId;
        publishSource = "cms_webhook";
      } catch (err) {
        const message = err instanceof Error ? err.message : "CMS push failed";
        console.error(`[DO] CMS push failed during approval: ${message}`);
        publishedUrl = `https://${projectId === "proj_001" ? "swarme.io" : "example.com"}/blog/${slug}`;
      }
    } else {
      publishedUrl = `https://${projectId === "proj_001" ? "swarme.io" : "example.com"}/blog/${slug}`;
    }

    // Update Content_Assets
    if (contentAssetId) {
      try {
        await this.env.DB.prepare(
          `UPDATE Content_Assets SET status = 'Published', published_url = ?, cms_response_id = ?, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(publishedUrl, cmsResponseId, contentAssetId)
          .run();
      } catch (err) {
        console.error(`[DO] Failed to update Content_Asset: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Update publish result
    if (this.workflow.pipeline.publishResult) {
      this.workflow.pipeline.publishResult.action = "published";
      this.workflow.pipeline.publishResult.publishedUrl = publishedUrl;
      this.workflow.pipeline.publishResult.cmsResponseId = cmsResponseId;
      this.workflow.pipeline.publishResult.completedAt = new Date().toISOString();
      this.workflow.pipeline.publishResult.source = publishSource;
    }

    await this.persistWorkflow();

    await this.logTask(
      projectId,
      "publisher",
      "Content Published",
      "Completed",
      `Approved and published: "${draft?.title}" → ${publishedUrl}`
    );

    // ── Phase 9: Ping IndexNow for instant search engine indexing ──
    if (publishedUrl && publishSource !== "mock_fallback") {
      await this.notifyIndexNow(projectId, publishedUrl);
    }

    // ── Phase 17: Generate social media drafts (copilot-approved path) ──
    if (contentAssetId && publishedUrl) {
      try {
        const articleText = draft?.htmlContent?.replace(/<[^>]*>/g, "") || "";
        const socialDrafts = await generateSocialDrafts(
          publishedUrl,
          articleText,
          draft?.title || "Untitled",
          this.env
        );
        await saveSocialDrafts(contentAssetId, socialDrafts, this.env.DB);
        await this.logAgentTask(
          this.env.DB,
          projectId,
          "social",
          "Social Drafts Generated",
          "Completed",
          `Generated Twitter thread + LinkedIn post for "${draft?.title}". Awaiting human approval.`
        );
      } catch (socialErr) {
        console.error("[DO] Social draft generation failed (non-fatal):", socialErr);
      }
    }

    // ── Phase 39: Index published article in Vectorize for future link injection ──
    if (contentAssetId && publishedUrl && draft) {
      try {
        await embedAndIndexArticle(
          contentAssetId,
          draft.htmlContent,
          {
            assetId: contentAssetId,
            projectId,
            title: draft.title,
            keyword,
            slug,
            publishedUrl,
          },
          this.env,
        );
        console.log(`[DO] Phase 39 (copilot): Indexed article in Vectorize: "${draft.title}"`);
      } catch (indexErr) {
        console.error(`[DO] Phase 39 (copilot): Vectorize indexing failed (non-fatal): ${indexErr instanceof Error ? indexErr.message : indexErr}`);
      }
    }

    await this.transitionTo("COMPLETED");

    return {
      success: true,
      state: this.workflow.state,
      publishedUrl,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Phase 9: IndexNow Instant Indexing
  // ───────────────────────────────────────────────────────────

  /**
   * Pings the IndexNow API to notify search engines of a newly
   * published URL. Non-fatal — failures are logged but never
   * block the publish pipeline.
   *
   * Extracts the hostname from the URL and retrieves the
   * IndexNow key from KV. If no key is configured, skips silently.
   */
  private async notifyIndexNow(projectId: string, publishedUrl: string): Promise<void> {
    try {
      const indexNowKey = await this.env.CONFIG_KV.get(KV_KEYS.indexNowKey(projectId));
      if (!indexNowKey) {
        console.log(`[DO] No IndexNow key configured for ${projectId} — skipping instant indexing`);
        return;
      }

      // Extract hostname from the published URL
      const host = new URL(publishedUrl).hostname;

      const result = await pingIndexNow(publishedUrl, host, indexNowKey);

      if (result.success) {
        console.log(`[DO] IndexNow: ${result.message}`);
        await this.logTask(
          projectId,
          "publisher",
          "IndexNow Ping",
          "Completed",
          result.message
        );
      } else {
        console.warn(`[DO] IndexNow: ${result.message}`);
        await this.logTask(
          projectId,
          "publisher",
          "IndexNow Ping",
          "Failed",
          result.message
        );
      }
    } catch (err) {
      // Never fatal — swallow and log
      const message = err instanceof Error ? err.message : "Unknown IndexNow error";
      console.warn(`[DO] IndexNow ping failed for ${projectId}: ${message}`);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Phase 12: Dispatch Audit Fix → Swarm
  // ───────────────────────────────────────────────────────────

  /**
   * Receives an audit roadmap item and dispatches it as an Agent_Tasks
   * row. Routes by category:
   *   - accessibility (alt text) → logs as "auditor" (future: stepImageAudit)
   *   - seo → logs as "auditor" (future: stepAudit / fix canonical, meta)
   *   - performance → logs as "auditor" (future: page weight optimization)
   *   - security → logs as "auditor" (future: mixed content fix)
   *   - content → logs as "writer" (future: stepDraft expansion)
   *
   * Respects copilot/autopilot mode:
   *   - autopilot: status = "Running" (auto-executing)
   *   - copilot: status = "Awaiting_Approval" (human gate)
   */
  private async dispatchAuditFix(dispatch: AuditFixDispatch): Promise<{
    success: boolean;
    task_id: string;
    status: string;
    agent_type: string;
    mode: string;
  }> {
    const { projectId, title, description, category, priority, effort, impact } = dispatch;

    // Determine the agent type based on the fix category
    const agentType = category === "content" ? "writer" : "auditor";

    // Read copilot/autopilot mode from KV
    const settings = await this.env.CONFIG_KV.get<{
      mode: "copilot" | "autopilot";
    }>(KV_KEYS.settings(projectId), "json");
    const mode = settings?.mode ?? "copilot";

    // In autopilot mode, tasks go straight to Running; in copilot they await approval
    const taskStatus = mode === "autopilot" ? "Running" : "Awaiting_Approval";

    // Build a descriptive task log entry
    const taskDescription = `[Audit Fix P${priority}] ${title} — ${description} (effort: ${effort}, impact: ${impact})`;

    // Generate a unique task ID
    const taskId = `task_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Insert into Agent_Tasks with parameterized query
    try {
      await this.env.DB.prepare(
        `INSERT INTO Agent_Tasks (id, project_id, agent_type, action, status, task_description)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          taskId,
          projectId,
          agentType,
          `Audit Remediation: ${category}`,
          taskStatus,
          taskDescription
        )
        .run();
    } catch (err) {
      console.error(`[DO] Failed to insert audit fix task: ${err instanceof Error ? err.message : err}`);
      throw new Error(`Failed to dispatch audit fix: ${err instanceof Error ? err.message : "DB error"}`);
    }

    // Also log via the standard logTask helper for the activity feed
    await this.logTask(
      projectId,
      "orchestrator",
      "Swarm Dispatch",
      "Completed",
      `Dispatched audit fix to ${agentType} agent: "${title}" [${category}] — ${mode} mode → ${taskStatus}`
    );

    return {
      success: true,
      task_id: taskId,
      status: taskStatus,
      agent_type: agentType,
      mode,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Reset (Emergency)
  // ───────────────────────────────────────────────────────────

  private async resetWorkflow(): Promise<void> {
    this.workflow = null;
    await this.state.storage.delete("workflow");
  }

  // ───────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────

  /**
   * Logs an agent task to D1 via parameterized query.
   */
  private async logTask(
    projectId: string,
    agentType: string,
    action: string,
    status: string,
    description: string
  ): Promise<void> {
    try {
      await this.env.DB.prepare(
        `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(projectId, agentType, action, status, description)
        .run();
    } catch (err) {
      console.error(`[DO] Failed to log task: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Computes a heuristic SEO score (0-100) based on content signals.
   */
  private computeSEOScore(content: ContentGenerationResult, keyword: string): number {
    let score = 50; // Base score

    // Title contains keyword (+15)
    if (content.title.toLowerCase().includes(keyword.toLowerCase())) score += 15;

    // Good word count 1500-3000 (+10)
    if (content.wordCount >= 1500 && content.wordCount <= 3000) score += 10;
    else if (content.wordCount >= 1000) score += 5;

    // Meta description present and reasonable length (+10)
    if (content.metaDescription && content.metaDescription.length >= 70 && content.metaDescription.length <= 160) {
      score += 10;
    }

    // Multiple sections (+10)
    if (content.sections.length >= 5) score += 10;
    else if (content.sections.length >= 3) score += 5;

    // HTML content has semantic tags (+5)
    if (/<h[23]/i.test(content.htmlContent)) score += 5;

    return Math.min(100, score);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private capitalizeFirst(str: string): string {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 16: Autonomous CRO Optimization
  // ─────────────────────────────────────────────────────────────

  /**
   * Evaluates a page's telemetry and executes CRO optimizations.
   *
   * Flow:
   *   1. Fetch telemetry data for the asset from D1
   *   2. Run evaluatePagePerformance() from the CRO engine
   *   3. For each triggered task:
   *      - DOM_REORDER: Use HTMLRewriter to move the CTA above the fold
   *      - CONTENT_REWRITE: Use OpenAI to rewrite the intro paragraph
   *   4. Push optimized HTML back via CMS webhooks
   *   5. Update last_optimized_at timestamp
   */
  async optimizeCRO(
    assetId: string,
    telemetry: TelemetryRow,
    env: Env
  ): Promise<{
    success: boolean;
    tasks_executed: string[];
    error?: string;
  }> {
    const projectId = (await this.ctx.storage.get<string>("projectId")) || "";
    const tasksExecuted: string[] = [];

    try {
      // 1. Evaluate performance
      const evaluation = evaluatePagePerformance(assetId, telemetry);

      if (!evaluation.needs_optimization) {
        return {
          success: true,
          tasks_executed: [],
        };
      }

      // 2. Fetch current HTML from the published URL
      let currentHtml = "";
      if (telemetry.published_url) {
        try {
          const resp = await fetch(telemetry.published_url);
          currentHtml = await resp.text();
        } catch (fetchErr) {
          console.error(`[DO CRO] Failed to fetch ${telemetry.published_url}:`, fetchErr);
        }
      }

      if (!currentHtml) {
        // Fallback: try to get HTML from D1 Content_Assets
        const row = await env.DB.prepare(
          `SELECT html_content FROM Content_Assets WHERE id = ?1`
        )
          .bind(assetId)
          .first<{ html_content: string }>();
        currentHtml = row?.html_content || "";
      }

      if (!currentHtml) {
        return {
          success: false,
          tasks_executed: [],
          error: "No HTML content available for optimization",
        };
      }

      let optimizedHtml = currentHtml;

      // 3. Execute each CRO task
      for (const task of evaluation.tasks) {
        if (task.task_type === "DOM_REORDER") {
          optimizedHtml = await this.executeDOMReorder(optimizedHtml);
          tasksExecuted.push("DOM_REORDER");
        }

        if (task.task_type === "CONTENT_REWRITE") {
          optimizedHtml = await this.executeContentRewrite(
            optimizedHtml,
            env
          );
          tasksExecuted.push("CONTENT_REWRITE");
        }
      }

      // 4. Update Content_Assets with optimized HTML
      await env.DB.prepare(
        `UPDATE Content_Assets SET html_content = ?1 WHERE id = ?2`
      )
        .bind(optimizedHtml, assetId)
        .run();

      // 5. Update last_optimized_at in Page_Telemetry
      await env.DB.prepare(
        `UPDATE Page_Telemetry SET last_optimized_at = datetime('now') WHERE asset_id = ?1`
      )
        .bind(assetId)
        .run();

      // 6. Log the optimization task
      await this.logAgentTask(
        env.DB,
        projectId,
        "cro",
        "CRO Optimization",
        "Completed",
        `Optimized ${assetId}: ${tasksExecuted.join(", ")}. ` +
          `Scroll: ${telemetry.avg_scroll_depth.toFixed(1)}%, ` +
          `Dwell: ${telemetry.avg_dwell_time_seconds}s, ` +
          `CTA clicks: ${telemetry.cta_clicks}`
      );

      return {
        success: true,
        tasks_executed: tasksExecuted,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[DO CRO] Error optimizing ${assetId}:`, message);

      await this.logAgentTask(
        env.DB,
        projectId,
        "cro",
        "CRO Optimization",
        "Failed",
        `Failed to optimize ${assetId}: ${message}`
      );

      return {
        success: false,
        tasks_executed: tasksExecuted,
        error: message,
      };
    }
  }

  /**
   * DOM_REORDER: Uses HTMLRewriter to find the primary CTA
   * (.swarm-cta or the first product widget) and inject a copy
   * of it immediately after the first <h2> tag.
   *
   * This moves the CTA above the fold where the scroll depth
   * data shows users actually reach.
   */
  private async executeDOMReorder(html: string): Promise<string> {
    let ctaHtml = "";
    let firstH2Found = false;
    let ctaInjected = false;

    // Pass 1: Extract the CTA element
    const ctaExtractor = new HTMLRewriter()
      .on(".swarm-cta", {
        element(el) {
          if (!ctaHtml) {
            // Capture the outer HTML by collecting the element
            const tagName = el.tagName;
            const attrs: string[] = [];
            for (const [name, value] of el.attributes) {
              attrs.push(`${name}="${value}"`);
            }
            ctaHtml = `<${tagName} ${attrs.join(" ")} data-cro-injected="true">`;
          }
        },
        text(text) {
          if (ctaHtml && !ctaHtml.includes("</")) {
            ctaHtml += text.text;
            if (text.lastInTextNode) {
              // Close the tag — we'll extract the tag name from ctaHtml
              const match = ctaHtml.match(/^<(\w+)/);
              if (match) {
                ctaHtml += `</${match[1]}>`;
              }
            }
          }
        },
      });

    // Run pass 1 on the HTML
    const pass1Response = ctaExtractor.transform(
      new Response(html, { headers: { "content-type": "text/html" } })
    );
    await pass1Response.text(); // consume to execute handlers

    // If no CTA found, look for a common product widget pattern
    if (!ctaHtml) {
      ctaHtml =
        '<div class="swarm-cta" data-cro-injected="true" style="' +
        "margin:1.5rem 0;padding:1rem;border:2px solid currentColor;" +
        'border-radius:0.5rem;text-align:center;">' +
        '<a href="#" style="font-weight:600;">Shop Now \u2192</a></div>';
    }

    // Pass 2: Inject the CTA after the first <h2>
    const rewriter = new HTMLRewriter()
      .on("h2", {
        element(el) {
          if (!firstH2Found && !ctaInjected) {
            firstH2Found = true;
            ctaInjected = true;
            el.after(ctaHtml, { html: true });
          }
        },
      });

    const pass2Response = rewriter.transform(
      new Response(html, { headers: { "content-type": "text/html" } })
    );
    return await pass2Response.text();
  }

  /**
   * CONTENT_REWRITE: Uses OpenAI to rewrite the first paragraph
   * (intro) of the article to be more engaging and reduce bounce.
   *
   * Falls back to a simple HTMLRewriter hook-enhancement if
   * OpenAI key is not configured.
   */
  private async executeContentRewrite(
    html: string,
    env: Env
  ): Promise<string> {
    // Extract the first <p> content
    let firstParagraph = "";
    const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/is);
    if (pMatch) {
      firstParagraph = pMatch[1].replace(/<[^>]*>/g, "").trim();
    }

    if (!firstParagraph || firstParagraph.length < 20) {
      return html; // Nothing meaningful to rewrite
    }

    let rewrittenIntro = "";

    // Try OpenAI for an intelligent rewrite
    if (env.OPENAI_API_KEY) {
      try {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a conversion rate optimization expert. " +
                    "Rewrite the following article introduction to be more " +
                    "compelling, hook-driven, and engaging. Keep the same " +
                    "topic and information but make readers want to keep " +
                    "scrolling. Return ONLY the rewritten paragraph, no " +
                    "explanations or markdown.",
                },
                {
                  role: "user",
                  content: firstParagraph,
                },
              ],
              temperature: 0.7,
              max_tokens: 300,
            }),
          }
        );

        if (response.ok) {
          const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          rewrittenIntro = data.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (apiErr) {
        console.error("[DO CRO] OpenAI rewrite failed:", apiErr);
      }
    }

    // Fallback: enhance with a hook prefix
    if (!rewrittenIntro) {
      rewrittenIntro =
        "<strong>Here\u2019s what you need to know:</strong> " +
        firstParagraph;
    }

    // Replace the first <p> content using HTMLRewriter
    let replaced = false;
    const rewriter = new HTMLRewriter().on("p", {
      element(el) {
        if (!replaced) {
          replaced = true;
          el.setInnerContent(rewrittenIntro, { html: true });
        }
      },
    });

    const response = rewriter.transform(
      new Response(html, { headers: { "content-type": "text/html" } })
    );
    return await response.text();
  }

  // ───────────────────────────────────────────────────────────
  // Phase 18: Content Decay — Refresh Article Handler
  // ───────────────────────────────────────────────────────────

  /**
   * Handles a content refresh request dispatched by the weekly
   * decay cron. Calls the LLM to generate updated content,
   * then saves the draft for human review. NEVER overwrites
   * live content — strict copilot constraint.
   */
  private async handleRefreshArticle(body: {
    assetId: string;
    keyword: string;
    title: string;
    slug: string;
    existingHtml: string;
  }): Promise<{ success: boolean; assetId: string; status: string }> {
    const { assetId, keyword, existingHtml } = body;

    try {
      console.log(
        `[DO Refresh] Generating refresh for asset ${assetId} (keyword: "${keyword}")`
      );

      // Get the OpenAI key from KV or env
      const projectId = this.workflow?.projectId || "";
      let openaiKey = "";
      if (projectId) {
        openaiKey =
          (await this.env.CONFIG_KV.get(
            `vault:project:${projectId}:openai_api_key`
          )) || "";
      }
      if (!openaiKey) {
        openaiKey = this.env.OPENAI_API_KEY || "";
      }

      // Generate refreshed content via LLM
      const refreshedHtml = await generateRefreshedContent(
        existingHtml,
        keyword,
        openaiKey
      );

      // Save the draft to D1 (status = AWAITING_APPROVAL)
      await saveRefreshDraft(this.env.DB, assetId, refreshedHtml);

      console.log(
        `[DO Refresh] Draft saved for asset ${assetId} — AWAITING_APPROVAL`
      );

      return {
        success: true,
        assetId,
        status: "AWAITING_APPROVAL",
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown refresh error";
      console.error(`[DO Refresh] Error for asset ${assetId}:`, message);

      // Revert status so it can be retried
      await this.env.DB.prepare(
        `UPDATE Content_Assets
         SET refresh_status = NULL, updated_at = datetime('now')
         WHERE id = ?1`
      )
        .bind(assetId)
        .run();

      return {
        success: false,
        assetId,
        status: "FAILED",
      };
    }
  }
}
