import type { Express } from "express";
import { createServer, type Server } from "http";

/**
 * Dashboard API routes — mirrors the Cloudflare Worker API contract.
 *
 * In development, these serve mock data matching the D1 schema.
 * In production, the dashboard calls the deployed Worker directly
 * or these routes proxy to the Worker URL.
 */

// ── Mock Data (matches D1 seed data from workers/migrations/0001_init.sql) ──

const MOCK_PROJECTS = [
  { id: "proj_001", name: "Swarme Marketing", domain: "swarme.io", mode: "copilot", is_active: 1, visibility_score: 50.0, active_agents: 12, created_at: "2026-03-01T00:00:00", updated_at: "2026-03-13T20:00:00" },
  { id: "proj_002", name: "EdgeStack Blog", domain: "edgestack.dev", mode: "autopilot", is_active: 1, visibility_score: 72.0, active_agents: 8, created_at: "2026-03-02T00:00:00", updated_at: "2026-03-13T18:00:00" },
  { id: "proj_003", name: "CloudNative Hub", domain: "cloudnative.io", mode: "copilot", is_active: 0, visibility_score: 35.0, active_agents: 0, created_at: "2026-03-03T00:00:00", updated_at: "2026-03-10T12:00:00" },
];

const MOCK_TASKS = [
  { id: "task_001", project_id: "proj_001", agent_type: "scraper", action: "SERP Analysis", status: "Running", task_description: 'Parsing top 10 results for "edge computing saas"', created_at: "2026-03-13T20:54:00", updated_at: "2026-03-13T20:54:00" },
  { id: "task_002", project_id: "proj_001", agent_type: "writer", action: "Content Draft", status: "Awaiting_Approval", task_description: 'Generated pillar post: "Edge Computing in 2026"', created_at: "2026-03-13T20:53:00", updated_at: "2026-03-13T20:53:00" },
  { id: "task_003", project_id: "proj_001", agent_type: "auditor", action: "Technical Audit", status: "Completed", task_description: "Fixed 3 broken canonical tags on /blog/*", created_at: "2026-03-13T20:51:00", updated_at: "2026-03-13T20:51:00" },
  { id: "task_004", project_id: "proj_001", agent_type: "cro", action: "A/B Test", status: "Running", task_description: "Testing new H1 variant on /pricing — bounce rate was 74%", created_at: "2026-03-13T20:49:00", updated_at: "2026-03-13T20:49:00" },
  { id: "task_005", project_id: "proj_001", agent_type: "outreach", action: "PR Campaign", status: "Completed", task_description: "Sent 8 personalized outreach emails for backlink acquisition", created_at: "2026-03-13T20:42:00", updated_at: "2026-03-13T20:42:00" },
  { id: "task_006", project_id: "proj_001", agent_type: "visibility", action: "Citation Check", status: "Completed", task_description: "Checked 6 keywords across Perplexity AI", created_at: "2026-03-13T20:36:00", updated_at: "2026-03-13T20:36:00" },
  { id: "task_007", project_id: "proj_001", agent_type: "scraper", action: "Trend Detection", status: "Completed", task_description: 'Breakout term detected: "serverless seo" (velocity: 4.2x)', created_at: "2026-03-13T20:29:00", updated_at: "2026-03-13T20:29:00" },
  { id: "task_008", project_id: "proj_001", agent_type: "writer", action: "Response Article", status: "Completed", task_description: 'Auto-drafted response to trending query "ai seo tools 2026"', created_at: "2026-03-13T20:22:00", updated_at: "2026-03-13T20:22:00" },
  { id: "task_009", project_id: "proj_001", agent_type: "auditor", action: "Schema Validation", status: "Failed", task_description: "FAQ schema on /help rejected by Google — missing mainEntity", created_at: "2026-03-13T20:15:00", updated_at: "2026-03-13T20:15:00" },
  { id: "task_010", project_id: "proj_001", agent_type: "media", action: "Media Generation", status: "Completed", task_description: '[dalle3_r2] Generated 3/3 images for "Edge Computing in 2026" — stored in R2', created_at: "2026-03-13T20:52:30", updated_at: "2026-03-13T20:52:30" },
  { id: "task_011", project_id: "proj_001", agent_type: "media", action: "Media Generation", status: "Completed", task_description: '[dalle3_r2] Generated 2/2 images for "Serverless SEO Tools" — stored in R2', created_at: "2026-03-13T20:21:00", updated_at: "2026-03-13T20:21:00" },
  { id: "task_012", project_id: "proj_001", agent_type: "orchestrator", action: "Inventory Check", status: "Low_Inventory", task_description: '[circuit-breaker] Aborted pipeline for "Cashmere Wrap Coat" — inventory qty 2 < threshold 5. Flagged Low_Inventory, compute rerouted.', created_at: "2026-03-13T20:10:00", updated_at: "2026-03-13T20:10:00" },
  { id: "task_013", project_id: "proj_001", agent_type: "orchestrator", action: "Inventory Check", status: "Low_Inventory", task_description: '[circuit-breaker] Aborted pipeline for "Silk Midi Skirt" — inventory qty 0 (out of stock). Flagged Low_Inventory, compute rerouted.', created_at: "2026-03-13T20:05:00", updated_at: "2026-03-13T20:05:00" },
  { id: "task_014", project_id: "proj_001", agent_type: "cro", action: "Mobile UX Alert", status: "Completed", task_description: '[GA4 CRO] /products/cashmere-wrap-coat has 82% mobile bounce rate (47 sessions). UI/UX improvement suggestion added to Roadmap as "High mobile bounce on /products/cashmere-wrap-coat — UX audit needed".', created_at: "2026-03-13T20:03:00", updated_at: "2026-03-13T20:03:00" },
  { id: "task_015", project_id: "proj_001", agent_type: "cro", action: "Mobile UX Alert", status: "Completed", task_description: '[GA4 CRO] /products/silk-midi-skirt has 76% mobile bounce rate (32 sessions). UI/UX improvement suggestion added to Roadmap as "Mobile bounce rate 76% on /products/silk-midi-skirt".', created_at: "2026-03-13T20:02:00", updated_at: "2026-03-13T20:02:00" },
];

const MOCK_VISIBILITY = [
  { id: "vis_001", project_id: "proj_001", keyword: "edge computing saas", engine: "Perplexity", cited: 1, rank_position: 3, citation_url: "https://swarme.io/edge-computing", checked_at: "2026-03-13T20:00:00" },
  { id: "vis_002", project_id: "proj_001", keyword: "autonomous seo platform", engine: "Perplexity", cited: 0, rank_position: null, citation_url: null, checked_at: "2026-03-13T20:00:00" },
  { id: "vis_003", project_id: "proj_001", keyword: "serverless seo tools", engine: "ChatGPT", cited: 1, rank_position: 1, citation_url: "https://swarme.io/serverless-seo", checked_at: "2026-03-13T20:00:00" },
  { id: "vis_004", project_id: "proj_001", keyword: "ai digital marketing", engine: "Perplexity", cited: 0, rank_position: null, citation_url: null, checked_at: "2026-03-13T20:00:00" },
  { id: "vis_005", project_id: "proj_001", keyword: "generative engine optimization", engine: "Gemini", cited: 1, rank_position: 2, citation_url: "https://swarme.io/geo-guide", checked_at: "2026-03-13T20:00:00" },
  { id: "vis_006", project_id: "proj_001", keyword: "automated link building", engine: "Perplexity", cited: 0, rank_position: null, citation_url: null, checked_at: "2026-03-13T20:00:00" },
];

// In-memory settings store (mirrors KV)
const settingsStore = new Map<string, any>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/projects
  app.get("/api/projects", (_req, res) => {
    res.json({ success: true, count: MOCK_PROJECTS.length, projects: MOCK_PROJECTS });
  });

  // GET /api/projects/:projectId/tasks
  app.get("/api/projects/:projectId/tasks", (req, res) => {
    const { projectId } = req.params;
    const { status, agent_type, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(String(limitStr || "50"), 10) || 50, 100);

    let tasks = MOCK_TASKS.filter((t) => t.project_id === projectId);
    if (status) tasks = tasks.filter((t) => t.status === status);
    if (agent_type) tasks = tasks.filter((t) => t.agent_type === agent_type);
    tasks = tasks.slice(0, limit);

    res.json({ success: true, project_id: projectId, count: tasks.length, tasks });
  });

  // GET /api/projects/:projectId/visibility
  app.get("/api/projects/:projectId/visibility", (req, res) => {
    const { projectId } = req.params;
    const { engine, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(String(limitStr || "50"), 10) || 50, 200);

    let logs = MOCK_VISIBILITY.filter((v) => v.project_id === projectId);
    if (engine) logs = logs.filter((v) => v.engine === engine);
    logs = logs.slice(0, limit);

    const total = logs.length;
    const cited = logs.filter((v) => v.cited === 1).length;
    const score = total > 0 ? Math.round((cited / total) * 100) : 0;

    res.json({
      success: true,
      project_id: projectId,
      visibility_score: score,
      total_checks: total,
      cited_count: cited,
      gap_count: total - cited,
      logs,
    });
  });

  // GET /api/projects/:projectId/visibility/summary
  app.get("/api/projects/:projectId/visibility/summary", (req, res) => {
    const { projectId } = req.params;
    const logs = MOCK_VISIBILITY.filter((v) => v.project_id === projectId);
    const total = logs.length;
    const cited = logs.filter((v) => v.cited === 1).length;

    res.json({
      success: true,
      project_id: projectId,
      visibility_score: total > 0 ? Math.round((cited / total) * 100) : 0,
      keywords_tracked: total,
      keywords_cited: cited,
      citation_gaps: total - cited,
      keywords: logs,
    });
  });

  // PUT /api/projects/:projectId/settings
  app.put("/api/projects/:projectId/settings", (req, res) => {
    const { projectId } = req.params;
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
    }

    const existing = settingsStore.get(projectId) || {};
    const body = req.body || {};
    const settings = {
      mode: body.mode ?? existing.mode ?? project.mode,
      is_active: body.is_active ?? existing.is_active ?? true,
      visibility_check_enabled: body.visibility_check_enabled ?? existing.visibility_check_enabled ?? true,
      trend_detection_enabled: body.trend_detection_enabled ?? existing.trend_detection_enabled ?? true,
      cro_enabled: body.cro_enabled ?? existing.cro_enabled ?? true,
      outreach_enabled: body.outreach_enabled ?? existing.outreach_enabled ?? true,
      bounce_rate_threshold: body.bounce_rate_threshold ?? existing.bounce_rate_threshold ?? 70,
      trend_velocity_threshold: body.trend_velocity_threshold ?? existing.trend_velocity_threshold ?? 2.0,
      updated_at: new Date().toISOString(),
    };

    settingsStore.set(projectId, settings);

    // Sync mode change to mock project
    if (settings.mode) {
      project.mode = settings.mode;
    }

    res.json({
      success: true,
      project_id: projectId,
      kv_key: `config:project:${projectId}:settings`,
      settings,
    });
  });

  // POST /api/projects/:projectId/tasks/:taskId/approve
  app.post("/api/projects/:projectId/tasks/:taskId/approve", (req, res) => {
    const { projectId, taskId } = req.params;
    const task = MOCK_TASKS.find((t) => t.id === taskId && t.project_id === projectId);

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    if (task.status !== "Awaiting_Approval") {
      return res.status(400).json({ success: false, error: `Task is "${task.status}", not awaiting approval` });
    }

    (task as any).status = "Running";
    (task as any).updated_at = new Date().toISOString();

    res.json({ success: true, task_id: taskId, new_status: "Running" });
  });

  // ── Phase 3: Durable Object mock routes (local dev) ──

  // In-memory workflow state per project (simulates DO storage)
  const workflowStore = new Map<string, any>();

  // Helper: simulate the full pipeline (Phase 4 response shapes)
  function runMockPipeline(projectId: string, keyword: string, initiator: string) {
    const now = new Date().toISOString();
    const hash = Array.from(keyword).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const capitalize = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    const slug = keyword.replace(/\s+/g, "-").toLowerCase();

    const competitorDomains = ["ahrefs.com", "semrush.com", "moz.com", "searchenginejournal.com"];
    const gapTopics = [`${keyword} best practices 2026`, `${keyword} vs alternatives`, `how to implement ${keyword}`];

    const research = {
      serpResults: 10 + (Math.abs(hash) % 40),
      topCompetitors: competitorDomains.slice(0, 3),
      contentGaps: gapTopics.slice(0, 2 + (Math.abs(hash) % 2)),
      semanticEntities: [keyword, `${keyword} tools`, `${keyword} strategy`, `${keyword} ROI`, `${keyword} automation`],
      suggestedAngle: `Comprehensive guide to ${keyword} with edge-native patterns`,
      rawCitations: [],
      model: "mock-v1",
      completedAt: now,
      source: "mock_fallback",
    };

    const draft = {
      title: `${capitalize(keyword)}: The Definitive Guide for 2026`,
      htmlContent: `<article><h1>${capitalize(keyword)}: The Definitive Guide for 2026</h1><p>Mock content for "${keyword}".</p></article>`,
      metaDescription: `Everything you need to know about ${keyword} in 2026. Expert insights and implementation guide.`,
      wordCount: 1800 + (Math.abs(hash) % 2200),
      sections: ["Introduction", `What is ${capitalize(keyword)}?`, "Key Benefits", "Implementation", "Measuring ROI", "FAQ", "Conclusion"],
      seoScore: 72 + (Math.abs(hash) % 20),
      model: "mock-v1",
      tokensUsed: 0,
      completedAt: now,
      source: "mock_fallback",
    };

    const mediaGeneration = {
      totalPlaceholders: 2 + (Math.abs(hash) % 3),
      imagesGenerated: 2 + (Math.abs(hash) % 2),
      imagesSkipped: Math.abs(hash) % 2,
      r2Keys: [
        `media/${projectId}/img_${Date.now()}_1.png`,
        `media/${projectId}/img_${Date.now()}_2.png`,
      ],
      completedAt: now,
      source: "mock_fallback",
    };

    const imageAudit = {
      totalImages: 3 + (Math.abs(hash) % 5),
      imagesMissingAlt: 2 + (Math.abs(hash) % 3),
      imagesEnriched: 2 + (Math.abs(hash) % 2),
      imagesSkipped: Math.abs(hash) % 2,
      warnings: Math.abs(hash) % 2 === 0 ? [] : ["1 image exceeded 5MB size limit"],
      completedAt: now,
      source: "mock_fallback",
    };

    const possibleIssues = ["H2 tag hierarchy skip", "Meta description exceeds 160 chars"];
    const issueCount = Math.abs(hash) % 2;
    const audit = {
      technicalIssues: possibleIssues.slice(0, issueCount),
      readabilityScore: 65 + (Math.abs(hash) % 30),
      keywordDensity: 1.2 + ((Math.abs(hash) % 20) / 10),
      schemaValid: issueCount < 2,
      completedAt: now,
    };

    // Check mode from settings store
    const settings = settingsStore.get(projectId);
    const mode = settings?.mode ?? MOCK_PROJECTS.find((p) => p.id === projectId)?.mode ?? "copilot";

    const isAutopilot = mode === "autopilot";
    const finalState = isAutopilot ? "COMPLETED" : "AWAITING_APPROVAL";
    const publishResult = {
      mode,
      action: isAutopilot ? "published" : "awaiting_approval",
      publishedUrl: isAutopilot ? `https://swarme.io/blog/${slug}` : null,
      cmsResponseId: null,
      contentAssetId: `asset_mock_${Date.now()}`,
      completedAt: now,
      source: "mock_fallback",
    };

    const workflow = {
      state: finalState,
      projectId,
      keyword,
      initiator,
      startedAt: now,
      updatedAt: now,
      completedAt: isAutopilot ? now : null,
      error: null,
      retryCount: 0,
      failedAtStep: null,
      pipeline: { research, draft, mediaGeneration, imageAudit, audit, publishResult },
    };

    workflowStore.set(projectId, workflow);
    return workflow;
  }

  // POST /api/projects/:projectId/trigger-workflow — Phase 32: gated to starter+ with task limit
  app.post("/api/projects/:projectId/trigger-workflow", requireFeatureAccess("starter", true), (req: any, res: any) => {
    const { projectId } = req.params;
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
    }

    const { keyword, initiator } = req.body || {};
    if (!keyword || typeof keyword !== "string") {
      return res.status(400).json({ success: false, error: "Missing required field: keyword" });
    }

    const workflow = runMockPipeline(projectId, keyword, initiator || "manual");

    res.json({
      success: true,
      project_id: projectId,
      state: workflow.state,
      keyword,
    });
  });

  // GET /api/projects/:projectId/workflow-status
  app.get("/api/projects/:projectId/workflow-status", (req, res) => {
    const { projectId } = req.params;
    const workflow = workflowStore.get(projectId);

    if (!workflow) {
      return res.json({
        success: true,
        project_id: projectId,
        workflow: {
          state: "IDLE",
          projectId,
          keyword: "",
          initiator: "manual",
          startedAt: "",
          updatedAt: new Date().toISOString(),
          completedAt: null,
          error: null,
          retryCount: 0,
          failedAtStep: null,
          pipeline: { research: null, draft: null, mediaGeneration: null, imageAudit: null, audit: null, publishResult: null },
        },
      });
    }

    res.json({ success: true, project_id: projectId, workflow });
  });

  // POST /api/projects/:projectId/workflow-approve
  app.post("/api/projects/:projectId/workflow-approve", (req, res) => {
    const { projectId } = req.params;
    const workflow = workflowStore.get(projectId);

    if (!workflow) {
      return res.status(404).json({ success: false, error: "No active workflow" });
    }
    if (workflow.state !== "AWAITING_APPROVAL") {
      return res.status(409).json({ success: false, error: `Cannot approve — workflow is in ${workflow.state} state` });
    }

    const now = new Date().toISOString();
    workflow.state = "COMPLETED";
    workflow.completedAt = now;
    workflow.updatedAt = now;
    workflow.pipeline.publishResult.action = "published";
    workflow.pipeline.publishResult.publishedUrl = `https://swarme.io/blog/${workflow.keyword.replace(/\s+/g, "-")}`;
    workflow.pipeline.publishResult.completedAt = now;
    workflowStore.set(projectId, workflow);

    res.json({
      success: true,
      project_id: projectId,
      state: "COMPLETED",
      publishedUrl: workflow.pipeline.publishResult.publishedUrl,
    });
  });

  // POST /api/projects/:projectId/workflow-reset
  app.post("/api/projects/:projectId/workflow-reset", (req, res) => {
    const { projectId } = req.params;
    workflowStore.delete(projectId);
    res.json({ success: true, project_id: projectId, state: "IDLE" });
  });

  // ── Phase 7: Billing & CMS Settings Mock Routes ──

  // In-memory workspace store
  const MOCK_WORKSPACE = {
    id: "ws_001",
    name: "Sartelle Atelier",
    owner_email: "studio@sartelle-atelier.com",
    plan_tier: "autopilot" as string,
    plan_status: "active" as string,
    stripe_customer_id: null as string | null,
    stripe_subscription_id: null as string | null,
    created_at: "2026-03-01T00:00:00",
    updated_at: "2026-03-13T20:00:00",
  };

  // In-memory CMS settings per project
  const cmsSettingsStore = new Map<string, {
    cms_platform: string;
    shopify_domain?: string;
    shopify_blog_id?: string;
    shopify_access_token_set?: boolean;
  }>();

  // GET /api/workspace
  app.get("/api/workspace", (_req, res) => {
    res.json({ success: true, workspace: MOCK_WORKSPACE });
  });

  // POST /api/billing/checkout (mock — returns a fake Stripe URL)
  // Phase 33: Now accepts { plan } instead of { workspace_id }
  app.post("/api/billing/checkout", (req, res) => {
    const { plan, workspace_id } = req.body || {};
    const validPlans = ["starter", "autopilot", "enterprise"];
    if (!plan && !workspace_id) {
      return res.status(400).json({ success: false, error: "Missing plan" });
    }
    if (plan && !validPlans.includes(plan)) {
      return res.status(400).json({ success: false, error: `Invalid plan. Choose: ${validPlans.join(", ")}` });
    }

    res.json({
      success: true,
      checkout_url: `https://checkout.stripe.com/c/pay/mock_session_${plan || "growth"}_${Date.now()}`,
      session_id: "cs_mock_" + Date.now(),
    });
  });

  // POST /api/billing/portal (mock — for managing subscription)
  app.post("/api/billing/portal", (_req, res) => {
    res.json({
      success: true,
      portal_url: "https://billing.stripe.com/p/mock_portal_demo",
    });
  });

  // POST /api/webhooks/stripe (mock — ACKs webhook events for local testing)
  app.post("/api/webhooks/stripe", (_req, res) => {
    console.log("[Mock] Stripe webhook received (no-op in dev)");
    res.json({ received: true });
  });

  // ── Phase 34: GSC Integration Mock Routes ─────────────────

  // GET /api/gsc/auth (mock — redirects to dashboard with mock success)
  app.get("/api/gsc/auth", (_req, res) => {
    res.redirect("/#/settings?gsc=connected&property=https://www.sartelleatelier.com/");
  });

  // GET /api/gsc/callback (mock — simulates OAuth callback)
  app.get("/api/gsc/callback", (_req, res) => {
    res.redirect("/#/settings?gsc=connected&property=https://www.sartelleatelier.com/");
  });

  // GET /api/gsc/status
  app.get("/api/gsc/status", (_req, res) => {
    res.json({
      success: true,
      connected: true,
      property_url: "https://www.sartelleatelier.com/",
    });
  });

  // DELETE /api/gsc/disconnect
  app.delete("/api/gsc/disconnect", (_req, res) => {
    res.json({ success: true });
  });

  // ── Phase 42: GA4 Integration Mock Routes ─────────────────

  // GET /api/ga4/auth (mock — redirects to dashboard with mock success)
  app.get("/api/ga4/auth", (_req, res) => {
    res.redirect("/#/settings?ga4=connected&property=412345678");
  });

  // GET /api/ga4/callback (mock — simulates OAuth callback)
  app.get("/api/ga4/callback", (_req, res) => {
    res.redirect("/#/settings?ga4=connected&property=412345678");
  });

  // GET /api/ga4/status
  app.get("/api/ga4/status", (_req, res) => {
    res.json({
      success: true,
      connected: true,
      property_id: "412345678",
    });
  });

  // DELETE /api/ga4/disconnect
  app.delete("/api/ga4/disconnect", (_req, res) => {
    res.json({ success: true });
  });

  // GET /api/ga4/metrics — mock GA4 analytics data
  app.get("/api/ga4/metrics", (_req, res) => {
    const pages = [
      "/blog/edge-computing-2026",
      "/blog/serverless-seo",
      "/products/cashmere-wrap-coat",
      "/products/silk-midi-skirt",
      "/collections/winter-2026",
    ];
    const devices = ["desktop", "mobile", "tablet"];
    const countries = ["United States", "United Kingdom", "France", "Germany", "Canada"];
    const metrics: any[] = [];
    const now = new Date();

    for (let i = 7; i >= 1; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];

      for (const page of pages) {
        for (const device of devices) {
          const isMobile = device === "mobile";
          const isProduct = page.startsWith("/products");
          const baseBounce = isMobile && isProduct ? 0.74 + Math.random() * 0.12 : 0.35 + Math.random() * 0.25;
          const sessions = isMobile ? 15 + Math.floor(Math.random() * 40) : 25 + Math.floor(Math.random() * 60);
          const avgDuration = isMobile ? 8 + Math.random() * 25 : 30 + Math.random() * 90;

          metrics.push({
            page_path: page,
            device_category: device,
            date: dateStr,
            sessions,
            bounce_rate: parseFloat(baseBounce.toFixed(4)),
            avg_session_duration: parseFloat(avgDuration.toFixed(1)),
            conversions: Math.floor(sessions * (0.02 + Math.random() * 0.06)),
            conversion_rate: parseFloat((0.02 + Math.random() * 0.06).toFixed(4)),
            country: "",
          });
        }
      }

      // Geo conversion data
      for (const page of pages.slice(0, 3)) {
        for (const country of countries) {
          const sessions = 10 + Math.floor(Math.random() * 30);
          const conversions = Math.floor(sessions * (0.01 + Math.random() * 0.08));
          metrics.push({
            page_path: page,
            device_category: "all",
            date: dateStr,
            sessions,
            bounce_rate: 0,
            avg_session_duration: 0,
            conversions,
            conversion_rate: parseFloat((conversions / sessions).toFixed(4)),
            country,
          });
        }
      }
    }

    res.json({ success: true, metrics });
  });

  // GET /api/projects/:projectId/gsc-metrics — mock GSC data for charts
  app.get("/api/projects/:projectId/gsc-metrics", (_req, res) => {
    // Generate 14 days of realistic mock GSC data
    const metrics = [];
    const now = new Date();
    for (let i = 16; i >= 3; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const baseClicks = 120 + Math.floor(Math.random() * 80);
      const baseImpressions = 2800 + Math.floor(Math.random() * 600);
      metrics.push({
        date: dateStr,
        clicks: baseClicks + Math.floor(i * 3),
        impressions: baseImpressions + Math.floor(i * 40),
        ctr: parseFloat(((baseClicks / baseImpressions) * 100).toFixed(2)),
        position: parseFloat((4.2 + Math.random() * 1.5).toFixed(1)),
      });
    }
    res.json({ success: true, metrics });
  });

  // ── Phase 35: A/B Testing Mock Routes ─────────────────────

  // GET /api/projects/:projectId/ab-tests — mock A/B test data
  app.get("/api/projects/:projectId/ab-tests", (req, res) => {
    const { projectId } = req.params;
    const statusFilter = (req.query.status as string) || null;

    // Helper: A&S normal CDF + Z-test for mock significance
    function normalCDF(x: number): number {
      const sign = x < 0 ? -1 : 1;
      const absX = Math.abs(x);
      const t = 1.0 / (1.0 + 0.3275911 * absX);
      const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
      const y = 1.0 - poly * Math.exp(-absX * absX / 2.0);
      return 0.5 * (1.0 + sign * y);
    }
    function mockSignificance(va: number, ca: number, vb: number, cb: number, minV: number) {
      const total = va + vb;
      const meetsMinViews = total >= minV;
      if (va === 0 || vb === 0) return { rateA: 0, rateB: 0, pooledRate: 0, zScore: 0, pValue: 1, confidence: 0, isSignificant: false, winner: null, meetsMinViews: false };
      const rA = ca / va;
      const rB = cb / vb;
      const pool = (ca + cb) / total;
      if (pool === 0 || pool === 1) return { rateA: rA, rateB: rB, pooledRate: pool, zScore: 0, pValue: 1, confidence: 0, isSignificant: false, winner: null, meetsMinViews };
      const se = Math.sqrt(pool * (1 - pool) * (1 / va + 1 / vb));
      const z = (rA - rB) / se;
      const pVal = 2 * (1 - normalCDF(Math.abs(z)));
      const clampedP = Math.max(0, Math.min(1, pVal));
      const conf = Math.min(100, Math.max(0, (1 - clampedP) * 100));
      const isSig = clampedP < 0.05 && meetsMinViews;
      return {
        rateA: Math.round(rA * 10000) / 10000,
        rateB: Math.round(rB * 10000) / 10000,
        pooledRate: Math.round(pool * 10000) / 10000,
        zScore: Math.round(z * 1000) / 1000,
        pValue: Math.round(clampedP * 10000) / 10000,
        confidence: Math.round(conf * 10) / 10,
        isSignificant: isSig,
        winner: isSig ? (rA > rB ? "A" : "B") : null,
        meetsMinViews,
      };
    }

    const mockTests = [
      {
        id: "ab_test_001",
        project_id: projectId,
        asset_id: "asset_edge_computing",
        test_name: "Pricing CTA — Green vs Blue",
        target_selector: ".cta-primary",
        variant_a_html: '<button class="cta-primary bg-emerald-600">Start Free Trial</button>',
        variant_b_html: '<button class="cta-primary bg-blue-600">Get Started Free</button>',
        views_a: 1247,
        views_b: 1253,
        conversions_a: 89,
        conversions_b: 112,
        status: "Running" as const,
        winner: null,
        min_views: 500,
        created_at: "2026-03-10T14:00:00",
        updated_at: "2026-03-15T22:00:00",
      },
      {
        id: "ab_test_002",
        project_id: projectId,
        asset_id: "asset_seo_guide",
        test_name: "Hero H1 — Question vs Statement",
        target_selector: "h1.hero-title",
        variant_a_html: '<h1 class="hero-title">The Ultimate SEO Guide for 2026</h1>',
        variant_b_html: '<h1 class="hero-title">Want to Dominate SEO in 2026?</h1>',
        views_a: 340,
        views_b: 355,
        conversions_a: 28,
        conversions_b: 31,
        status: "Running" as const,
        winner: null,
        min_views: 500,
        created_at: "2026-03-12T09:00:00",
        updated_at: "2026-03-15T21:30:00",
      },
      {
        id: "ab_test_003",
        project_id: projectId,
        asset_id: "asset_serverless_seo",
        test_name: "Signup Form — Single vs Two-Step",
        target_selector: ".signup-form",
        variant_a_html: '<form class="signup-form"><input placeholder="Email" /><button>Sign Up</button></form>',
        variant_b_html: '<form class="signup-form"><button>Get Started →</button></form>',
        views_a: 2100,
        views_b: 2050,
        conversions_a: 168,
        conversions_b: 215,
        status: "Concluded" as const,
        winner: "B",
        min_views: 500,
        created_at: "2026-03-05T10:00:00",
        updated_at: "2026-03-14T18:00:00",
      },
    ];

    let filtered = mockTests;
    if (statusFilter) {
      filtered = mockTests.filter((t) => t.status === statusFilter);
    }

    const withSig = filtered.map((t) => ({
      ...t,
      significance: mockSignificance(t.views_a, t.conversions_a, t.views_b, t.conversions_b, t.min_views),
    }));

    res.json({ success: true, project_id: projectId, tests: withSig, total: withSig.length });
  });

  // POST /api/projects/:projectId/ab-tests — mock create
  app.post("/api/projects/:projectId/ab-tests", (_req, res) => {
    res.status(201).json({ success: true, test_id: "ab_" + Date.now().toString(36), status: "Running" });
  });

  // GET /api/projects/:projectId/ab-tests/:testId/significance — mock significance
  app.get("/api/projects/:projectId/ab-tests/:testId/significance", (_req, res) => {
    res.json({
      success: true,
      test_id: _req.params.testId,
      rateA: 0.0713,
      rateB: 0.0894,
      pooledRate: 0.0804,
      zScore: -1.892,
      pValue: 0.0585,
      confidence: 94.2,
      isSignificant: false,
      winner: null,
      meetsMinViews: true,
    });
  });

  // GET /api/projects/:projectId/cms-settings
  app.get("/api/projects/:projectId/cms-settings", (req, res) => {
    const { projectId } = req.params;
    const settings = cmsSettingsStore.get(projectId) || {
      cms_platform: "generic",
      shopify_domain: "",
      shopify_blog_id: "",
      shopify_access_token_set: false,
    };
    res.json({ success: true, project_id: projectId, cms_settings: settings });
  });

  // PUT /api/projects/:projectId/cms-settings
  app.put("/api/projects/:projectId/cms-settings", (req, res) => {
    const { projectId } = req.params;
    const body = req.body || {};
    const existing = cmsSettingsStore.get(projectId) || {
      cms_platform: "generic",
      shopify_domain: "",
      shopify_blog_id: "",
      shopify_access_token_set: false,
    };
    const updated = {
      cms_platform: body.cms_platform ?? existing.cms_platform ?? "generic",
      shopify_domain: body.shopify_domain ?? existing.shopify_domain ?? "",
      shopify_blog_id: body.shopify_blog_id ?? existing.shopify_blog_id ?? "",
      shopify_access_token_set: body.shopify_access_token ? true : (existing.shopify_access_token_set ?? false),
    };
    cmsSettingsStore.set(projectId, updated);
    res.json({ success: true, project_id: projectId, cms_settings: updated });
  });

  // ── Phase 11: Site Audit Mock Routes ──

  // In-memory audit store (simulates D1 Site_Audits table)
  const auditStore = new Map<string, any>();

  // Mock audit data for Sartelle Atelier (proj_001)
  const MOCK_SARTELLE_AUDIT = {
    id: "audit_mock_001",
    project_id: "proj_001",
    health_score: 62,
    status: "completed",
    audited_url: "https://swarme.io",
    pages_crawled: 5,
    error_message: null,
    created_at: "2026-03-13T22:00:00",
    updated_at: "2026-03-13T22:01:30",
    findings: [
      { category: "seo", severity: "critical", title: "Missing H1 tag", detail: "/collections page has no H1 heading. Every page needs exactly one H1." },
      { category: "seo", severity: "high", title: "Missing meta description", detail: "/blog has no meta description. Search engines use this for snippet display." },
      { category: "seo", severity: "high", title: "Missing canonical tag", detail: "/products/silk-drape-blazer lacks a canonical URL tag. Risk of duplicate content." },
      { category: "accessibility", severity: "high", title: "Images missing alt text", detail: "Homepage has 4 image(s) without alt attributes." },
      { category: "seo", severity: "medium", title: "No structured data (JSON-LD/Schema)", detail: "Homepage has no structured data markup. Add JSON-LD for rich results." },
      { category: "seo", severity: "medium", title: "Meta description too long", detail: "/about meta description is 187 chars (max 160)." },
      { category: "security", severity: "high", title: "Mixed content detected", detail: "/lookbook loads resources over HTTP on an HTTPS page." },
      { category: "performance", severity: "high", title: "Slow page load indicators", detail: "/collections shows signs of heavy page weight — 8.2MB total." },
      { category: "content", severity: "medium", title: "Thin content", detail: "/blog/winter-edit has only ~180 words. Pages under 300 words often rank poorly." },
      { category: "seo", severity: "low", title: "Missing OpenGraph tags", detail: "/blog lacks OG tags. Social sharing will use default appearance." },
      { category: "seo", severity: "low", title: "Missing Twitter Card meta", detail: "/about has no Twitter Card meta tags." },
      { category: "content", severity: "high", title: "Broken links detected", detail: "/blog has 3 potential broken link(s) pointing to archived pages." },
    ],
    roadmap: [
      { priority: 1, title: "Missing H1 tag", description: "Add a single H1 to /collections. This is a critical ranking signal.", category: "seo", effort: "low", impact: "high" },
      { priority: 2, title: "Images missing alt text", description: "Add descriptive alt text to 4 images on the homepage for accessibility and image SEO.", category: "accessibility", effort: "low", impact: "high" },
      { priority: 3, title: "Missing meta description", description: "Write a compelling meta description (120–160 chars) for /blog.", category: "seo", effort: "low", impact: "high" },
      { priority: 4, title: "Missing canonical tag", description: "Add <link rel='canonical'> to /products/silk-drape-blazer to prevent duplicate content issues.", category: "seo", effort: "low", impact: "high" },
      { priority: 5, title: "Mixed content detected", description: "Audit /lookbook for HTTP resources and upgrade all to HTTPS.", category: "security", effort: "medium", impact: "high" },
      { priority: 6, title: "Broken links detected", description: "Fix or redirect 3 broken links on /blog pointing to archived pages.", category: "content", effort: "low", impact: "high" },
      { priority: 7, title: "Slow page load indicators", description: "Optimize /collections: compress images, lazy-load below-fold assets, reduce total page weight from 8.2MB.", category: "performance", effort: "high", impact: "high" },
      { priority: 8, title: "No structured data (JSON-LD/Schema)", description: "Add Product and Organization JSON-LD schema to homepage for rich search results.", category: "seo", effort: "medium", impact: "medium" },
      { priority: 9, title: "Meta description too long", description: "Shorten /about meta description from 187 to under 160 characters.", category: "seo", effort: "low", impact: "medium" },
      { priority: 10, title: "Thin content", description: "Expand /blog/winter-edit from ~180 words to at least 600+ with editorial depth.", category: "content", effort: "medium", impact: "medium" },
      { priority: 11, title: "Missing OpenGraph tags", description: "Add og:title, og:description, og:image to /blog for social preview.", category: "seo", effort: "low", impact: "low" },
      { priority: 12, title: "Missing Twitter Card meta", description: "Add twitter:card, twitter:title, twitter:description to /about.", category: "seo", effort: "low", impact: "low" },
    ],
  };

  // POST /api/projects/:projectId/audit/run
  app.post("/api/projects/:projectId/audit/run", (req, res) => {
    const { projectId } = req.params;
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
    }

    // Simulate starting an audit — immediately return the mock completed audit
    const auditId = `audit_mock_${Date.now()}`;
    const audit = {
      ...MOCK_SARTELLE_AUDIT,
      id: auditId,
      project_id: projectId,
      audited_url: `https://${project.domain}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    auditStore.set(projectId, audit);

    res.json({
      success: true,
      audit_id: auditId,
      project_id: projectId,
      status: "completed",
      audited_url: `https://${project.domain}`,
    });
  });

  // POST /api/projects/:projectId/tasks/dispatch (Phase 12)
  app.post("/api/projects/:projectId/tasks/dispatch", (req, res) => {
    const { projectId } = req.params;
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
    }

    const { title, description, category, priority, effort, impact } = req.body || {};
    if (!title || !description || !category) {
      return res.status(400).json({ success: false, error: "Missing required fields: title, description, category" });
    }

    const agentType = category === "content" ? "writer" : "auditor";
    const settings = settingsStore.get(projectId);
    const mode = settings?.mode ?? project.mode;
    const taskStatus = mode === "autopilot" ? "Running" : "Awaiting_Approval";
    const taskId = `task_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Push into MOCK_TASKS so the activity log picks it up
    MOCK_TASKS.unshift({
      id: taskId,
      project_id: projectId,
      agent_type: agentType as any,
      action: `Audit Remediation: ${category}`,
      status: taskStatus,
      task_description: `[Audit Fix P${priority ?? 0}] ${title} \u2014 ${description} (effort: ${effort ?? "medium"}, impact: ${impact ?? "medium"})`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Also push a "Swarm Dispatch" log entry
    MOCK_TASKS.unshift({
      id: `task_dispatch_${Date.now()}`,
      project_id: projectId,
      agent_type: "orchestrator" as any,
      action: "Swarm Dispatch",
      status: "Completed",
      task_description: `Dispatched audit fix to ${agentType} agent: "${title}" [${category}] \u2014 ${mode} mode \u2192 ${taskStatus}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    res.json({
      success: true,
      task_id: taskId,
      status: taskStatus,
      agent_type: agentType,
      mode,
    });
  });

  // GET /api/projects/:projectId/audit/latest
  app.get("/api/projects/:projectId/audit/latest", (req, res) => {
    const { projectId } = req.params;

    // Return stored audit, or the default mock for proj_001
    const audit = auditStore.get(projectId) ||
      (projectId === "proj_001" ? MOCK_SARTELLE_AUDIT : null);

    if (!audit) {
      return res.json({
        success: true,
        project_id: projectId,
        audit: null,
        message: "No audits found. Run a deep audit to get started.",
      });
    }

    res.json({
      success: true,
      project_id: projectId,
      audit,
    });
  });

  // ── Phase 14: Integration Connection Wizard Mock Routes ──

  // In-memory integration status store (simulates KV vault)
  const integrationStore = new Map<string, {
    platform: string;
    connected: boolean;
    store_name: string;
    shopify_domain?: string;
    woocommerce_domain?: string;
    bigcommerce_store_hash?: string;
  }>();

  // POST /api/projects/:projectId/integrations/verify
  app.post("/api/projects/:projectId/integrations/verify", (req, res) => {
    const { projectId } = req.params;
    const project = MOCK_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: `Project ${projectId} not found` });
    }

    const { platform, domain, access_token, consumer_key, consumer_secret, store_hash, blog_id } = req.body || {};

    if (!platform) {
      return res.status(400).json({ success: false, error: "Missing required field: platform" });
    }

    // Simulate validation delay
    setTimeout(() => {
      // In mock mode, all connections succeed if required fields are present
      let storeName = "";
      let valid = false;
      let error: string | null = null;

      switch (platform) {
        case "shopify":
          if (!domain || !access_token) {
            return res.status(400).json({ success: false, error: "Shopify requires domain and access_token." });
          }
          // Simulate: token starting with "shpat_" is valid; anything else fails
          if (access_token.startsWith("shpat_") || access_token.length > 5) {
            valid = true;
            storeName = `${domain.replace(/\.myshopify\.com$/, "")} Store`;
          } else {
            error = "Authentication failed. Please check that your Admin API Access Token is correct.";
          }
          break;

        case "woocommerce":
          if (!domain || !consumer_key || !consumer_secret) {
            return res.status(400).json({ success: false, error: "WooCommerce requires domain, consumer_key, and consumer_secret." });
          }
          if (consumer_key.startsWith("ck_") && consumer_secret.startsWith("cs_")) {
            valid = true;
            storeName = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
          } else {
            error = "Authentication failed. WooCommerce keys should start with 'ck_' and 'cs_'.";
          }
          break;

        case "bigcommerce":
          if (!store_hash || !access_token) {
            return res.status(400).json({ success: false, error: "BigCommerce requires store_hash and access_token." });
          }
          valid = true;
          storeName = `BigCommerce Store (${store_hash})`;
          break;

        default:
          return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });
      }

      if (!valid) {
        return res.status(401).json({ success: false, error, platform });
      }

      // Persist to in-memory store
      integrationStore.set(projectId, {
        platform,
        connected: true,
        store_name: storeName,
        ...(platform === "shopify" ? { shopify_domain: domain } : {}),
        ...(platform === "woocommerce" ? { woocommerce_domain: domain } : {}),
        ...(platform === "bigcommerce" ? { bigcommerce_store_hash: store_hash } : {}),
      });

      // Also update CMS settings store so other routes see it
      cmsSettingsStore.set(projectId, {
        cms_platform: platform,
        ...(platform === "shopify" ? { shopify_domain: domain, shopify_blog_id: blog_id || "", shopify_access_token_set: true } : {}),
      });

      return res.json({
        success: true,
        platform,
        store_name: storeName,
        project_id: projectId,
        message: `Successfully connected to ${storeName}.`,
      });
    }, 1200); // Simulate network validation delay
  });

  // GET /api/projects/:projectId/integrations/status
  app.get("/api/projects/:projectId/integrations/status", (req, res) => {
    const { projectId } = req.params;
    const integration = integrationStore.get(projectId);

    if (!integration) {
      return res.json({
        success: true,
        project_id: projectId,
        platform: null,
        connected: false,
        shopify_domain: null,
        woocommerce_domain: null,
        bigcommerce_store_hash: null,
      });
    }

    return res.json({
      success: true,
      project_id: projectId,
      platform: integration.platform,
      connected: integration.connected,
      shopify_domain: integration.shopify_domain ?? null,
      woocommerce_domain: integration.woocommerce_domain ?? null,
      bigcommerce_store_hash: integration.bigcommerce_store_hash ?? null,
    });
  });

  // ─────────────────────────────────────────────────────────
  // Phase 13: Public Free Analyzer (mock)
  // ─────────────────────────────────────────────────────────

  app.post("/api/public/analyze", (req, res) => {
    const { url, turnstileToken: _turnstile } = req.body ?? {};

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: url",
      });
    }

    const trimmedUrl = url.trim();
    const normalizedUrl = trimmedUrl.startsWith("http")
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    // Simulate a realistic analysis result
    const seed = trimmedUrl.length;
    const seoScore = 55 + (seed % 30);
    const accessibilityScore = 40 + (seed % 35);
    const performanceScore = 50 + (seed % 25);
    const securityScore = 60 + (seed % 30);
    const contentScore = 45 + (seed % 35);
    const overallScore = Math.round(
      seoScore * 0.3 +
        accessibilityScore * 0.25 +
        performanceScore * 0.2 +
        securityScore * 0.15 +
        contentScore * 0.1
    );

    const findings = [
      {
        category: "seo",
        severity: "high",
        title: "Missing meta description",
        detail:
          "No meta description tag found. Search engines may generate one from page content, which is often suboptimal.",
      },
      {
        category: "seo",
        severity: "medium",
        title: "Multiple H1 tags",
        detail:
          "Found 3 H1 tags on the page. Best practice is to use exactly one H1 per page for clear hierarchy.",
      },
      {
        category: "seo",
        severity: "low",
        title: "No structured data",
        detail:
          "No JSON-LD, Microdata, or RDFa structured data found. Adding schema markup can enhance search appearance.",
      },
      {
        category: "accessibility",
        severity: "critical",
        title: "Images missing alt text",
        detail:
          "7 of 12 images are missing alt attributes. Screen readers cannot describe these images to visually impaired users.",
      },
      {
        category: "accessibility",
        severity: "high",
        title: "Low color contrast",
        detail:
          "Estimated 4 color contrast issues. Text may be difficult to read for users with low vision.",
      },
      {
        category: "accessibility",
        severity: "medium",
        title: "Missing form labels",
        detail:
          "2 form inputs lack associated <label> elements. This makes forms harder to use with assistive technology.",
      },
      {
        category: "performance",
        severity: "medium",
        title: "Slow load indicators",
        detail:
          "Page shows medium load time indicators. Consider lazy-loading images and deferring non-critical scripts.",
      },
      {
        category: "security",
        severity: "low",
        title: "Mixed content detected",
        detail:
          "Some resources are loaded over HTTP on an HTTPS page. This can trigger browser warnings.",
      },
      {
        category: "content",
        severity: "medium",
        title: "Thin content",
        detail:
          "Only ~280 words found. Pages under 300 words often rank poorly in search results.",
      },
      {
        category: "seo",
        severity: "medium",
        title: "No Open Graph tags",
        detail:
          "No og: meta tags found. Social media shares will use auto-generated previews which are often poor.",
      },
    ];

    // Simulate a ~1.5s analysis delay
    setTimeout(() => {
      res.json({
        success: true,
        result: {
          overallScore,
          seoScore,
          accessibilityScore,
          performanceScore,
          securityScore,
          findings,
          pageTitle: `Page — ${new URL(normalizedUrl).hostname}`,
          analyzedUrl: normalizedUrl,
          wordCount: 180 + (seed % 400),
          loadTimeIndicator: seed % 3 === 0 ? "fast" : seed % 3 === 1 ? "medium" : "slow",
        },
      });
    }, 1500);
  });

  // ─────────────────────────────────────────────────────────
  // Phase 15: Revenue Attribution (mock)
  // ─────────────────────────────────────────────────────────

  // Shopify webhook mock (just ACKs)
  app.post("/api/webhooks/shopify/orders", (_req, res) => {
    res.json({ success: true, attributed: true, mock: true });
  });

  // ROI analytics mock
  app.get("/api/projects/:projectId/analytics/roi", (req, res) => {
    const projectId = req.params.projectId;

    const monthlyRevenue = [
      { month: "2025-10", revenue: 1240, orders: 8 },
      { month: "2025-11", revenue: 2890, orders: 14 },
      { month: "2025-12", revenue: 4510, orders: 22 },
      { month: "2026-01", revenue: 6780, orders: 31 },
      { month: "2026-02", revenue: 9420, orders: 43 },
      { month: "2026-03", revenue: 12850, orders: 58 },
    ];

    const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0);
    const totalOrders = monthlyRevenue.reduce((s, m) => s + m.orders, 0);
    // 30-day total = last month
    const last30Revenue = monthlyRevenue[monthlyRevenue.length - 1].revenue;
    const last30Orders = monthlyRevenue[monthlyRevenue.length - 1].orders;

    res.json({
      success: true,
      project_id: projectId,
      total_revenue: last30Revenue,
      total_orders: last30Orders,
      currency: "USD",
      monthly_revenue: monthlyRevenue,
      top_assets: [
        {
          asset_id: "asset_001",
          title: "The Complete Guide to Edge Computing for E-Commerce",
          slug: "edge-computing-ecommerce-guide",
          published_url: "https://sartelle-atelier.com/blog/edge-computing-ecommerce-guide",
          total_revenue: 4280,
          order_count: 19,
        },
        {
          asset_id: "asset_002",
          title: "Why Serverless SEO Is the Future of Online Retail",
          slug: "serverless-seo-future-retail",
          published_url: "https://sartelle-atelier.com/blog/serverless-seo-future-retail",
          total_revenue: 3150,
          order_count: 14,
        },
        {
          asset_id: "asset_003",
          title: "AI-Driven Content Strategy: A Fashion Brand’s Playbook",
          slug: "ai-content-strategy-fashion",
          published_url: "https://sartelle-atelier.com/blog/ai-content-strategy-fashion",
          total_revenue: 2640,
          order_count: 12,
        },
        {
          asset_id: "asset_004",
          title: "How Sartelle Atelier Uses Autonomous Agents for SEO",
          slug: "sartelle-autonomous-seo-agents",
          published_url: "https://sartelle-atelier.com/blog/sartelle-autonomous-seo-agents",
          total_revenue: 1890,
          order_count: 8,
        },
        {
          asset_id: "asset_005",
          title: "Zero-Click Optimization: Getting Cited by AI Search Engines",
          slug: "zero-click-ai-optimization",
          published_url: "https://sartelle-atelier.com/blog/zero-click-ai-optimization",
          total_revenue: 890,
          order_count: 5,
        },
      ],
    });
  });

  // ─────────────────────────────────────────────────────────
  // Phase 16: CRO Telemetry (mock)
  // ─────────────────────────────────────────────────────────

  // Telemetry ingest mock (just ACKs) — Phase 32: gated to autopilot+
  app.post("/api/telemetry/ingest", requireFeatureAccess("autopilot"), (_req: any, res: any) => {
    res.status(202).json({ success: true, accepted: true, mock: true });
  });

  // Telemetry summary mock — Phase 32: gated to autopilot+
  app.get("/api/projects/:projectId/telemetry/summary", requireFeatureAccess("autopilot"), (req: any, res: any) => {
    const projectId = req.params.projectId;

    const mockAssets = [
      {
        asset_id: "asset_001",
        title: "The Complete Guide to Edge Computing for E-Commerce",
        slug: "edge-computing-ecommerce-guide",
        published_url: "https://sartelle-atelier.com/blog/edge-computing-ecommerce-guide",
        total_views: 1420,
        avg_scroll_depth: 72.3,
        avg_dwell_time_seconds: 48,
        cta_clicks: 34,
        last_optimized_at: null,
        updated_at: "2026-03-13T18:00:00Z",
      },
      {
        asset_id: "asset_002",
        title: "Why Serverless SEO Is the Future of Online Retail",
        slug: "serverless-seo-future-retail",
        published_url: "https://sartelle-atelier.com/blog/serverless-seo-future-retail",
        total_views: 980,
        avg_scroll_depth: 58.1,
        avg_dwell_time_seconds: 35,
        cta_clicks: 18,
        last_optimized_at: null,
        updated_at: "2026-03-13T16:30:00Z",
      },
      {
        asset_id: "asset_003",
        title: "AI-Driven Content Strategy: A Fashion Brand's Playbook",
        slug: "ai-content-strategy-fashion",
        published_url: "https://sartelle-atelier.com/blog/ai-content-strategy-fashion",
        total_views: 650,
        avg_scroll_depth: 45.6,
        avg_dwell_time_seconds: 22,
        cta_clicks: 8,
        last_optimized_at: null,
        updated_at: "2026-03-12T20:00:00Z",
      },
      {
        asset_id: "asset_004",
        title: "How Sartelle Atelier Uses Autonomous Agents for SEO",
        slug: "sartelle-autonomous-seo-agents",
        published_url: "https://sartelle-atelier.com/blog/sartelle-autonomous-seo-agents",
        total_views: 310,
        avg_scroll_depth: 22.8,
        avg_dwell_time_seconds: 8,
        cta_clicks: 0,
        last_optimized_at: null,
        updated_at: "2026-03-11T12:00:00Z",
      },
      {
        asset_id: "asset_005",
        title: "Zero-Click Optimization: Getting Cited by AI Search Engines",
        slug: "zero-click-ai-optimization",
        published_url: "https://sartelle-atelier.com/blog/zero-click-ai-optimization",
        total_views: 145,
        avg_scroll_depth: 18.4,
        avg_dwell_time_seconds: 6,
        cta_clicks: 0,
        last_optimized_at: null,
        updated_at: "2026-03-10T09:00:00Z",
      },
    ];

    const totalViews = mockAssets.reduce((s, a) => s + a.total_views, 0);
    const totalClicks = mockAssets.reduce((s, a) => s + a.cta_clicks, 0);
    const avgScroll =
      mockAssets.reduce((s, a) => s + a.avg_scroll_depth, 0) / mockAssets.length;
    const avgDwell =
      mockAssets.reduce((s, a) => s + a.avg_dwell_time_seconds, 0) /
      mockAssets.length;

    // Flag underperforming assets (same thresholds as CRO engine)
    const underperforming = mockAssets.filter(
      (a) => a.total_views >= 100 && (a.avg_scroll_depth < 30 || a.avg_dwell_time_seconds < 10)
    );

    res.json({
      success: true,
      project_id: projectId,
      summary: {
        total_tracked_assets: mockAssets.length,
        total_views: totalViews,
        total_cta_clicks: totalClicks,
        avg_scroll_depth: Math.round(avgScroll * 10) / 10,
        avg_dwell_time_seconds: Math.round(avgDwell),
        underperforming_count: underperforming.length,
      },
      assets: mockAssets,
      underperforming,
    });
  });

  // ────────────────────────────────────────────
  // Phase 17: Social Drafts (Content Atomization)
  // ────────────────────────────────────────────
  app.get("/api/projects/:projectId/social/drafts", requireFeatureAccess("autopilot"), (_req: any, res: any) => {
    const projectId = _req.params.projectId;
    const statusFilter = (_req.query.status as string) || undefined;

    const mockDrafts = [
      {
        id: "sd_001",
        project_id: projectId,
        asset_id: "asset_301",
        article_title: "The Anatomy of a Sartelle Atelier Runway Collection",
        platform: "twitter",
        draft_content: JSON.stringify([
          "Every Sartelle Atelier collection tells a story woven through fabric, silhouette, and craftsmanship. Here's the anatomy of our latest runway show. 🧵",
          "1/ It starts with the atelier — 200+ hours of hand-stitching per piece. Our artisans in Milan use techniques passed down through three generations.",
          "2/ The colour palette is never arbitrary. This season's muted terracotta and ivory were drawn from Renaissance frescoes in the Uffizi Gallery.",
          "3/ Fabric sourcing alone takes 4 months. We work exclusively with mills in Como and Lyon that meet our sustainability certifications.",
          "4/ The final fitting is sacred. Each garment is adjusted to the model's body — no two pieces leave the atelier identical.",
          "Discover the full collection → [link]"
        ]),
        status: "AWAITING_APPROVAL",
        created_at: "2026-03-13T14:22:00Z",
        updated_at: "2026-03-13T14:22:00Z",
      },
      {
        id: "sd_002",
        project_id: projectId,
        asset_id: "asset_301",
        article_title: "The Anatomy of a Sartelle Atelier Runway Collection",
        platform: "linkedin",
        draft_content: "Behind every Sartelle Atelier collection is a 6-month journey from concept to runway.\n\nOur latest collection drew inspiration from Renaissance frescoes — translating centuries-old colour theory into modern haute couture.\n\nKey insights from our creative process:\n\n→ 200+ hours of hand-stitching per garment\n→ Fabrics sourced exclusively from certified mills in Como and Lyon\n→ A colour palette rooted in art history, not trend forecasting\n→ Zero-waste pattern cutting reducing material waste by 34%\n\nIn an industry obsessed with speed, we choose to slow down. Craftsmanship is not a luxury — it's a responsibility.\n\n#HauteCouture #SartelleAtelier #SustainableFashion #Craftsmanship",
        status: "AWAITING_APPROVAL",
        created_at: "2026-03-13T14:22:05Z",
        updated_at: "2026-03-13T14:22:05Z",
      },
      {
        id: "sd_003",
        project_id: projectId,
        asset_id: "asset_302",
        article_title: "Why Sartelle Atelier Rejects Fast-Fashion Timelines",
        platform: "twitter",
        draft_content: JSON.stringify([
          "Fast fashion produces 52 micro-seasons a year. At Sartelle Atelier, we produce two. Here's why that matters for the future of fashion. 👇",
          "1/ The average fast-fashion garment is worn 7 times before disposal. A Sartelle piece is designed to last 20+ years — both structurally and aesthetically.",
          "2/ Our made-to-order model means we produce 40% less inventory waste than traditional luxury houses.",
          "3/ Slowing down isn't anti-business. Our client retention rate is 87% — because investment pieces create lasting relationships.",
          "Quality is the ultimate sustainability. Read more → [link]"
        ]),
        status: "APPROVED",
        created_at: "2026-03-12T09:15:00Z",
        updated_at: "2026-03-12T16:42:00Z",
      },
      {
        id: "sd_004",
        project_id: projectId,
        asset_id: "asset_302",
        article_title: "Why Sartelle Atelier Rejects Fast-Fashion Timelines",
        platform: "linkedin",
        draft_content: "The fashion industry's obsession with speed is its greatest vulnerability.\n\nAt Sartelle Atelier, we made a deliberate choice: two collections per year, made to order, with zero compromise on craft.\n\nThe results speak for themselves:\n\n📊 87% client retention rate\n📉 40% less inventory waste vs. industry average\n👗 Average garment lifespan: 20+ years\n💰 Revenue per client up 23% YoY\n\nSlowing down isn't a sacrifice — it's a competitive advantage.\n\nFor brands considering a similar shift, the data is clear: customers reward intentionality.\n\n#LuxuryFashion #Sustainability #SlowFashion #BusinessStrategy",
        status: "REJECTED",
        created_at: "2026-03-12T09:15:05Z",
        updated_at: "2026-03-12T11:30:00Z",
      },
      {
        id: "sd_005",
        project_id: projectId,
        asset_id: "asset_303",
        article_title: "Sartelle Atelier x The Met: A Capsule in Cultural Memory",
        platform: "twitter",
        draft_content: JSON.stringify([
          "We're honoured to announce our collaboration with @metmuseum for a limited capsule collection inspired by the Costume Institute's archive. 🏛️✨",
          "1/ Five pieces. Five eras. Each garment reinterprets a silhouette from the Met's permanent collection — from 18th-century court dress to 1960s mod.",
          "2/ The fabrics were developed in partnership with @PremierVision, using bio-based fibres that mirror the drape and weight of historical textiles.",
          "3/ Every piece ships with a Certificate of Provenance linking it to the original archival garment that inspired it.",
          "Available by appointment only, starting April 1. Details → [link]"
        ]),
        status: "AWAITING_APPROVAL",
        created_at: "2026-03-14T00:05:00Z",
        updated_at: "2026-03-14T00:05:00Z",
      },
      {
        id: "sd_006",
        project_id: projectId,
        asset_id: "asset_303",
        article_title: "Sartelle Atelier x The Met: A Capsule in Cultural Memory",
        platform: "linkedin",
        draft_content: "Thrilled to unveil our most meaningful collaboration yet — Sartelle Atelier x The Metropolitan Museum of Art.\n\nThis capsule collection reimagines five iconic silhouettes from the Costume Institute's permanent archive, spanning three centuries of fashion history.\n\nWhat makes this project unique:\n\n→ Bio-based fabrics co-developed with Première Vision that replicate historical textile properties\n→ Each garment includes a Certificate of Provenance linking it to the archival original\n→ Available exclusively by appointment — no mass production\n→ A portion of proceeds supports the Costume Institute's conservation programme\n\nFashion is cultural memory. This collection is our way of honouring that legacy while pushing it forward.\n\nAppointments open April 1.\n\n#SartelleAtelier #TheMet #CostumeInstitute #FashionHistory #HauteCouture",
        status: "AWAITING_APPROVAL",
        created_at: "2026-03-14T00:05:05Z",
        updated_at: "2026-03-14T00:05:05Z",
      },
    ];

    let filtered = mockDrafts;
    if (statusFilter) {
      filtered = mockDrafts.filter(
        (d) => d.status.toUpperCase() === statusFilter.toUpperCase()
      );
    }

    res.json({
      success: true,
      project_id: projectId,
      drafts: filtered,
      total: filtered.length,
    });
  });

  app.patch("/api/projects/:projectId/social/drafts/:draftId", requireFeatureAccess("autopilot"), (req: any, res: any) => {
    const { draftId } = req.params;
    const { status, draft_content } = req.body as {
      status?: string;
      draft_content?: string;
    };

    const validStatuses = ["APPROVED", "REJECTED", "AWAITING_APPROVAL"];
    if (status && !validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    res.json({
      success: true,
      draft: {
        id: draftId,
        status: status?.toUpperCase() || "AWAITING_APPROVAL",
        draft_content: draft_content || "(unchanged)",
        updated_at: new Date().toISOString(),
      },
    });
  });

  // ────────────────────────────────────────────
  // Phase 18: Content Decay Manager
  // ────────────────────────────────────────────
  app.get("/api/projects/:projectId/decay/candidates", (_req, res) => {
    const projectId = _req.params.projectId;
    const statusFilter = (_req.query.status as string) || undefined;

    const mockCandidates = [
      {
        id: "asset_401",
        project_id: projectId,
        keyword: "luxury fashion supply chain",
        title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
        slug: "zero-waste-supply-chain",
        html_content: "<h1>How Sartelle Atelier Built a Zero-Waste Supply Chain</h1><p>In 2024, the fashion industry’s environmental impact reached a critical inflection point. Sartelle Atelier responded by redesigning its supply chain from the ground up.</p><h2>The Old Model</h2><p>Traditional luxury houses waste up to 30% of raw materials in the cutting room. Our pre-2024 process was no exception, with an average material utilization rate of 72%.</p><h2>Our Approach</h2><p>We partnered with AI-driven pattern optimisation firms to achieve 96% fabric utilization. Every off-cut is catalogued and repurposed into accessories or donated to fashion schools.</p><h2>Results</h2><p>Year-over-year waste reduction: 34%. Client satisfaction scores increased by 12% as conscious consumers rewarded our transparency.</p>",
        published_url: "https://sartelle-atelier.com/blog/zero-waste-supply-chain",
        created_at: "2025-06-15T10:00:00Z",
        updated_at: "2025-06-15T10:00:00Z",
        last_refreshed_at: null,
        refresh_draft_payload: "<h1>How Sartelle Atelier Built a Zero-Waste Supply Chain</h1><div class=\"refresh-update-banner\"><p><strong>\ud83d\udcdd Updated for 2026</strong> \u2014 This article has been refreshed with current data, trends, and best practices.</p></div><p>In 2026, sustainable supply chain management is no longer optional for luxury brands \u2014 it\u2019s a baseline expectation. Sartelle Atelier has been at the forefront of this movement since redesigning its supply chain in 2024.</p><h2>The Evolution: 2024\u20132026</h2><p>Our zero-waste programme has matured significantly. Material utilization now stands at 98.2%, up from 96% at launch. We\u2019ve introduced blockchain-verified provenance tracking for every metre of fabric.</p><h2>2026 Industry Trends</h2><ul><li><strong>Digital Product Passports (DPP):</strong> The EU\u2019s DPP regulation now requires full supply chain transparency for textiles sold in Europe.</li><li><strong>Regenerative Materials:</strong> Bio-based fabrics grown from agricultural waste are replacing traditional synthetics.</li><li><strong>AI Pattern Optimization:</strong> Next-generation algorithms achieve 99%+ fabric utilization through 3D nesting.</li></ul><h2>Results</h2><p>Cumulative waste reduction since 2024: 52%. Client retention among sustainability-conscious segments: 91%. Our supply chain model has been adopted by 14 other luxury houses as an industry benchmark.</p><h2>What This Means for Your Strategy</h2><p>Brands that haven\u2019t started their sustainability journey are running out of runway. The combination of regulatory pressure (EU DPP), consumer demand, and AI-powered optimisation tools makes 2026 the year to act.</p>",
        refresh_status: "AWAITING_APPROVAL",
        word_count: 287,
        seo_score: 72,
        age_days: 272,
      },
      {
        id: "asset_402",
        project_id: projectId,
        keyword: "haute couture pricing strategy",
        title: "The Psychology of Haute Couture Pricing",
        slug: "haute-couture-pricing-psychology",
        html_content: "<h1>The Psychology of Haute Couture Pricing</h1><p>Pricing in haute couture is an art form in itself. Unlike mass-market fashion, where price signals value for money, luxury pricing signals exclusivity, craftsmanship, and cultural capital.</p><h2>The Veblen Effect</h2><p>Thorstein Veblen’s theory of conspicuous consumption explains why raising prices in luxury can increase demand. Our data shows a 15% price increase in Q3 2024 led to a 22% increase in enquiries.</p><h2>Price Architecture</h2><p>We structure our pricing across three tiers: Atelier (bespoke, €15K+), Maison (ready-to-wear, €3K\u2013€8K), and Accessoires (€500\u2013€2K). Each tier serves a different psychological need.</p>",
        published_url: "https://sartelle-atelier.com/blog/haute-couture-pricing-psychology",
        created_at: "2025-05-22T08:30:00Z",
        updated_at: "2025-05-22T08:30:00Z",
        last_refreshed_at: null,
        refresh_draft_payload: "<h1>The Psychology of Haute Couture Pricing in 2026</h1><div class=\"refresh-update-banner\"><p><strong>\ud83d\udcdd Updated for 2026</strong> \u2014 New data on luxury consumer behaviour and pricing strategies.</p></div><p>Pricing in haute couture remains an art form, but the canvas has changed. The rise of AI-powered personal shoppers, digital showrooms, and cryptocurrency payments has added new dimensions to luxury price psychology.</p><h2>The Veblen Effect: 2026 Data</h2><p>Our latest analysis shows the Veblen effect remains strong but increasingly nuanced. A 15% price increase in Q3 2025 drove a 28% increase in enquiries \u2014 up from 22% in 2024. However, clients now expect transparent justification for premium pricing, including detailed craftsmanship breakdowns and provenance documentation.</p><h2>New Pricing Dynamics</h2><ul><li><strong>Digital Twin Pricing:</strong> Clients can now view their bespoke piece as a 3D digital twin before committing, reducing returns by 40%.</li><li><strong>Subscription Atelier:</strong> Our new membership tier (\u20ac2K/month) provides priority access to collections and exclusive styling sessions.</li><li><strong>Resale Value Guarantee:</strong> Certified pre-owned Sartelle pieces retain 70\u201380% of their original value, reinforcing the investment narrative.</li></ul><h2>Updated Price Architecture</h2><p>Our four-tier model now includes: Atelier Priv\u00e9 (bespoke, \u20ac20K+), Atelier (semi-bespoke, \u20ac10K\u2013\u20ac18K), Maison (ready-to-wear, \u20ac4K\u2013\u20ac9K), and Accessoires (\u20ac600\u2013\u20ac2.5K).</p>",
        refresh_status: "AWAITING_APPROVAL",
        word_count: 198,
        seo_score: 68,
        age_days: 296,
      },
      {
        id: "asset_403",
        project_id: projectId,
        keyword: "fashion week digital strategy",
        title: "Sartelle Atelier’s Digital-First Fashion Week Strategy",
        slug: "digital-first-fashion-week",
        html_content: "<h1>Sartelle Atelier’s Digital-First Fashion Week Strategy</h1><p>Fashion Week 2024 marked a turning point. For the first time, our digital audience outnumbered physical attendees by 50:1. Here’s how we adapted.</p><h2>Livestream Architecture</h2><p>We deployed a multi-camera, 4K livestream with real-time AR overlays showing fabric details and construction techniques.</p><h2>Social Commerce</h2><p>Shoppable pins on Instagram and TikTok during the show drove €340K in same-day orders \u2014 a 3x increase over our previous season.</p>",
        published_url: "https://sartelle-atelier.com/blog/digital-first-fashion-week",
        created_at: "2025-03-10T14:00:00Z",
        updated_at: "2025-03-10T14:00:00Z",
        last_refreshed_at: null,
        refresh_draft_payload: null,
        refresh_status: null,
        word_count: 152,
        seo_score: 65,
        age_days: 369,
      },
      {
        id: "asset_404",
        project_id: projectId,
        keyword: "sustainable luxury materials",
        title: "The Future of Sustainable Luxury Materials",
        slug: "sustainable-luxury-materials-future",
        html_content: "<h1>The Future of Sustainable Luxury Materials</h1><p>The next decade of luxury fashion will be defined by material innovation. From lab-grown silk to mycelium leather, the alternatives are no longer compromises \u2014 they’re upgrades.</p><h2>Lab-Grown Silk</h2><p>Companies like Bolt Threads have achieved silk proteins indistinguishable from traditional mulberry silk, at 60% lower environmental impact.</p>",
        published_url: "https://sartelle-atelier.com/blog/sustainable-luxury-materials-future",
        created_at: "2025-04-18T11:00:00Z",
        updated_at: "2025-09-20T15:00:00Z",
        last_refreshed_at: "2025-09-20T15:00:00Z",
        refresh_draft_payload: null,
        refresh_status: "APPROVED",
        word_count: 124,
        seo_score: 78,
        age_days: 175,
      },
    ];

    let filtered = mockCandidates;
    if (statusFilter) {
      filtered = mockCandidates.filter(
        (c) => c.refresh_status?.toUpperCase() === statusFilter.toUpperCase()
      );
    }

    res.json({
      success: true,
      project_id: projectId,
      candidates: filtered,
      total: filtered.length,
    });
  });

  app.post("/api/projects/:projectId/decay/:assetId/approve", (req, res) => {
    const { assetId } = req.params;
    res.json({
      success: true,
      asset_id: assetId,
      status: "APPROVED",
      message: "Refresh approved and content updated. CMS push initiated.",
    });
  });

  app.post("/api/projects/:projectId/decay/:assetId/discard", (req, res) => {
    const { assetId } = req.params;
    res.json({
      success: true,
      asset_id: assetId,
      status: "DISCARDED",
    });
  });

  // ────────────────────────────────────────────
  // Phase 19: Auth Mock Routes
  // ────────────────────────────────────────────

  // Phase 32: Tier hierarchy for feature gating
  const TIER_HIERARCHY: Record<string, number> = { free: 0, starter: 1, autopilot: 2, enterprise: 3 };
  const TIER_TASK_LIMITS: Record<string, number> = { free: 10, starter: 100, autopilot: 500, enterprise: -1 };

  const MOCK_USERS: Record<string, { id: string; email: string; password: string; role: string; plan: string; plan_tier: string; tasks_used_this_month: number; task_limit: number; status: string; created_at: string; [key: string]: any }> = {
    "demo@swarme.io": { id: "usr_001", email: "demo@swarme.io", password: "swarme2026", role: "superadmin", plan: "enterprise", plan_tier: "enterprise", tasks_used_this_month: 42, task_limit: -1, status: "active", created_at: "2026-01-15T00:00:00" },
    "alice@example.com": { id: "usr_002", email: "alice@example.com", password: "password123", role: "user", plan: "autopilot", plan_tier: "autopilot", tasks_used_this_month: 87, task_limit: 500, status: "active", created_at: "2026-02-01T00:00:00" },
    "bob@startup.io": { id: "usr_003", email: "bob@startup.io", password: "password123", role: "user", plan: "starter", plan_tier: "starter", tasks_used_this_month: 94, task_limit: 100, status: "active", created_at: "2026-02-20T00:00:00" },
    "charlie@agency.co": { id: "usr_004", email: "charlie@agency.co", password: "password123", role: "user", plan: "starter", plan_tier: "starter", tasks_used_this_month: 12, task_limit: 100, status: "suspended", created_at: "2026-03-01T00:00:00" },
    "diana@brand.com": { id: "usr_005", email: "diana@brand.com", password: "password123", role: "user", plan: "enterprise", plan_tier: "enterprise", tasks_used_this_month: 210, task_limit: -1, status: "active", created_at: "2026-03-05T00:00:00" },
  };

  // Phase 32: Helper — extract user from Bearer token
  function getUserFromToken(req: any): (typeof MOCK_USERS)[string] | null {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.substring(7);
    const match = token.match(/mock-jwt-(usr_[^-]+)/);
    if (!match) return null;
    return Object.values(MOCK_USERS).find((u) => u.id === match[1]) || null;
  }

  // Phase 32: Feature gating middleware
  function requireFeatureAccess(requiredTier: string, requiresTaskLimit = false) {
    return (req: any, res: any, next: any) => {
      const user = getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const userLevel = TIER_HIERARCHY[user.plan_tier] ?? 0;
      const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 0;
      if (userLevel < requiredLevel) {
        const featureNames: Record<string, string> = {
          autopilot: "CRO Telemetry & Social Atomization",
          enterprise: "Enterprise Features",
        };
        return res.status(402).json({
          success: false,
          error: "Upgrade required",
          feature: featureNames[requiredTier] || requiredTier,
          current_tier: user.plan_tier,
          required_tier: requiredTier,
        });
      }
      if (requiresTaskLimit && user.task_limit !== -1) {
        if (user.tasks_used_this_month >= user.task_limit) {
          return res.status(429).json({
            success: false,
            error: "Monthly task limit reached",
            tasks_used: user.tasks_used_this_month,
            task_limit: user.task_limit,
            upgrade_url: "/pricing",
          });
        }
        // Increment task count on successful pass
        user.tasks_used_this_month += 1;
      }
      (req as any).tierUser = user;
      next();
    };
  }

  // POST /api/auth/register
  app.post("/api/auth/register", (req, res) => {
    const { email, password, turnstileToken: _turnstile, referralId, accepted_terms } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }
    // Phase 28: Enforce terms acceptance
    if (!accepted_terms) {
      return res.status(400).json({ success: false, error: "You must accept the Terms of Service and Privacy Policy" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (MOCK_USERS[normalizedEmail]) {
      return res.status(409).json({ success: false, error: "An account with this email already exists" });
    }
    const userId = `usr_${Date.now()}`;
    const termsAcceptedAt = new Date().toISOString();
    MOCK_USERS[normalizedEmail] = { id: userId, email: normalizedEmail, password, role: "user", plan: "free", plan_tier: "free", tasks_used_this_month: 0, task_limit: 10, status: "active", created_at: new Date().toISOString(), terms_accepted_at: termsAcceptedAt };

    // Phase 24: Log referral ID (in production this would attach to Stripe Customer metadata)
    if (referralId) {
      console.log(`[Mock] Affiliate referral captured for ${normalizedEmail}: ${referralId}`);
    }
    console.log(`[Mock] Terms accepted at ${termsAcceptedAt} for ${normalizedEmail}`);

    res.json({
      success: true,
      token: `mock-jwt-${userId}-${Date.now()}`,
      user: { id: userId, email: normalizedEmail, role: "user", plan: "free", plan_tier: "free", tasks_used_this_month: 0, task_limit: 10 },
    });
  });

  // POST /api/auth/login
  app.post("/api/auth/login", (req, res) => {
    const { email, password, turnstileToken: _turnstile } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const user = MOCK_USERS[normalizedEmail];
    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, error: "Invalid email or password" });
    }
    res.json({
      success: true,
      token: `mock-jwt-${user.id}-${Date.now()}`,
      user: { id: user.id, email: user.email, role: user.role, plan: user.plan, plan_tier: user.plan_tier, tasks_used_this_month: user.tasks_used_this_month, task_limit: user.task_limit },
    });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    // For mock: extract user ID from token
    const token = authHeader.substring(7);
    const userIdMatch = token.match(/mock-jwt-(usr_[^-]+)/);
    if (!userIdMatch) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
    const userId = userIdMatch[1];
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }
    const isImpersonating = token.includes("-impersonate");
    res.json({ success: true, user: { id: user.id, email: user.email, role: user.role, plan: user.plan, plan_tier: user.plan_tier, tasks_used_this_month: user.tasks_used_this_month, task_limit: user.task_limit, ...(isImpersonating ? { is_impersonating: true } : {}) } });
  });

  // Phase 32: GET /api/user/tier — returns current user's tier info
  app.get("/api/user/tier", (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });
    res.json({
      success: true,
      plan_tier: user.plan_tier,
      tasks_used_this_month: user.tasks_used_this_month,
      task_limit: user.task_limit,
    });
  });

  // ────────────────────────────────────────────
  // Phase 20: Notification Preferences Mock Routes
  // ────────────────────────────────────────────

  // In-memory preferences store keyed by userId
  const mockPreferences: Record<string, { phone_number: string; notify_email: boolean; notify_sms: boolean }> = {
    usr_001: { phone_number: "", notify_email: true, notify_sms: false },
  };

  /** Extract userId from mock JWT token in Authorization header */
  function extractMockUserId(req: any): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.substring(7);
    const match = token.match(/mock-jwt-(usr_[^-]+)/);
    return match ? match[1] : null;
  }

  // GET /api/user/preferences
  app.get("/api/user/preferences", (req, res) => {
    const userId = extractMockUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const prefs = mockPreferences[userId] || { phone_number: "", notify_email: true, notify_sms: false };
    res.json({ success: true, preferences: prefs });
  });

  // POST /api/user/preferences
  app.post("/api/user/preferences", (req, res) => {
    const userId = extractMockUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const body = req.body || {};
    const existing = mockPreferences[userId] || { phone_number: "", notify_email: true, notify_sms: false };

    if (typeof body.phone_number === "string") existing.phone_number = body.phone_number.trim();
    if (typeof body.notify_email === "boolean") existing.notify_email = body.notify_email;
    if (typeof body.notify_sms === "boolean") existing.notify_sms = body.notify_sms;

    mockPreferences[userId] = existing;
    res.json({ success: true, preferences: existing });
  });

  // ────────────────────────────────────────────
  // Phase 21: Superadmin Mock Routes
  // ────────────────────────────────────────────

  /** Mock infrastructure vault store */
  const mockInfraKeys: Record<string, Record<string, string>> = {
    ai_models: { OPENAI_API_KEY: "sk-mock-openai-xxxx", ANTHROPIC_API_KEY: "", PERPLEXITY_API_KEY: "pplx-mock-xxxx" },
    communications: { RESEND_API_KEY: "re_mock_xxxx", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "" },
    billing: { STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" },
    security: { TURNSTILE_SECRET_KEY: "", SENTRY_DSN: "" },
    support: { SUPPORT_APP_ID: "" },
    compliance: { COOKIE_CONSENT_ID: "" },
    affiliates: { REWARDFUL_API_KEY: "" },
    outreach: { HUNTER_API_KEY: "hunter-mock-xxxx" },
  };

  // Phase 23: Public Config (mock) — no auth needed
  app.get("/api/public/config", (_req, res) => {
    res.json({
      success: true,
      config: {
        supportAppId: mockInfraKeys.support?.SUPPORT_APP_ID || "",
        cookieConsentId: mockInfraKeys.compliance?.COOKIE_CONSENT_ID || "",
        rewardfulId: mockInfraKeys.affiliates?.REWARDFUL_API_KEY ? "active" : "",
      },
    });
  });

  /** Check superadmin role for mock routes */
  function requireMockSuperadmin(req: any, res: any): string | null {
    const userId = extractMockUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return null;
    }
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user || user.role !== "superadmin") {
      res.status(403).json({ success: false, error: "Superadmin access required" });
      return null;
    }
    return userId;
  }

  // GET /api/admin/users
  app.get("/api/admin/users", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const users = Object.values(MOCK_USERS).map(({ password, ...u }) => u);
    res.json({ success: true, users });
  });

  // POST /api/admin/users/:userId/reset-password
  app.post("/api/admin/users/:userId/reset-password", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    const tempPass = `tmp_${Date.now().toString(36)}`;
    user.password = tempPass;
    res.json({ success: true, temporaryPassword: tempPass });
  });

  // POST /api/admin/users/:userId/revoke
  app.post("/api/admin/users/:userId/revoke", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    user.status = "suspended";
    res.json({ success: true });
  });

  // ── Phase 36: Superadmin User Override API ──────────────────────

  // Mock brand context data per user
  const mockBrandContexts: Record<string, { target_audience: string; core_goals: string; tone_of_voice: string; competitors: string; business_model: string }> = {
    usr_002: { target_audience: "E-commerce managers at mid-size DTC brands", core_goals: "Increase organic traffic by 40% in Q2", tone_of_voice: "Professional, data-driven, approachable", competitors: "Ahrefs, SEMrush, Surfer SEO", business_model: "e-commerce" },
    usr_003: { target_audience: "SaaS startup founders bootstrapping growth", core_goals: "Rank for 50 high-intent keywords by Q3", tone_of_voice: "Casual, founder-friendly, actionable", competitors: "Clearscope, MarketMuse, Frase", business_model: "lead_gen" },
    usr_005: { target_audience: "Enterprise marketing directors at Fortune 500", core_goals: "Dominate AI-related search verticals", tone_of_voice: "Authoritative, polished, thought-leadership", competitors: "Conductor, BrightEdge, seoClarity", business_model: "publisher" },
  };

  // Mock recent agent tasks per user
  const mockUserTasks: Record<string, any[]> = {
    usr_002: [
      { id: "t_201", agent_type: "writer", action: "draft_article", status: "Completed", task_description: "Draft: '10 DTC SEO Strategies for 2026'", created_at: "2026-03-14T10:00:00" },
      { id: "t_202", agent_type: "auditor", action: "site_audit", status: "Completed", task_description: "Full technical audit for store.alice.com", created_at: "2026-03-13T08:00:00" },
      { id: "t_203", agent_type: "outreach", action: "link_building", status: "Running", task_description: "Outreach to 15 guest post targets", created_at: "2026-03-12T14:00:00" },
      { id: "t_204", agent_type: "visibility", action: "visibility_check", status: "Completed", task_description: "AI Visibility scan across 8 engines", created_at: "2026-03-11T09:00:00" },
      { id: "t_205", agent_type: "cro", action: "heatmap_analysis", status: "Completed", task_description: "CRO heatmap analysis on /pricing", created_at: "2026-03-10T16:00:00" },
    ],
    usr_003: [
      { id: "t_301", agent_type: "researcher", action: "keyword_research", status: "Completed", task_description: "Research long-tail SaaS keywords", created_at: "2026-03-14T11:00:00" },
      { id: "t_302", agent_type: "writer", action: "draft_article", status: "Awaiting_Approval", task_description: "Draft: 'How to Bootstrap SEO'", created_at: "2026-03-13T09:00:00" },
    ],
    usr_005: [
      { id: "t_501", agent_type: "orchestrator", action: "full_pipeline", status: "Completed", task_description: "Full content pipeline for 'Edge AI in Enterprise'", created_at: "2026-03-14T07:00:00" },
      { id: "t_502", agent_type: "publisher", action: "cms_publish", status: "Completed", task_description: "Published to Shopify blog", created_at: "2026-03-13T15:00:00" },
      { id: "t_511", agent_type: "media", action: "media_generation", status: "Completed", task_description: "[dalle3_r2] Generated 3/4 images for 'Edge AI in Enterprise' — 1 skipped (content policy)", created_at: "2026-03-14T06:55:00" },
      { id: "t_503", agent_type: "visibility", action: "visibility_check", status: "Completed", task_description: "AI Visibility scan — 12 engines", created_at: "2026-03-12T10:00:00" },
      { id: "t_504", agent_type: "writer", action: "draft_article", status: "Running", task_description: "Draft: 'Enterprise SEO Playbook 2026'", created_at: "2026-03-11T13:00:00" },
      { id: "t_505", agent_type: "cro", action: "ab_test", status: "Completed", task_description: "A/B test hero CTA on /solutions", created_at: "2026-03-10T08:00:00" },
      { id: "t_506", agent_type: "auditor", action: "site_audit", status: "Completed", task_description: "Technical audit for brand.com", created_at: "2026-03-09T14:00:00" },
      { id: "t_507", agent_type: "outreach", action: "link_building", status: "Completed", task_description: "Enterprise link-building campaign", created_at: "2026-03-08T11:00:00" },
      { id: "t_508", agent_type: "researcher", action: "competitor_analysis", status: "Completed", task_description: "Competitor gap analysis vs BrightEdge", created_at: "2026-03-07T09:00:00" },
      { id: "t_509", agent_type: "writer", action: "draft_article", status: "Completed", task_description: "Draft: 'Why Edge-Native SEO Wins'", created_at: "2026-03-06T10:00:00" },
      { id: "t_510", agent_type: "publisher", action: "cms_publish", status: "Completed", task_description: "Published to /blog/edge-seo", created_at: "2026-03-05T16:00:00" },
    ],
  };

  // Mock GSC summary data per user
  const mockGscSummary: Record<string, { total_clicks: number; total_impressions: number; avg_ctr: number; avg_position: number; mini_series: { date: string; clicks: number }[] }> = {
    usr_002: {
      total_clicks: 12450, total_impressions: 189000, avg_ctr: 6.59, avg_position: 8.2,
      mini_series: [
        { date: "2026-03-09", clicks: 380 }, { date: "2026-03-10", clicks: 420 },
        { date: "2026-03-11", clicks: 395 }, { date: "2026-03-12", clicks: 510 },
        { date: "2026-03-13", clicks: 475 }, { date: "2026-03-14", clicks: 530 },
        { date: "2026-03-15", clicks: 490 },
      ],
    },
    usr_003: {
      total_clicks: 3200, total_impressions: 67000, avg_ctr: 4.78, avg_position: 14.5,
      mini_series: [
        { date: "2026-03-09", clicks: 85 }, { date: "2026-03-10", clicks: 102 },
        { date: "2026-03-11", clicks: 78 }, { date: "2026-03-12", clicks: 120 },
        { date: "2026-03-13", clicks: 95 }, { date: "2026-03-14", clicks: 110 },
        { date: "2026-03-15", clicks: 88 },
      ],
    },
    usr_005: {
      total_clicks: 48200, total_impressions: 520000, avg_ctr: 9.27, avg_position: 4.1,
      mini_series: [
        { date: "2026-03-09", clicks: 1350 }, { date: "2026-03-10", clicks: 1520 },
        { date: "2026-03-11", clicks: 1400 }, { date: "2026-03-12", clicks: 1680 },
        { date: "2026-03-13", clicks: 1590 }, { date: "2026-03-14", clicks: 1720 },
        { date: "2026-03-15", clicks: 1650 },
      ],
    },
  };

  // Mock revenue per user
  const mockUserRevenue: Record<string, number> = {
    usr_001: 0, usr_002: 14520, usr_003: 2870, usr_004: 890, usr_005: 87400,
  };

  // GET /api/admin/users/:userId — deep-dive user profile
  app.get("/api/admin/users/:userId", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    const { password, ...profile } = user;
    const recentTasks = mockUserTasks[userId] || [];
    const gscSummary = mockGscSummary[userId] || { total_clicks: 0, total_impressions: 0, avg_ctr: 0, avg_position: 0, mini_series: [] };
    const brandContext = mockBrandContexts[userId] || null;
    const totalRevenue = mockUserRevenue[userId] || 0;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "user.view", target: userId, metadata: null, created_at: new Date().toISOString() });
    res.json({
      success: true,
      user: {
        ...profile,
        total_revenue: totalRevenue,
        recent_tasks: recentTasks.slice(0, 10),
        gsc_summary: gscSummary,
        brand_context: brandContext,
      },
    });
  });

  // POST /api/admin/users — manual provisioning
  app.post("/api/admin/users", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { email, name, plan_tier } = req.body || {};
    if (!email || !plan_tier) return res.status(400).json({ success: false, error: "email and plan_tier required" });
    if (MOCK_USERS[email]) return res.status(409).json({ success: false, error: "User already exists" });
    const newId = `usr_${Date.now().toString(36)}`;
    const tempPass = `tmp_${Date.now().toString(36)}`;
    const limitMap: Record<string, number> = { free: 10, starter: 100, autopilot: 500, enterprise: -1 };
    MOCK_USERS[email] = {
      id: newId, email, password: tempPass, role: "user", plan: plan_tier, plan_tier,
      tasks_used_this_month: 0, task_limit: limitMap[plan_tier] ?? 10,
      status: "active", created_at: new Date().toISOString(), name: name || "",
    };
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "user.provision", target: newId, metadata: JSON.stringify({ email, plan_tier }), created_at: new Date().toISOString() });
    res.json({ success: true, user_id: newId, temporary_password: tempPass });
  });

  // PATCH /api/admin/users/:userId/plan — manual plan override
  app.patch("/api/admin/users/:userId/plan", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const { plan_tier } = req.body || {};
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!plan_tier) return res.status(400).json({ success: false, error: "plan_tier required" });
    const limitMap: Record<string, number> = { free: 10, starter: 100, autopilot: 500, enterprise: -1 };
    const oldPlan = user.plan_tier;
    user.plan = plan_tier;
    user.plan_tier = plan_tier;
    user.task_limit = limitMap[plan_tier] ?? 10;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "user.plan_override", target: userId, metadata: JSON.stringify({ old: oldPlan, new: plan_tier }), created_at: new Date().toISOString() });
    res.json({ success: true, plan_tier, task_limit: user.task_limit });
  });

  // PATCH /api/admin/users/:userId/status — ban/activate
  app.patch("/api/admin/users/:userId/status", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const { status } = req.body || {};
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!status || !["active", "banned", "suspended"].includes(status)) {
      return res.status(400).json({ success: false, error: "Valid status required (active, banned, suspended)" });
    }
    user.status = status;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: `user.status_${status}`, target: userId, metadata: null, created_at: new Date().toISOString() });
    res.json({ success: true, status });
  });

  // POST /api/admin/users/:userId/impersonate — generate impersonation token
  app.post("/api/admin/users/:userId/impersonate", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { userId } = req.params;
    const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    // Mock impersonation token: includes user id + impersonation flag
    const impersonationToken = `mock-jwt-${userId}-impersonate`;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "user.impersonate", target: userId, metadata: JSON.stringify({ email: user.email }), created_at: new Date().toISOString() });
    res.json({
      success: true,
      token: impersonationToken,
      user: { id: user.id, email: user.email, role: user.role, plan: user.plan, plan_tier: user.plan_tier, tasks_used_this_month: user.tasks_used_this_month, task_limit: user.task_limit, is_impersonating: true },
      expires_in: 3600,
    });
  });

  // Update getUserFromToken to handle impersonation tokens
  // (handled by extending the existing token matcher below)

  // GET /api/admin/infrastructure/keys
  app.get("/api/admin/infrastructure/keys", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, keys: mockInfraKeys });
  });

  // POST /api/admin/infrastructure/keys
  app.post("/api/admin/infrastructure/keys", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { category, key_name, value } = req.body || {};
    if (!category || !key_name) return res.status(400).json({ success: false, error: "category and key_name required" });
    if (!mockInfraKeys[category]) mockInfraKeys[category] = {};
    mockInfraKeys[category][key_name] = value || "";
    res.json({ success: true });
  });

  // ── Phase 29: Global Impact Metrics ──

  app.get("/api/admin/metrics/global", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;

    // Generate realistic 30-day time-series
    const timeSeries: { date: string; tasks: number; apiCost: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      // Realistic daily task volume: base 40-80, weekday boost, some variance
      const dayOfWeek = d.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const base = isWeekend ? 28 : 58;
      const variance = Math.floor(Math.random() * 30) - 10;
      const tasks = Math.max(12, base + variance);
      timeSeries.push({
        date: dateStr,
        tasks,
        apiCost: parseFloat((tasks * 0.02).toFixed(2)),
      });
    }

    const totalTasksFromSeries = timeSeries.reduce((s, d) => s + d.tasks, 0);

    res.json({
      success: true,
      metrics: {
        totalClientRevenue: 284750.42,
        totalTasksExecuted: 15847,
        totalHoursSaved: 15847 * 4,
        activeMRR: 12650,
        totalAdaFixes: 743,
        timeSeries,
        failingIntegrations: [
          { integration: "shopify_webhook", failures: 23, lastFailure: "2026-03-15T18:42:00Z", errorType: "429 Rate Limited" },
          { integration: "woocommerce_api", failures: 11, lastFailure: "2026-03-15T14:10:00Z", errorType: "SSL Handshake Timeout" },
          { integration: "stripe_webhook", failures: 7, lastFailure: "2026-03-14T22:05:00Z", errorType: "Signature Mismatch" },
          { integration: "resend_email", failures: 4, lastFailure: "2026-03-15T09:30:00Z", errorType: "Domain Not Verified" },
          { integration: "twilio_sms", failures: 2, lastFailure: "2026-03-13T16:45:00Z", errorType: "Invalid Phone Format" },
        ],
      },
    });
  });

  // ── Phase 26: AI Manager mock routes ──

  const mockRoadmapItems: any[] = [
    {
      id: "roadmap_mock_001",
      project_id: "proj_001",
      title: "Create pillar content for 'edge computing SEO'",
      description: "Generate a 3,000+ word definitive guide targeting the high-volume keyword cluster around edge computing and SEO automation. Include original research data points.",
      priority: "High",
      status: "Suggested",
      action_payload: JSON.stringify({ type: "content_generation", keyword: "edge computing seo", word_count: 3000 }),
      created_at: "2026-03-15T19:00:00",
      updated_at: "2026-03-15T19:00:00",
    },
    {
      id: "roadmap_mock_002",
      project_id: "proj_001",
      title: "Implement FAQ schema on top 10 product pages",
      description: "Add FAQ structured data markup to the 10 highest-traffic product pages. Each page should have 3-5 relevant FAQ entries to capture featured snippet positions.",
      priority: "High",
      status: "Suggested",
      action_payload: JSON.stringify({ type: "schema_markup", pages: 10 }),
      created_at: "2026-03-15T19:01:00",
      updated_at: "2026-03-15T19:01:00",
    },
    {
      id: "roadmap_mock_003",
      project_id: "proj_001",
      title: "Launch digital PR campaign for backlink acquisition",
      description: "Identify 20 high-authority industry publications and pitch data-driven story angles. Target: 5-10 dofollow backlinks within 60 days.",
      priority: "Medium",
      status: "Approved",
      action_payload: JSON.stringify({ type: "link_building", target_links: 10 }),
      created_at: "2026-03-14T15:00:00",
      updated_at: "2026-03-15T10:00:00",
    },
    {
      id: "roadmap_mock_004",
      project_id: "proj_001",
      title: "Optimize page load speed on /pricing",
      description: "Reduce LCP to under 2.5s by compressing hero images, deferring non-critical JS, and enabling edge caching. Current LCP: 4.1s.",
      priority: "Medium",
      status: "Completed",
      action_payload: JSON.stringify({ type: "page_optimization", target_url: "/pricing" }),
      created_at: "2026-03-12T12:00:00",
      updated_at: "2026-03-14T08:00:00",
    },
  ];

  const mockBrandContext: any = {
    proj_001: {
      project_id: "proj_001",
      target_audience: "E-commerce founders and marketing teams at DTC brands doing $1M-$50M ARR",
      core_goals: "2x organic traffic in 6 months, 30% increase in revenue from SEO channel, dominate AI visibility for core keywords",
      tone_of_voice: "Authoritative but approachable. Data-driven. Avoids hype.",
      competitors: "Ahrefs, Semrush, Surfer SEO, Clearscope",
      business_model: "e-commerce",
      last_updated: "2026-03-15T18:00:00",
    },
  };

  // Phase 43: Conversion config mapping for mock A/B test responses
  const CONVERSION_CONFIGS: Record<string, { label: string; events: string[]; primaryKpi: string; secondaryKpis: string[]; description: string }> = {
    "e-commerce": {
      label: "Add to Cart / Checkout",
      events: ["add_to_cart", "begin_checkout", "purchase"],
      primaryKpi: "add_to_cart_rate",
      secondaryKpis: ["checkout_rate", "revenue_per_session", "cart_abandonment_rate"],
      description: "Tracks product add-to-cart actions and checkout funnel progression.",
    },
    lead_gen: {
      label: "Lead Capture",
      events: ["form_submit", "calendar_click", "email_capture", "phone_click"],
      primaryKpi: "lead_capture_rate",
      secondaryKpis: ["form_start_rate", "form_completion_rate", "calendar_booking_rate"],
      description: "Tracks form submissions, calendar booking clicks, and email signups.",
    },
    affiliate: {
      label: "Affiliate Click-Through",
      events: ["affiliate_click", "outbound_click", "comparison_click"],
      primaryKpi: "affiliate_ctr",
      secondaryKpis: ["outbound_click_rate", "comparison_engagement", "revenue_per_click"],
      description: "Tracks outbound clicks to affiliate partner domains.",
    },
    publisher: {
      label: "Engagement Depth",
      events: ["scroll_75", "dwell_60s", "internal_click", "next_article"],
      primaryKpi: "engagement_depth_rate",
      secondaryKpis: ["avg_dwell_time", "scroll_depth", "pages_per_session", "bounce_rate"],
      description: "Tracks deep engagement: 75%+ scroll depth, 60s+ dwell time, and internal navigation.",
    },
    default: {
      label: "CTA Click",
      events: ["cta_click"],
      primaryKpi: "cta_click_rate",
      secondaryKpis: ["scroll_depth", "dwell_time"],
      description: "Generic CTA engagement tracking.",
    },
  };

  // POST /api/manager/chat
  app.post("/api/manager/chat", (req, res) => {
    const { project_id, messages } = req.body || {};
    if (!project_id || !messages) {
      return res.status(400).json({ success: false, error: "project_id and messages required" });
    }

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userText = lastUserMsg?.content?.toLowerCase() || "";

    let reply = "";
    let roadmapItemsAdded = 0;
    let brandContextUpdated = false;

    if (userText.includes("http") || userText.includes("www.") || userText.includes(".com")) {
      reply = `I've completed the initial analysis of your site. Here's what I found:\n\n**Strengths:**\n- Clean page structure with good mobile responsiveness\n- SSL certificate active, no mixed content issues\n- Well-organized content structure\n\n**Opportunities:**\n- Missing blog content strategy — no long-form content targeting buyer keywords\n- FAQ schema markup absent on key pages (missing featured snippet opportunities)\n- Product/service descriptions are thin (avg 80 words) — should be 300+ with semantic keywords\n- No internal linking strategy between related pages\n- Image alt text missing on 40% of images\n\nBefore we set goals, I need to understand your business model. **How does this website generate value?**\n\n- 💰 **E-commerce Sales** — online store selling products directly\n- 🎯 **B2B Lead Generation** — capturing leads via forms, calendars, email signups\n- 🔗 **Affiliate Clicks** — earning commissions through outbound affiliate links\n- 📰 **Ad Revenue / Publishing** — monetizing through dwell time, pageviews, and ad impressions`;
      brandContextUpdated = false;
    } else if (userText.includes("e-commerce") || userText.includes("ecommerce") || userText.includes("store") || userText.includes("products")) {
      reply = `Got it — **E-commerce Sales**. I've saved this to my memory. This changes everything about how I'll optimize your site.\n\nFor e-commerce, the Swarm will focus on:\n- 🛒 **Add to Cart** rate optimization (CTA placement, urgency triggers, sticky cart)\n- 💳 **Checkout funnel** friction reduction (fewer form fields, trust badges, guest checkout)\n- 📊 **Product page** conversion architecture (reviews above fold, size guides, shipping info)\n- 🎯 A/B tests will measure **add-to-cart rate** as the winner metric\n\nNow tell me about your 6-month goals. What does success look like — revenue growth, traffic, or AI visibility?`;
      brandContextUpdated = true;
      mockBrandContext.proj_001.business_model = "e-commerce";
    } else if (userText.includes("lead") || userText.includes("b2b") || userText.includes("form") || userText.includes("calendar")) {
      reply = `Got it — **B2B Lead Generation**. I've saved this to my memory. This fundamentally shapes our optimization strategy.\n\nFor lead gen, the Swarm will focus on:\n- 📝 **Form submission** rate optimization (fewer fields, multi-step forms, social proof)\n- 📅 **Calendar booking** click optimization (embedded scheduling, "Book a demo" CTAs)\n- 📧 **Email capture** conversion (lead magnets, exit-intent, newsletter signups)\n- 🎯 A/B tests will measure **lead capture rate** as the winner metric\n\nNow tell me about your 6-month goals. What does success look like — MQL volume, demo bookings, or pipeline value?`;
      brandContextUpdated = true;
      mockBrandContext.proj_001.business_model = "lead_gen";
    } else if (userText.includes("affiliate") || userText.includes("commission") || userText.includes("partner")) {
      reply = `Got it — **Affiliate Revenue**. I've saved this to my memory. This completely reframes our approach.\n\nFor affiliate sites, the Swarm will focus on:\n- 🔗 **Outbound click-through** optimization (product card CTAs, comparison tables, "Check Price" buttons)\n- 📊 **Comparison content** architecture (vs. articles, best-of roundups, buying guides)\n- ⭐ **Trust signals** (verified reviews, price history, editorial "Why we recommend")\n- 🎯 A/B tests will measure **affiliate click-through rate** as the winner metric\n\nNow tell me about your 6-month goals. What does success look like — click volume, revenue per click, or content coverage?`;
      brandContextUpdated = true;
      mockBrandContext.proj_001.business_model = "affiliate";
    } else if (userText.includes("publisher") || userText.includes("ad revenue") || userText.includes("ads") || userText.includes("content") || userText.includes("media")) {
      reply = `Got it — **Ad Revenue / Publishing**. I've saved this to my memory. Engagement depth is everything for your model.\n\nFor publishers, the Swarm will focus on:\n- ⏱️ **Dwell time** optimization (compelling intros, visual rhythm, scroll hooks)\n- 📜 **Scroll depth** maximization (section headers, inline media, progress indicators)\n- 🔄 **Internal navigation** clicks ("Related Articles" cards, contextual inline links, recirculation widgets)\n- 🎯 A/B tests will measure **engagement depth rate** as the winner metric\n\nNow tell me about your 6-month goals. What does success look like — pageviews, ad RPM, or subscriber growth?`;
      brandContextUpdated = true;
      mockBrandContext.proj_001.business_model = "publisher";
    } else if (userText.includes("goal") || userText.includes("revenue") || userText.includes("traffic") || userText.includes("grow")) {
      const model = mockBrandContext.proj_001?.business_model || "e-commerce";
      const modelLabels: any = { "e-commerce": "E-commerce", lead_gen: "Lead Gen", affiliate: "Affiliate", publisher: "Publisher" };
      reply = `Excellent — those are ambitious but achievable goals. I've saved this to my memory so I'll always keep them in mind.\n\nBased on your site analysis, **${modelLabels[model] || model}** business model, and these goals, I've generated a prioritized strategy roadmap tailored to your specific conversion objectives. Check the panel on the right — you'll see action items ranked by impact.\n\n**The items marked "Suggested" need your approval.** Click "Approve & Deploy" on any item to send it to the Swarm for automatic execution.\n\nWant me to explain the rationale behind any specific item?`;
      brandContextUpdated = true;
      roadmapItemsAdded = 2;
    } else if (userText.includes("explain") || userText.includes("why") || userText.includes("rationale")) {
      reply = `Great question. Here's the strategic thinking:\n\n**Pillar Content (High Priority):** Long-form, authoritative content is the #1 driver of organic traffic for competitive keywords. A 3,000-word guide positions you as the definitive resource, earns backlinks naturally, and feeds multiple social media posts.\n\n**FAQ Schema (High Priority):** This is a quick win. FAQ markup can earn you featured snippets within 2-4 weeks, dramatically increasing click-through rates without creating new content.\n\n**Digital PR (Medium Priority):** Backlinks from authoritative publications remain the strongest ranking signal. We'll pitch data-driven stories that naturally reference your brand.\n\nShall I adjust any priorities or add more specific actions?`;
    } else {
      reply = `I understand. Let me know how you'd like to proceed — I can:\n\n1. **Analyze a URL** — paste your website link and I'll run a deep audit\n2. **Set your business model** — tell me if you're E-commerce, Lead Gen, Affiliate, or Publisher\n3. **Refine the roadmap** — tell me which areas to focus on (content, technical SEO, backlinks, CRO)\n4. **Discuss strategy** — ask me anything about your growth plan\n\nWhat would you like to do?`;
    }

    res.json({
      success: true,
      reply,
      brand_context_updated: brandContextUpdated,
      roadmap_items_added: roadmapItemsAdded,
    });
  });

  // GET /api/manager/roadmap
  app.get("/api/manager/roadmap", (req, res) => {
    const projectId = (req.query.project_id as string) || "proj_001";
    const items = mockRoadmapItems.filter((i) => i.project_id === projectId);
    res.json({ success: true, project_id: projectId, items, total: items.length });
  });

  // PATCH /api/manager/roadmap/:taskId
  app.patch("/api/manager/roadmap/:taskId", (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body || {};
    const item = mockRoadmapItems.find((i) => i.id === taskId);
    if (!item) return res.status(404).json({ success: false, error: "Not found" });
    item.status = status;
    item.updated_at = new Date().toISOString();
    res.json({ success: true, task_id: taskId, new_status: status });
  });

  // POST /api/manager/roadmap/:taskId/deploy
  app.post("/api/manager/roadmap/:taskId/deploy", (req, res) => {
    const { taskId } = req.params;
    const item = mockRoadmapItems.find((i) => i.id === taskId);
    if (!item) return res.status(404).json({ success: false, error: "Not found" });
    item.status = "Approved";
    item.updated_at = new Date().toISOString();
    console.log(`[AI Manager] Deployed roadmap item: ${item.title}`);
    res.json({
      success: true,
      task_id: taskId,
      status: "Approved",
      dispatch: "task_dispatched",
      dispatch_result: { success: true, task_id: `task_ai_${Date.now()}`, status: "Running", agent_type: "orchestrator", mode: "copilot" },
    });
  });

  // GET /api/manager/brand-context
  app.get("/api/manager/brand-context", (req, res) => {
    const projectId = (req.query.project_id as string) || "proj_001";
    const ctx = mockBrandContext[projectId] || null;
    res.json({ success: true, project_id: projectId, context: ctx });
  });

  // ────────────────────────────────────────────
  // Phase 27: Retention Engine Mock Routes
  // ────────────────────────────────────────────

  // In-memory magic link store
  const mockMagicLinks: Record<string, { userId: string; email: string; usedAt: string | null; expiresAt: string }> = {};

  // POST /api/auth/magic-verify
  app.post("/api/auth/magic-verify", (req, res) => {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "Token is required" });
    }

    // For mock: check our in-memory store
    const link = mockMagicLinks[token];

    if (!link) {
      // If token starts with "mock-magic-", generate a synthetic success
      if (token.startsWith("mock-magic-")) {
        // Extract user info from token pattern: mock-magic-{userId}-{timestamp}
        const parts = token.split("-");
        const userId = parts[2] || "usr_001";
        const user = Object.values(MOCK_USERS).find((u) => u.id === userId);
        if (!user) {
          return res.status(404).json({ success: false, error: "Magic link not found" });
        }
        return res.json({
          success: true,
          token: `mock-jwt-${user.id}-${Date.now()}`,
          user: { id: user.id, email: user.email, role: user.role },
        });
      }
      return res.status(404).json({ success: false, error: "Magic link not found" });
    }

    if (link.usedAt) {
      return res.status(410).json({ success: false, error: "Magic link already used" });
    }

    if (new Date(link.expiresAt) < new Date()) {
      return res.status(401).json({ success: false, error: "Invalid or expired magic link" });
    }

    // Mark as used
    link.usedAt = new Date().toISOString();

    const user = Object.values(MOCK_USERS).find((u) => u.id === link.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      token: `mock-jwt-${user.id}-${Date.now()}`,
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  // GET /api/retention/stats (superadmin only — for future dashboard)
  app.get("/api/retention/stats", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({
      success: true,
      stats: {
        at_risk_users: 3,
        winback_emails_sent_today: 2,
        magic_links_generated: 2,
        reactivations_this_week: 1,
        competitor_scans_run: 1,
        last_scan_at: new Date().toISOString(),
      },
    });
  });

  // GET /api/retention/competitor-scans (superadmin only)
  app.get("/api/retention/competitor-scans", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({
      success: true,
      scans: [
        {
          id: "scan_mock_001",
          project_id: "proj_001",
          competitors: [
            { name: "Ahrefs", signal: "Launched AI-powered content generation module", severity: "high", recommendation: "Accelerate content pipeline velocity" },
            { name: "Semrush", signal: "Reduced Pro tier pricing by 30%", severity: "medium", recommendation: "Consider targeted retention offers" },
            { name: "Surfer SEO", signal: "Published case study showing 40% traffic increase", severity: "low", recommendation: "Develop competing case studies" },
          ],
          threats: ["Ahrefs AI content module could reduce differentiation", "Semrush aggressive pricing"],
          opportunities: ["Growing demand for autonomous SEO", "E-commerce vertical underserved"],
          created_at: new Date().toISOString(),
        },
      ],
    });
  });

  // GET /api/retention/events (superadmin only)
  app.get("/api/retention/events", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({
      success: true,
      events: [
        { id: "evt_001", user_id: "usr_003", event_type: "winback_sent", channel: "email", metadata: JSON.stringify({ tier: "gentle_nudge", days_inactive: 9 }), created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: "evt_002", user_id: "usr_005", event_type: "winback_sent", channel: "email,sms", metadata: JSON.stringify({ tier: "urgency", days_inactive: 21 }), created_at: new Date(Date.now() - 43200000).toISOString() },
        { id: "evt_003", user_id: "usr_003", event_type: "reactivated", channel: "magic_link", metadata: JSON.stringify({ method: "magic_link" }), created_at: new Date(Date.now() - 3600000).toISOString() },
      ],
    });
  });

  // ────────────────────────────────────────────
  // Phase 31: Dynamic CMS & Global Control Panel
  // ────────────────────────────────────────────

  // In-memory stores for Phase 31 mock data
  const siteSettings: Record<string, any> = {
    site_name: "Swarme",
    logo_url: "",
    favicon_url: "",
    maintenance_mode: false,
    hero_headline: "The Autonomous SEO Swarm.",
    hero_subheadline: "12 AI agents operating at the edge. They crawl, audit, fix, write, and publish — autonomously.",
    social_links: { twitter: "https://x.com/swarme", linkedin: "https://linkedin.com/company/swarme", github: "" },
    seo_metadata: { title: "Swarme — Autonomous SEO Swarm", description: "12 AI agents running 24/7 on Cloudflare Workers.", og_image: "" },
  };

  const cmsPosts: any[] = [
    { id: "cms_001", type: "blog", title: "How Edge AI Changes SEO Forever", content: "Edge computing is transforming search optimization...", slug: "edge-ai-seo", published: 1, author_id: "usr_001", created_at: "2026-03-01T10:00:00", updated_at: "2026-03-10T14:00:00" },
    { id: "cms_002", type: "blog", title: "2026 Content Decay Report", content: "Our latest analysis shows 34% of enterprise content loses ranking...", slug: "content-decay-report-2026", published: 1, author_id: "usr_001", created_at: "2026-03-05T09:00:00", updated_at: "2026-03-12T11:00:00" },
    { id: "cms_003", type: "faq", title: "What is autonomous SEO?", content: "Autonomous SEO uses AI agents to perform SEO tasks without human intervention.", slug: "what-is-autonomous-seo", published: 1, author_id: "usr_001", created_at: "2026-02-20T08:00:00", updated_at: "2026-02-20T08:00:00" },
    { id: "cms_004", type: "faq", title: "How does the swarm work?", content: "The swarm consists of 12 specialized agents that coordinate through a Durable Object orchestrator.", slug: "how-swarm-works", published: 1, author_id: "usr_001", created_at: "2026-02-20T08:30:00", updated_at: "2026-02-20T08:30:00" },
    { id: "cms_005", type: "feature", title: "Edge-Native Vision AI", content: "Computer vision scans every product image at the edge.", slug: "vision-ai", published: 1, author_id: "usr_001", created_at: "2026-03-01T12:00:00", updated_at: "2026-03-01T12:00:00" },
    { id: "cms_006", type: "feature", title: "Autonomous CRO Engine", content: "Heatmap-driven conversion optimization without human intervention.", slug: "cro-engine", published: 0, author_id: "usr_001", created_at: "2026-03-08T10:00:00", updated_at: "2026-03-08T10:00:00" },
    { id: "cms_007", type: "blog", title: "Why Serverless SEO Wins", content: "Cold starts are the enemy of SEO...", slug: "serverless-seo-wins", published: 0, author_id: "usr_001", created_at: "2026-03-14T16:00:00", updated_at: "2026-03-14T16:00:00" },
  ];

  const countries = ["US", "GB", "DE", "FR", "CA", "AU", "JP", "BR", "IN", "NL", "SE", "KR"];
  const devices = ["Desktop", "Mobile", "Tablet"];
  const referrers = ["google.com", "x.com", "linkedin.com", "direct", "reddit.com", "bing.com", "producthunt.com", "hackernews"];
  const routes = ["/", "/pricing", "/blog", "/features", "/signup", "/free-analyzer", "/about", "/docs"];
  const trafficLogs: any[] = [];
  for (let i = 0; i < 120; i++) {
    const d = new Date(Date.now() - Math.random() * 7 * 86400000);
    trafficLogs.push({
      id: `tl_${String(i).padStart(3, "0")}`,
      ip_address: `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      device: devices[Math.floor(Math.random() * devices.length)],
      country: countries[Math.floor(Math.random() * countries.length)],
      referrer: referrers[Math.floor(Math.random() * referrers.length)],
      route: routes[Math.floor(Math.random() * routes.length)],
      created_at: d.toISOString(),
    });
  }
  trafficLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const supportTickets: any[] = [
    { id: "tkt_001", user_id: "usr_002", subject: "Agent not crawling /blog pages", message: "The scraper agent seems to skip blog pages entirely.", status: "open", priority: "high", assigned_to: null, created_at: "2026-03-14T09:00:00", updated_at: "2026-03-14T09:00:00" },
    { id: "tkt_002", user_id: "usr_003", subject: "Billing invoice missing", message: "I can't find my March invoice in settings.", status: "in_progress", priority: "medium", assigned_to: "usr_001", created_at: "2026-03-13T14:30:00", updated_at: "2026-03-14T08:00:00" },
    { id: "tkt_003", user_id: "usr_004", subject: "Request: bulk keyword import", message: "Would love to be able to import 500+ keywords via CSV.", status: "open", priority: "low", assigned_to: null, created_at: "2026-03-12T11:00:00", updated_at: "2026-03-12T11:00:00" },
    { id: "tkt_004", user_id: "usr_002", subject: "CRO heatmap not loading", message: "Heatmap shows a blank white screen on mobile.", status: "resolved", priority: "high", assigned_to: "usr_001", created_at: "2026-03-10T16:00:00", updated_at: "2026-03-12T10:00:00" },
    { id: "tkt_005", user_id: "usr_005", subject: "Account deletion request", message: "Please delete all my data per GDPR.", status: "open", priority: "critical", assigned_to: null, created_at: "2026-03-15T07:00:00", updated_at: "2026-03-15T07:00:00" },
    { id: "tkt_006", user_id: "usr_003", subject: "API rate limit too low", message: "Hitting 429 errors when running bulk audits.", status: "in_progress", priority: "medium", assigned_to: "usr_001", created_at: "2026-03-11T09:00:00", updated_at: "2026-03-13T15:00:00" },
  ];

  const auditLog: any[] = [
    { id: "aud_001", admin_id: "usr_001", action: "settings.update", target: "site_name", metadata: JSON.stringify({ old: "Swarme Beta", new: "Swarme" }), created_at: "2026-03-14T12:00:00" },
    { id: "aud_002", admin_id: "usr_001", action: "user.suspend", target: "usr_006", metadata: null, created_at: "2026-03-13T10:30:00" },
    { id: "aud_003", admin_id: "usr_001", action: "cms.publish", target: "cms_001", metadata: JSON.stringify({ title: "How Edge AI Changes SEO Forever" }), created_at: "2026-03-10T14:00:00" },
    { id: "aud_004", admin_id: "usr_001", action: "maintenance.toggle", target: "off", metadata: null, created_at: "2026-03-09T08:00:00" },
  ];

  const stripeTransactions: any[] = [
    { id: "txn_001", user_id: "usr_002", email: "alice@example.com", type: "subscription", amount: 99.00, currency: "USD", status: "succeeded", plan: "pro", stripe_id: "sub_1R2abc", created_at: "2026-03-01T00:00:00" },
    { id: "txn_002", user_id: "usr_003", email: "bob@test.com", type: "subscription", amount: 299.00, currency: "USD", status: "succeeded", plan: "enterprise", stripe_id: "sub_1R3def", created_at: "2026-03-01T00:00:00" },
    { id: "txn_003", user_id: "usr_004", email: "carol@shop.io", type: "subscription", amount: 99.00, currency: "USD", status: "succeeded", plan: "pro", stripe_id: "sub_1R4ghi", created_at: "2026-03-01T00:00:00" },
    { id: "txn_004", user_id: "usr_002", email: "alice@example.com", type: "one_time", amount: 49.00, currency: "USD", status: "succeeded", plan: "addon_credits", stripe_id: "pi_1R5jkl", created_at: "2026-03-05T14:00:00" },
    { id: "txn_005", user_id: "usr_005", email: "dave@co.uk", type: "subscription", amount: 99.00, currency: "USD", status: "failed", plan: "pro", stripe_id: "sub_1R6mno", created_at: "2026-03-08T00:00:00" },
    { id: "txn_006", user_id: "usr_003", email: "bob@test.com", type: "refund", amount: -50.00, currency: "USD", status: "succeeded", plan: "enterprise", stripe_id: "re_1R7pqr", created_at: "2026-03-10T10:00:00" },
    { id: "txn_007", user_id: "usr_006", email: "eve@startup.dev", type: "subscription", amount: 99.00, currency: "USD", status: "succeeded", plan: "pro", stripe_id: "sub_1R8stu", created_at: "2026-03-12T00:00:00" },
    { id: "txn_008", user_id: "usr_002", email: "alice@example.com", type: "subscription", amount: 99.00, currency: "USD", status: "succeeded", plan: "pro", stripe_id: "sub_1R2abc", created_at: "2026-04-01T00:00:00" },
  ];

  const webhookConfig: Record<string, string> = { discord_url: "", telegram_url: "" };

  // GET /api/admin/settings/site
  app.get("/api/admin/settings/site", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, settings: { ...siteSettings } });
  });

  // POST /api/admin/settings/site
  app.post("/api/admin/settings/site", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const body = req.body || {};
    for (const key of Object.keys(body)) {
      if (key in siteSettings) {
        siteSettings[key] = body[key];
      }
    }
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "settings.update", target: Object.keys(body).join(","), metadata: JSON.stringify(body), created_at: new Date().toISOString() });
    res.json({ success: true, settings: { ...siteSettings } });
  });

  // GET /api/public/settings (cached/public version)
  app.get("/api/public/settings", (_req, res) => {
    res.json({
      success: true,
      settings: {
        site_name: siteSettings.site_name,
        logo_url: siteSettings.logo_url,
        favicon_url: siteSettings.favicon_url,
        maintenance_mode: siteSettings.maintenance_mode,
        seo_metadata: siteSettings.seo_metadata,
      },
    });
  });

  // ── CMS Posts CRUD ──
  app.get("/api/admin/cms/posts", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const typeFilter = req.query.type as string | undefined;
    let posts = [...cmsPosts];
    if (typeFilter) posts = posts.filter((p) => p.type === typeFilter);
    res.json({ success: true, posts });
  });

  app.post("/api/admin/cms/posts", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { type, title, content, slug, published } = req.body || {};
    if (!type || !title) return res.status(400).json({ success: false, error: "type and title required" });
    const post = {
      id: `cms_${Date.now()}`,
      type,
      title,
      content: content || "",
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      published: published ? 1 : 0,
      author_id: "usr_001",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    cmsPosts.unshift(post);
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "cms.create", target: post.id, metadata: JSON.stringify({ title }), created_at: new Date().toISOString() });
    res.json({ success: true, post });
  });

  app.patch("/api/admin/cms/posts/:postId", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const post = cmsPosts.find((p) => p.id === req.params.postId);
    if (!post) return res.status(404).json({ success: false, error: "Post not found" });
    const body = req.body || {};
    for (const key of ["title", "content", "slug", "published", "type"]) {
      if (key in body) (post as any)[key] = body[key];
    }
    post.updated_at = new Date().toISOString();
    res.json({ success: true, post });
  });

  app.delete("/api/admin/cms/posts/:postId", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const idx = cmsPosts.findIndex((p) => p.id === req.params.postId);
    if (idx === -1) return res.status(404).json({ success: false, error: "Post not found" });
    cmsPosts.splice(idx, 1);
    res.json({ success: true });
  });

  // ── Traffic Logs ──
  app.get("/api/admin/traffic", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const limit = Math.min(parseInt(String(req.query.limit || "100"), 10), 500);
    res.json({ success: true, total: trafficLogs.length, logs: trafficLogs.slice(0, limit) });
  });

  // ── Support Tickets ──
  app.get("/api/admin/support/tickets", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, tickets: supportTickets });
  });

  app.patch("/api/admin/support/tickets/:ticketId", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const ticket = supportTickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found" });
    const body = req.body || {};
    for (const key of ["status", "priority", "assigned_to"]) {
      if (key in body) (ticket as any)[key] = body[key];
    }
    ticket.updated_at = new Date().toISOString();
    res.json({ success: true, ticket });
  });

  // ── Webhook Config ──
  app.get("/api/admin/support/webhooks", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, webhooks: { ...webhookConfig } });
  });

  app.post("/api/admin/support/webhooks", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { discord_url, telegram_url } = req.body || {};
    if (discord_url !== undefined) webhookConfig.discord_url = discord_url;
    if (telegram_url !== undefined) webhookConfig.telegram_url = telegram_url;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "webhooks.update", target: "support", metadata: JSON.stringify(webhookConfig), created_at: new Date().toISOString() });
    res.json({ success: true, webhooks: { ...webhookConfig } });
  });

  // ── Newsletter Broadcast (mock) ──
  app.post("/api/admin/communications/newsletter", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { subject, html_body } = req.body || {};
    if (!subject || !html_body) return res.status(400).json({ success: false, error: "subject and html_body required" });
    const recipientCount = Object.values(MOCK_USERS).filter((u: any) => u.status === "active").length;
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "newsletter.send", target: `${recipientCount} recipients`, metadata: JSON.stringify({ subject }), created_at: new Date().toISOString() });
    res.json({ success: true, message: `Newsletter queued for ${recipientCount} active users`, recipient_count: recipientCount });
  });

  // ── Audit Log ──
  app.get("/api/admin/audit-log", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
    res.json({ success: true, entries: auditLog.slice(0, limit) });
  });

  // ── Financial Ledger ──
  app.get("/api/admin/finance/transactions", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const totalRevenue = stripeTransactions.filter((t) => t.status === "succeeded").reduce((s, t) => s + t.amount, 0);
    res.json({ success: true, total_revenue: totalRevenue, transactions: stripeTransactions });
  });

  // ── Security: IP Blocklist (in-memory mock) ──
  const ipBlocklist: string[] = ["45.33.32.156", "203.0.113.42"];

  app.get("/api/admin/security/ip-blocklist", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, blocked_ips: ipBlocklist });
  });

  app.post("/api/admin/security/ip-blocklist", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { ip } = req.body || {};
    if (!ip) return res.status(400).json({ success: false, error: "ip required" });
    if (!ipBlocklist.includes(ip)) ipBlocklist.push(ip);
    auditLog.unshift({ id: `aud_${Date.now()}`, admin_id: "usr_001", action: "security.ip_block", target: ip, metadata: null, created_at: new Date().toISOString() });
    res.json({ success: true, blocked_ips: ipBlocklist });
  });

  app.delete("/api/admin/security/ip-blocklist/:ip", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const idx = ipBlocklist.indexOf(req.params.ip);
    if (idx !== -1) ipBlocklist.splice(idx, 1);
    res.json({ success: true, blocked_ips: ipBlocklist });
  });

  // ────────────────────────────────────────────
  // Phase 31.5: Feature Flags + Audit Middleware
  // ────────────────────────────────────────────

  // In-memory feature flag store (mirrors KV global:flags)
  const featureFlags: Record<string, { state: "disabled" | "global" | "targeted"; users: string[] }> = {
    beta_pinterest_agent: { state: "targeted", users: ["usr_002", "usr_003"] },
    new_audit_ui: { state: "global", users: [] },
    ai_content_refresh_v2: { state: "disabled", users: [] },
    smart_cro_heatmaps: { state: "targeted", users: ["usr_004"] },
    bulk_keyword_import: { state: "disabled", users: [] },
    advanced_decay_alerts: { state: "global", users: [] },
  };

  // GET /api/admin/flags — Read all feature flag state
  app.get("/api/admin/flags", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    res.json({ success: true, flags: { ...featureFlags } });
  });

  // POST /api/admin/flags — Create or update a feature flag
  app.post("/api/admin/flags", (req, res) => {
    if (!requireMockSuperadmin(req, res)) return;
    const { key, state, users } = req.body || {};
    if (!key || !state) {
      return res.status(400).json({ success: false, error: "key and state required" });
    }
    if (!["disabled", "global", "targeted"].includes(state)) {
      return res.status(400).json({ success: false, error: "state must be disabled, global, or targeted" });
    }
    const previous = featureFlags[key] ? { ...featureFlags[key] } : null;
    featureFlags[key] = { state, users: state === "targeted" ? (users || []) : [] };
    auditLog.unshift({
      id: `aud_${Date.now()}`,
      admin_id: "usr_001",
      action: "flags.update",
      target: key,
      metadata: JSON.stringify({ previous, updated: featureFlags[key] }),
      created_at: new Date().toISOString(),
    });
    res.json({ success: true, flag: { key, ...featureFlags[key] } });
  });

  // ── Phase 31.5 Task 4: Admin Audit Middleware ──
  // Wraps all POST, PUT, DELETE on /api/admin/* to auto-log actions.
  // Runs AFTER route handlers via response event hooks.
  // Since Express processes middleware in order, this is registered
  // as a response interceptor so it captures the route + method.
  app.use("/api/admin", (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "DELETE"].includes(method)) return next();

    // Capture original res.json to intercept after route handler
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Only log successful mutations (don't log 4xx/5xx failures)
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        // Derive action from the route path
        const routePath = req.originalUrl.replace("/api/admin/", "");
        const actionMap: Record<string, string> = {
          "POST": `${routePath}.create`,
          "PUT": `${routePath}.update`,
          "DELETE": `${routePath}.delete`,
        };
        let action = actionMap[method] || `${routePath}.${method.toLowerCase()}`;
        // Normalize: collapse path params
        action = action.replace(/\/[a-zA-Z0-9_-]+\//g, "/").replace(/\/$/, "");

        // Avoid duplicate logging for routes that already push to auditLog
        const alreadyLogged = ["settings/site", "cms/posts", "support/webhooks", 
          "communications/newsletter", "security/ip-blocklist", "flags"];
        const isDuplicate = alreadyLogged.some((r) => routePath.startsWith(r));

        if (!isDuplicate) {
          const userId = extractMockUserId(req);
          const adminUser = userId ? Object.values(MOCK_USERS).find((u) => u.id === userId) : null;
          auditLog.unshift({
            id: `aud_auto_${Date.now()}`,
            admin_id: userId || "unknown",
            admin_email: adminUser?.email || "unknown",
            action,
            target: req.params?.id || req.params?.ticketId || req.params?.postId || req.params?.ip || routePath,
            metadata: req.body ? JSON.stringify(req.body) : null,
            created_at: new Date().toISOString(),
          });
        }
      }
      return originalJson(body);
    } as any;
    next();
  });

  // Enhance existing audit log entries with admin_email field
  // Backfill for entries that were created before the middleware
  for (const entry of auditLog) {
    if (!entry.admin_email) {
      const user = Object.values(MOCK_USERS).find((u) => u.id === entry.admin_id);
      entry.admin_email = user?.email || "demo@swarme.io";
    }
  }

  // ────────────────────────────────────────────
  // Phase 37: Action History, Rollback Engine & Mission Control
  // ────────────────────────────────────────────

  const MOCK_ACTION_HISTORY: any[] = [
    {
      id: "ah_001",
      project_id: "proj_001",
      agent_type: "writer",
      action: "Content Published",
      entity_type: "content_asset",
      entity_id: "asset_edge_computing",
      snapshot_before: JSON.stringify({ title: "Edge Computing in 2026", status: "draft", seo_score: 72 }),
      snapshot_after: JSON.stringify({ title: "Edge Computing in 2026: The Definitive Guide", status: "published", seo_score: 91 }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-15T14:32:00Z",
    },
    {
      id: "ah_002",
      project_id: "proj_001",
      agent_type: "auditor",
      action: "Schema Markup Injected",
      entity_type: "content_asset",
      entity_id: "asset_serverless_seo",
      snapshot_before: JSON.stringify({ schema_valid: false, schema_type: null }),
      snapshot_after: JSON.stringify({ schema_valid: true, schema_type: "FAQPage" }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-15T13:18:00Z",
    },
    {
      id: "ah_003",
      project_id: "proj_001",
      agent_type: "cro",
      action: "CTA Repositioned",
      entity_type: "ab_test",
      entity_id: "ab_pricing_hero",
      snapshot_before: JSON.stringify({ cta_position: "below-fold", conversion_rate: 2.1 }),
      snapshot_after: JSON.stringify({ cta_position: "above-fold", conversion_rate: 3.8 }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-15T11:45:00Z",
    },
    {
      id: "ah_004",
      project_id: "proj_001",
      agent_type: "social",
      action: "Social Draft Created",
      entity_type: "social_draft",
      entity_id: "sd_twitter_edge",
      snapshot_before: null,
      snapshot_after: JSON.stringify({ platform: "twitter", thread_count: 4, status: "AWAITING_APPROVAL" }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-15T10:22:00Z",
    },
    {
      id: "ah_005",
      project_id: "proj_001",
      agent_type: "writer",
      action: "Content Refreshed",
      entity_type: "content_asset",
      entity_id: "asset_geo_guide",
      snapshot_before: JSON.stringify({ title: "GEO Guide", word_count: 1200, seo_score: 65 }),
      snapshot_after: JSON.stringify({ title: "Generative Engine Optimization: Complete Guide", word_count: 2400, seo_score: 88 }),
      preview_url: null,
      rolled_back: 1,
      rolled_back_at: "2026-03-15T16:10:00Z",
      created_at: "2026-03-15T09:55:00Z",
    },
    {
      id: "ah_006",
      project_id: "proj_001",
      agent_type: "auditor",
      action: "Alt Text Generated",
      entity_type: "content_asset",
      entity_id: "asset_edge_computing",
      snapshot_before: JSON.stringify({ images_missing_alt: 5 }),
      snapshot_after: JSON.stringify({ images_missing_alt: 0, images_enriched: 5 }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-15T08:30:00Z",
    },
    {
      id: "ah_007",
      project_id: "proj_001",
      agent_type: "cro",
      action: "Headline A/B Test Launched",
      entity_type: "ab_test",
      entity_id: "ab_headline_test",
      snapshot_before: null,
      snapshot_after: JSON.stringify({ test_name: "Headline Optimization", variant_a: "Original", variant_b: "AI-Optimized", status: "Running" }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-14T22:15:00Z",
    },
    {
      id: "ah_008",
      project_id: "proj_001",
      agent_type: "researcher",
      action: "Trend Report Generated",
      entity_type: "trend_report",
      entity_id: "tr_serverless_seo",
      snapshot_before: null,
      snapshot_after: JSON.stringify({ keyword: "serverless seo", velocity: "4.2x", competitors_found: 7 }),
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: "2026-03-14T20:00:00Z",
    },
  ];

  // GET /api/projects/:projectId/action-history
  app.get("/api/projects/:projectId/action-history", (req, res) => {
    const { projectId } = req.params;
    const { agent_type, entity_type, rolled_back, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(String(limitStr || "50"), 10) || 50, 200);

    let actions = MOCK_ACTION_HISTORY.filter((a) => a.project_id === projectId);
    if (agent_type) actions = actions.filter((a) => a.agent_type === agent_type);
    if (entity_type) actions = actions.filter((a) => a.entity_type === entity_type);
    if (rolled_back !== undefined) actions = actions.filter((a) => a.rolled_back === Number(rolled_back));
    actions = actions.slice(0, limit);

    res.json({
      success: true,
      project_id: projectId,
      actions,
      total: actions.length,
    });
  });

  // POST /api/projects/:projectId/action-history/:actionId/rollback
  app.post("/api/projects/:projectId/action-history/:actionId/rollback", (req, res) => {
    const { actionId } = req.params;
    const action = MOCK_ACTION_HISTORY.find((a) => a.id === actionId);
    if (!action) {
      return res.status(404).json({ success: false, error: "Action not found" });
    }
    if (action.rolled_back === 1) {
      return res.status(400).json({ success: false, error: "Action already rolled back" });
    }
    if (!action.snapshot_before) {
      return res.status(400).json({ success: false, error: "No snapshot_before available — cannot rollback creation actions" });
    }
    action.rolled_back = 1;
    action.rolled_back_at = new Date().toISOString();
    res.json({
      success: true,
      action_id: actionId,
      rolled_back: true,
      restored_snapshot: JSON.parse(action.snapshot_before),
    });
  });

  // GET /api/projects/:projectId/mission-control
  // Aggregated Mission Control dashboard data
  app.get("/api/projects/:projectId/mission-control", (req, res) => {
    const { projectId } = req.params;

    // Integration health statuses
    const integrations = [
      { id: "int_shopify", name: "Shopify", platform: "shopify", status: "connected", last_sync: "2026-03-15T20:00:00Z", sync_errors: 0 },
      { id: "int_gsc", name: "Google Search Console", platform: "gsc", status: "connected", last_sync: "2026-03-15T19:45:00Z", sync_errors: 0 },
      { id: "int_ga4", name: "Google Analytics 4", platform: "ga4", status: "connected", last_sync: "2026-03-15T19:50:00Z", sync_errors: 0 },
      { id: "int_stripe", name: "Stripe", platform: "stripe", status: "connected", last_sync: "2026-03-15T20:10:00Z", sync_errors: 0 },
      { id: "int_openai", name: "OpenAI", platform: "openai", status: "connected", last_sync: "2026-03-15T20:15:00Z", sync_errors: 0 },
      { id: "int_perplexity", name: "Perplexity API", platform: "perplexity", status: "degraded", last_sync: "2026-03-15T18:30:00Z", sync_errors: 3 },
      { id: "int_workers_ai", name: "Workers AI", platform: "workers_ai", status: "connected", last_sync: "2026-03-15T20:12:00Z", sync_errors: 0 },
    ];

    // Agent health pulse
    const agentHealth = [
      { agent_type: "scraper", status: "healthy", tasks_last_hour: 14, errors_last_hour: 0, avg_latency_ms: 340 },
      { agent_type: "writer", status: "healthy", tasks_last_hour: 6, errors_last_hour: 0, avg_latency_ms: 2800 },
      { agent_type: "auditor", status: "healthy", tasks_last_hour: 9, errors_last_hour: 1, avg_latency_ms: 1200 },
      { agent_type: "cro", status: "healthy", tasks_last_hour: 4, errors_last_hour: 0, avg_latency_ms: 450 },
      { agent_type: "outreach", status: "idle", tasks_last_hour: 0, errors_last_hour: 0, avg_latency_ms: 0 },
      { agent_type: "visibility", status: "healthy", tasks_last_hour: 8, errors_last_hour: 0, avg_latency_ms: 620 },
      { agent_type: "researcher", status: "degraded", tasks_last_hour: 2, errors_last_hour: 2, avg_latency_ms: 4500 },
      { agent_type: "social", status: "healthy", tasks_last_hour: 3, errors_last_hour: 0, avg_latency_ms: 1100 },
      { agent_type: "media", status: "healthy", tasks_last_hour: 4, errors_last_hour: 0, avg_latency_ms: 3200 },
      { agent_type: "publisher", status: "healthy", tasks_last_hour: 5, errors_last_hour: 0, avg_latency_ms: 890 },
    ];

    // Cron job statuses (from wrangler.toml crons)
    const cronJobs = [
      { name: "Visibility Check", cron: "0 */6 * * *", last_run: "2026-03-15T18:00:00Z", next_run: "2026-03-16T00:00:00Z", status: "success", duration_ms: 12400 },
      { name: "Trend Detection", cron: "0 */4 * * *", last_run: "2026-03-15T20:00:00Z", next_run: "2026-03-16T00:00:00Z", status: "success", duration_ms: 8200 },
      { name: "Content Decay Scan", cron: "0 3 * * 1", last_run: "2026-03-10T03:00:00Z", next_run: "2026-03-17T03:00:00Z", status: "success", duration_ms: 45000 },
      { name: "CRO Telemetry Sync", cron: "*/30 * * * *", last_run: "2026-03-15T20:30:00Z", next_run: "2026-03-15T21:00:00Z", status: "success", duration_ms: 3100 },
      { name: "Social Queue Process", cron: "0 9,15 * * *", last_run: "2026-03-15T15:00:00Z", next_run: "2026-03-16T09:00:00Z", status: "success", duration_ms: 5600 },
    ];

    // Summary KPIs
    const summary = {
      total_actions_24h: 47,
      rollbacks_24h: 1,
      agents_active: agentHealth.filter((a) => a.status === "healthy").length,
      agents_degraded: agentHealth.filter((a) => a.status === "degraded").length,
      agents_idle: agentHealth.filter((a) => a.status === "idle").length,
      integrations_connected: integrations.filter((i) => i.status === "connected").length,
      integrations_degraded: integrations.filter((i) => i.status === "degraded").length,
      crons_healthy: cronJobs.filter((c) => c.status === "success").length,
      crons_total: cronJobs.length,
    };

    // Recent actions (subset of action history)
    const recentActions = MOCK_ACTION_HISTORY
      .filter((a) => a.project_id === projectId)
      .slice(0, 5);

    res.json({
      success: true,
      project_id: projectId,
      summary,
      integrations,
      agent_health: agentHealth,
      cron_jobs: cronJobs,
      recent_actions: recentActions,
    });
  });

  // ────────────────────────────────────────────
  // Phase 38: Outreach Campaigns Mock Data + Routes
  // ────────────────────────────────────────────

  const MOCK_OUTREACH_CAMPAIGNS = [
    {
      id: "oc_001",
      project_id: "proj_001",
      keyword: "sustainable luxury fashion",
      target_url: "https://thegoodtrade.com/features/sustainable-luxury-brands",
      target_email: "editors@thegoodtrade.com",
      contact_name: "Sarah Mitchell",
      outreach_draft: JSON.stringify({
        subject: "Collaboration opportunity — Sustainable Luxury Feature",
        body: "Hi Sarah,\n\nI came across your excellent roundup of sustainable luxury brands and thought Sartelle Atelier would be a perfect addition. We're a premium fashion house committed to zero-waste production and ethically sourced materials.\n\nWould you be open to featuring us in an updated version of the article or a dedicated piece?\n\nBest regards,\nSartelle Atelier Team",
      }),
      status: "Draft",
      domain_authority: 72,
      relevance_score: 0.91,
      sent_at: null,
      replied_at: null,
      created_at: "2026-03-15T14:00:00Z",
      updated_at: "2026-03-15T14:00:00Z",
    },
    {
      id: "oc_002",
      project_id: "proj_001",
      keyword: "sustainable luxury fashion",
      target_url: "https://fashionista.com/sustainable-fashion-guide",
      target_email: "jessica.r@fashionista.com",
      contact_name: "Jessica Rivera",
      outreach_draft: JSON.stringify({
        subject: "Guest post pitch — The Future of Sustainable Couture",
        body: "Hi Jessica,\n\nYour sustainable fashion guide is one of the most comprehensive resources I've seen. I'd love to contribute a guest post exploring how couture houses are adopting zero-waste patterns and regenerative fabrics.\n\nThe piece would be ~1,200 words with original photography from our atelier.\n\nWould this be a fit for Fashionista?\n\nWarm regards,\nSartelle Atelier",
      }),
      status: "Draft",
      domain_authority: 85,
      relevance_score: 0.87,
      sent_at: null,
      replied_at: null,
      created_at: "2026-03-15T14:05:00Z",
      updated_at: "2026-03-15T14:05:00Z",
    },
    {
      id: "oc_003",
      project_id: "proj_001",
      keyword: "high-end fashion blog",
      target_url: "https://purseblog.com/editorial/luxury-emerging-designers",
      target_email: "amanda.k@purseblog.com",
      contact_name: "Amanda Kline",
      outreach_draft: JSON.stringify({
        subject: "Re: Emerging designers feature — Sartelle Atelier",
        body: "Hi Amanda,\n\nI noticed your recent piece on emerging luxury designers — fantastic curation. Sartelle Atelier just launched our SS26 collection and we'd love to be considered for your next update.\n\nHappy to send lookbook images and press materials.\n\nBest,\nSartelle Atelier PR",
      }),
      status: "Sent",
      domain_authority: 68,
      relevance_score: 0.83,
      sent_at: "2026-03-14T10:00:00Z",
      replied_at: null,
      created_at: "2026-03-13T09:00:00Z",
      updated_at: "2026-03-14T10:00:00Z",
    },
    {
      id: "oc_004",
      project_id: "proj_001",
      keyword: "ethical fashion partnerships",
      target_url: "https://ecosalon.com/ethical-fashion-brands-to-watch",
      target_email: "laura.w@ecosalon.com",
      contact_name: "Laura Whitfield",
      outreach_draft: JSON.stringify({
        subject: "Partnership inquiry — Ethical fashion spotlight",
        body: "Hi Laura,\n\nEcoSalon has been our go-to resource for ethical fashion coverage. We'd be honored to partner on a feature about our supply chain transparency initiative.\n\nWe can provide exclusive behind-the-scenes content from our Tuscan workshop.\n\nLooking forward to hearing from you,\nSartelle Atelier",
      }),
      status: "Replied",
      domain_authority: 61,
      relevance_score: 0.79,
      sent_at: "2026-03-12T08:30:00Z",
      replied_at: "2026-03-13T15:20:00Z",
      created_at: "2026-03-11T12:00:00Z",
      updated_at: "2026-03-13T15:20:00Z",
    },
    {
      id: "oc_005",
      project_id: "proj_001",
      keyword: "luxury fashion SEO",
      target_url: "https://luxurydaily.com/seo-strategies-fashion",
      target_email: null,
      contact_name: null,
      outreach_draft: null,
      status: "Draft",
      domain_authority: 74,
      relevance_score: 0.76,
      sent_at: null,
      replied_at: null,
      created_at: "2026-03-15T14:10:00Z",
      updated_at: "2026-03-15T14:10:00Z",
    },
  ];

  // GET /api/projects/:projectId/outreach-campaigns
  app.get("/api/projects/:projectId/outreach-campaigns", (req, res) => {
    const { projectId } = req.params;
    const status = req.query.status as string | undefined;

    let campaigns = MOCK_OUTREACH_CAMPAIGNS.filter((c) => c.project_id === projectId);
    if (status) {
      campaigns = campaigns.filter((c) => c.status === status);
    }

    // Summary stats
    const all = MOCK_OUTREACH_CAMPAIGNS.filter((c) => c.project_id === projectId);
    const summary = {
      total: all.length,
      drafts: all.filter((c) => c.status === "Draft").length,
      sent: all.filter((c) => c.status === "Sent").length,
      replied: all.filter((c) => c.status === "Replied").length,
      approved: all.filter((c) => c.status === "Approved").length,
    };

    res.json({ success: true, campaigns, summary });
  });

  // GET /api/projects/:projectId/outreach-campaigns/:campaignId
  app.get("/api/projects/:projectId/outreach-campaigns/:campaignId", (req, res) => {
    const { campaignId } = req.params;
    const campaign = MOCK_OUTREACH_CAMPAIGNS.find((c) => c.id === campaignId);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
    res.json({ success: true, campaign });
  });

  // PATCH /api/projects/:projectId/outreach-campaigns/:campaignId
  // Update draft content or status (approve, edit)
  app.patch("/api/projects/:projectId/outreach-campaigns/:campaignId", (req, res) => {
    const { campaignId } = req.params;
    const campaign = MOCK_OUTREACH_CAMPAIGNS.find((c) => c.id === campaignId);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });

    const { outreach_draft, status } = req.body;
    if (outreach_draft !== undefined) campaign.outreach_draft = typeof outreach_draft === "string" ? outreach_draft : JSON.stringify(outreach_draft);
    if (status !== undefined) campaign.status = status;
    campaign.updated_at = new Date().toISOString();

    res.json({ success: true, campaign });
  });

  // POST /api/projects/:projectId/outreach-campaigns/:campaignId/send
  // Send an approved outreach email (mock — just flips status to Sent)
  app.post("/api/projects/:projectId/outreach-campaigns/:campaignId/send", (req, res) => {
    const { campaignId } = req.params;
    const campaign = MOCK_OUTREACH_CAMPAIGNS.find((c) => c.id === campaignId);
    if (!campaign) return res.status(404).json({ success: false, error: "Campaign not found" });
    if (campaign.status !== "Approved") {
      return res.status(400).json({ success: false, error: `Cannot send — status is "${campaign.status}", must be "Approved"` });
    }
    if (!campaign.target_email) {
      return res.status(400).json({ success: false, error: "No target email address" });
    }

    campaign.status = "Sent";
    campaign.sent_at = new Date().toISOString();
    campaign.updated_at = new Date().toISOString();

    res.json({ success: true, campaign, message_id: `msg_${Date.now()}` });
  });

  // POST /api/projects/:projectId/outreach-campaigns/prospect
  // Trigger prospecting pipeline (mock — returns simulated results)
  app.post("/api/projects/:projectId/outreach-campaigns/prospect", (req, res) => {
    const { keyword } = req.body;
    if (!keyword) return res.status(400).json({ success: false, error: "keyword is required" });

    // Mock: return a simulated prospect run result
    res.json({
      success: true,
      keyword,
      prospects_found: 8,
      drafts_created: 5,
      message: `Prospecting pipeline completed for "${keyword}". 5 new drafts ready for review.`,
    });
  });

  // ─────────────────────────────────────────────────────────
  // Phase 39: Internal Link Graph
  // ─────────────────────────────────────────────────────────

  const mockInternalLinks = [
    {
      id: "il_001",
      project_id: "proj_001",
      source_asset_id: "asset_401",
      source_title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
      source_slug: "zero-waste-supply-chain",
      target_asset_id: "asset_404",
      target_title: "The Future of Sustainable Luxury Materials",
      target_slug: "sustainable-luxury-materials-future",
      target_url: "https://sartelle-atelier.com/blog/sustainable-luxury-materials-future",
      anchor_text: "sustainable luxury materials",
      similarity_score: 0.91,
      status: "active" as const,
      injected_at: "2026-03-10T14:22:00Z",
      created_at: "2026-03-10T14:22:00Z",
    },
    {
      id: "il_002",
      project_id: "proj_001",
      source_asset_id: "asset_404",
      source_title: "The Future of Sustainable Luxury Materials",
      source_slug: "sustainable-luxury-materials-future",
      target_asset_id: "asset_401",
      target_title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
      target_slug: "zero-waste-supply-chain",
      target_url: "https://sartelle-atelier.com/blog/zero-waste-supply-chain",
      anchor_text: "zero-waste supply chain",
      similarity_score: 0.89,
      status: "active" as const,
      injected_at: "2026-03-10T14:22:05Z",
      created_at: "2026-03-10T14:22:05Z",
    },
    {
      id: "il_003",
      project_id: "proj_001",
      source_asset_id: "asset_402",
      source_title: "The Psychology of Haute Couture Pricing",
      source_slug: "haute-couture-pricing-psychology",
      target_asset_id: "asset_403",
      target_title: "Sartelle Atelier's Digital-First Fashion Week Strategy",
      target_slug: "digital-first-fashion-week",
      target_url: "https://sartelle-atelier.com/blog/digital-first-fashion-week",
      anchor_text: "digital fashion week strategy",
      similarity_score: 0.82,
      status: "active" as const,
      injected_at: "2026-03-11T09:15:00Z",
      created_at: "2026-03-11T09:15:00Z",
    },
    {
      id: "il_004",
      project_id: "proj_001",
      source_asset_id: "asset_403",
      source_title: "Sartelle Atelier's Digital-First Fashion Week Strategy",
      source_slug: "digital-first-fashion-week",
      target_asset_id: "asset_402",
      target_title: "The Psychology of Haute Couture Pricing",
      target_slug: "haute-couture-pricing-psychology",
      target_url: "https://sartelle-atelier.com/blog/haute-couture-pricing-psychology",
      anchor_text: "luxury pricing psychology",
      similarity_score: 0.78,
      status: "active" as const,
      injected_at: "2026-03-11T09:15:05Z",
      created_at: "2026-03-11T09:15:05Z",
    },
    {
      id: "il_005",
      project_id: "proj_001",
      source_asset_id: "asset_401",
      source_title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
      source_slug: "zero-waste-supply-chain",
      target_asset_id: "asset_403",
      target_title: "Sartelle Atelier's Digital-First Fashion Week Strategy",
      target_slug: "digital-first-fashion-week",
      target_url: "https://sartelle-atelier.com/blog/digital-first-fashion-week",
      anchor_text: "our digital-first strategy",
      similarity_score: 0.74,
      status: "active" as const,
      injected_at: "2026-03-12T11:30:00Z",
      created_at: "2026-03-12T11:30:00Z",
    },
    {
      id: "il_006",
      project_id: "proj_001",
      source_asset_id: "asset_403",
      source_title: "Sartelle Atelier's Digital-First Fashion Week Strategy",
      source_slug: "digital-first-fashion-week",
      target_asset_id: "asset_401",
      target_title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
      target_slug: "zero-waste-supply-chain",
      target_url: "https://sartelle-atelier.com/blog/zero-waste-supply-chain",
      anchor_text: "sustainable supply chain practices",
      similarity_score: 0.71,
      status: "active" as const,
      injected_at: "2026-03-12T11:30:05Z",
      created_at: "2026-03-12T11:30:05Z",
    },
    {
      id: "il_007",
      project_id: "proj_001",
      source_asset_id: "asset_402",
      source_title: "The Psychology of Haute Couture Pricing",
      source_slug: "haute-couture-pricing-psychology",
      target_asset_id: "asset_401",
      target_title: "How Sartelle Atelier Built a Zero-Waste Supply Chain",
      target_slug: "zero-waste-supply-chain",
      target_url: "https://sartelle-atelier.com/blog/zero-waste-supply-chain",
      anchor_text: "our zero-waste initiative",
      similarity_score: 0.69,
      status: "removed" as const,
      injected_at: "2026-03-08T16:00:00Z",
      created_at: "2026-03-08T16:00:00Z",
    },
  ];

  // GET /api/projects/:projectId/internal-links
  app.get("/api/projects/:projectId/internal-links", (_req, res) => {
    const projectId = _req.params.projectId;
    const statusFilter = _req.query.status as string | undefined;

    let links = mockInternalLinks.filter((l) => l.project_id === projectId);
    if (statusFilter) {
      links = links.filter((l) => l.status === statusFilter);
    }

    // Build graph summary
    const activeLinks = mockInternalLinks.filter(
      (l) => l.project_id === projectId && l.status === "active"
    );

    // Unique articles that participate in links
    const nodeSet = new Set<string>();
    for (const l of activeLinks) {
      nodeSet.add(l.source_asset_id);
      nodeSet.add(l.target_asset_id);
    }

    // Build node list with link counts
    const nodeMap = new Map<string, { id: string; title: string; slug: string; inbound: number; outbound: number }>();
    for (const l of activeLinks) {
      if (!nodeMap.has(l.source_asset_id)) {
        nodeMap.set(l.source_asset_id, { id: l.source_asset_id, title: l.source_title, slug: l.source_slug, inbound: 0, outbound: 0 });
      }
      if (!nodeMap.has(l.target_asset_id)) {
        nodeMap.set(l.target_asset_id, { id: l.target_asset_id, title: l.target_title, slug: l.target_slug, inbound: 0, outbound: 0 });
      }
      nodeMap.get(l.source_asset_id)!.outbound++;
      nodeMap.get(l.target_asset_id)!.inbound++;
    }

    const avgSimilarity = activeLinks.length > 0
      ? Number((activeLinks.reduce((sum, l) => sum + l.similarity_score, 0) / activeLinks.length).toFixed(2))
      : 0;

    res.json({
      links,
      graph: {
        nodes: Array.from(nodeMap.values()),
        edges: activeLinks.map((l) => ({
          source: l.source_asset_id,
          target: l.target_asset_id,
          anchor_text: l.anchor_text,
          similarity_score: l.similarity_score,
        })),
      },
      summary: {
        total_links: links.length,
        active_links: activeLinks.length,
        removed_links: links.filter((l) => l.status === "removed").length,
        articles_connected: nodeSet.size,
        avg_similarity: avgSimilarity,
      },
    });
  });

  // DELETE /api/projects/:projectId/internal-links/:linkId
  app.delete("/api/projects/:projectId/internal-links/:linkId", (req, res) => {
    const link = mockInternalLinks.find(
      (l) => l.id === req.params.linkId && l.project_id === req.params.projectId
    );
    if (!link) return res.status(404).json({ success: false, error: "Link not found" });

    link.status = "removed";
    res.json({ success: true, link });
  });

  // POST /api/projects/:projectId/internal-links/:linkId/restore
  app.post("/api/projects/:projectId/internal-links/:linkId/restore", (req, res) => {
    const link = mockInternalLinks.find(
      (l) => l.id === req.params.linkId && l.project_id === req.params.projectId
    );
    if (!link) return res.status(404).json({ success: false, error: "Link not found" });

    link.status = "active";
    res.json({ success: true, link });
  });

  // ── Phase 41: Mock Inventory Webhook ──────────────────────────

  const mockInventoryStore: Record<string, { available: number; updated_at: string; inventory_item_id: string; location_id: string; product_url: string }> = {
    "https://sartelleatelier.com/products/cashmere-wrap-coat": {
      available: 2,
      updated_at: "2026-03-13T20:09:00Z",
      inventory_item_id: "inv_90001",
      location_id: "loc_001",
      product_url: "https://sartelleatelier.com/products/cashmere-wrap-coat",
    },
    "https://sartelleatelier.com/products/silk-midi-skirt": {
      available: 0,
      updated_at: "2026-03-13T20:04:00Z",
      inventory_item_id: "inv_90002",
      location_id: "loc_001",
      product_url: "https://sartelleatelier.com/products/silk-midi-skirt",
    },
    "https://sartelleatelier.com/products/leather-biker-jacket": {
      available: 43,
      updated_at: "2026-03-13T19:50:00Z",
      inventory_item_id: "inv_90003",
      location_id: "loc_001",
      product_url: "https://sartelleatelier.com/products/leather-biker-jacket",
    },
  };

  // POST /api/webhooks/shopify/inventory (mock — simulates Shopify inventory_levels/update)
  app.post("/api/webhooks/shopify/inventory", (req, res) => {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    if (!hmac) {
      console.log("[Mock] Inventory webhook missing HMAC — accepting anyway in dev");
    }
    const body = req.body ?? {};
    const inventoryItemId = body.inventory_item_id || "inv_unknown";
    const available = body.available ?? 0;
    const locationId = body.location_id || "loc_001";

    // Find or create entry by inventory_item_id
    let productUrl = Object.keys(mockInventoryStore).find(
      (url) => mockInventoryStore[url].inventory_item_id === inventoryItemId
    ) || `https://sartelleatelier.com/products/item-${inventoryItemId}`;

    mockInventoryStore[productUrl] = {
      available,
      updated_at: new Date().toISOString(),
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      product_url: productUrl,
    };

    console.log(`[Mock] Inventory webhook: item=${inventoryItemId} qty=${available} url=${productUrl}`);

    // If low inventory, push a task into MOCK_TASKS
    if (available < 5) {
      MOCK_TASKS.unshift({
        id: `task_inv_${Date.now()}`,
        project_id: "proj_001",
        agent_type: "orchestrator",
        action: "Inventory Check",
        status: "Low_Inventory",
        task_description: `[circuit-breaker] Inventory update: item ${inventoryItemId} qty ${available} < threshold 5. Flagged Low_Inventory, compute rerouted.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    res.json({ received: true, stored: { product_url: productUrl, available } });
  });

  // GET /api/inventory/status (mock — returns current inventory store for debugging)
  app.get("/api/inventory/status", (_req, res) => {
    const items = Object.values(mockInventoryStore).map((item) => ({
      ...item,
      low: item.available < 5,
    }));
    res.json({ success: true, items, count: items.length });
  });

  return httpServer;
}
