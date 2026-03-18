/**
 * ============================================================
 * Phase 26: AI Manager API Routes
 * ============================================================
 *
 * POST /chat          — Send a message to the AI Manager
 * GET  /chat-history  — Fetch recent chat messages for UI hydration (Phase 61)
 * GET  /roadmap       — Fetch the current AI_Roadmap for a project
 * PATCH /roadmap/:taskId — Update a roadmap item status
 * POST /roadmap/:taskId/deploy — Approve & dispatch to Swarm
 * GET  /brand-context — Fetch the current Brand_Context
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";
import {
  handleManagerChat,
  fetchBrandContext,
  fetchRoadmap,
  fetchRecentChatHistory,
  type ChatMessage,
  type RoadmapItem,
} from "../utils/aiManager";

export const managerRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// POST /chat — Conversational AI Manager
// ─────────────────────────────────────────────────────────────

managerRouter.post("/chat", async (c) => {
  const body = await c.req.json<{
    project_id: string;
    messages: ChatMessage[];
  }>();

  const { project_id, messages } = body;

  if (!project_id || !messages || !Array.isArray(messages)) {
    return c.json(
      { success: false, error: "project_id and messages[] are required" },
      400
    );
  }

  try {
    const result = await handleManagerChat(project_id, messages, c.env);

    return c.json({
      success: true,
      reply: result.reply,
      brand_context_updated: result.brandContextUpdated,
      roadmap_items_added: result.roadmapItemsAdded,
    });
  } catch (err) {
    console.error(`[manager/chat] Error: ${err}`);
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Chat processing failed",
      },
      500
    );
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 61: GET /chat-history?project_id=xxx — Fetch recent chat for hydration
// ─────────────────────────────────────────────────────────────

managerRouter.get("/chat-history", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) {
    return c.json({ success: false, error: "project_id is required" }, 400);
  }

  try {
    const messages = await fetchRecentChatHistory(projectId, 50, c.env);

    return c.json({
      success: true,
      project_id: projectId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
      total: messages.length,
    });
  } catch (err) {
    console.error(`[manager/chat-history] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch chat history" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /roadmap?project_id=xxx — Fetch roadmap items
// ─────────────────────────────────────────────────────────────

managerRouter.get("/roadmap", async (c) => {
  const projectId = c.req.query("project_id") || "proj_001";

  try {
    const items = await fetchRoadmap(projectId, c.env);

    return c.json({
      success: true,
      project_id: projectId,
      items,
      total: items.length,
    });
  } catch (err) {
    console.error(`[manager/roadmap] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch roadmap" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /roadmap/:taskId — Update roadmap item status
// ─────────────────────────────────────────────────────────────

managerRouter.patch("/roadmap/:taskId", async (c) => {
  const { taskId } = c.req.param();
  const body = await c.req.json<{ status: string }>();

  const validStatuses = ["Suggested", "Approved", "In_Progress", "Completed"];
  if (!validStatuses.includes(body.status)) {
    return c.json(
      {
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      },
      400
    );
  }

  try {
    await c.env.DB.prepare(
      "UPDATE AI_Roadmap SET status = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(body.status, taskId)
      .run();

    return c.json({
      success: true,
      task_id: taskId,
      new_status: body.status,
    });
  } catch (err) {
    console.error(`[manager/roadmap] Update error: ${err}`);
    return c.json({ success: false, error: "Failed to update roadmap item" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /roadmap/:taskId/deploy — Approve & dispatch to Swarm
// ─────────────────────────────────────────────────────────────

managerRouter.post("/roadmap/:taskId/deploy", async (c) => {
  const { taskId } = c.req.param();

  try {
    // Fetch the roadmap item
    const item = await c.env.DB.prepare(
      "SELECT * FROM AI_Roadmap WHERE id = ?"
    )
      .bind(taskId)
      .first<RoadmapItem>();

    if (!item) {
      return c.json({ success: false, error: "Roadmap item not found" }, 404);
    }

    // Update status to Approved
    await c.env.DB.prepare(
      "UPDATE AI_Roadmap SET status = 'Approved', updated_at = datetime('now') WHERE id = ?"
    )
      .bind(taskId)
      .run();

    // Parse the action payload
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(item.action_payload || "{}");
    } catch {
      payload = {};
    }

    // Dispatch to the Durable Object (AgentWorkflowManager)
    const doId = c.env.AGENT_WORKFLOW.idFromName(item.project_id);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    // Determine the dispatch type from payload
    const actionType = (payload.type as string) || "content_generation";

    // Map action types to appropriate DO operations
    if (actionType === "content_generation" && payload.keyword) {
      // Trigger a full content workflow
      const doResponse = await doStub.fetch(
        new Request("https://do-internal/trigger", {
          method: "POST",
          body: JSON.stringify({
            projectId: item.project_id,
            keyword: payload.keyword as string,
            initiator: "api",
            metadata: {
              source: "ai_manager_roadmap",
              roadmap_item_id: taskId,
              ...payload,
            },
          }),
        })
      );
      const doResult = await doResponse.json();

      return c.json({
        success: true,
        task_id: taskId,
        status: "Approved",
        dispatch: "workflow_triggered",
        workflow_result: doResult,
      });
    }

    // For other action types, dispatch as an audit fix task
    const doResponse = await doStub.fetch(
      new Request("https://do-internal/dispatch", {
        method: "POST",
        body: JSON.stringify({
          projectId: item.project_id,
          title: item.title,
          description: item.description,
          category: mapActionTypeToCategory(actionType),
          priority: item.priority === "High" ? 1 : item.priority === "Medium" ? 2 : 3,
          effort: (payload.effort as string) || "medium",
          impact: (payload.impact as string) || "medium",
        }),
      })
    );
    const doResult = await doResponse.json();

    return c.json({
      success: true,
      task_id: taskId,
      status: "Approved",
      dispatch: "task_dispatched",
      dispatch_result: doResult,
    });
  } catch (err) {
    console.error(`[manager/deploy] Error: ${err}`);
    return c.json(
      { success: false, error: "Failed to deploy roadmap item" },
      500
    );
  }
});

// ─────────────────────────────────────────────────────────────
// GET /brand-context?project_id=xxx — Fetch brand memory
// ─────────────────────────────────────────────────────────────

managerRouter.get("/brand-context", async (c) => {
  const projectId = c.req.query("project_id") || "proj_001";

  try {
    const context = await fetchBrandContext(projectId, c.env);
    return c.json({
      success: true,
      project_id: projectId,
      context: context ?? null,
    });
  } catch (err) {
    console.error(`[manager/brand-context] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch brand context" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 52: Proprietary Reports Endpoints
// ─────────────────────────────────────────────────────────────

// GET /reports — List proprietary reports for a project
managerRouter.get("/reports", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) {
    return c.json({ success: false, error: "project_id is required" }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, domain_id, title, status, created_at, updated_at
       FROM Proprietary_Reports WHERE domain_id = ?
       ORDER BY created_at DESC LIMIT 20`
    ).bind(projectId).all();

    return c.json({
      success: true,
      project_id: projectId,
      reports: result.results ?? [],
      total: result.results?.length ?? 0,
    });
  } catch (err) {
    console.error(`[manager/reports] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch reports" }, 500);
  }
});

// GET /reports/:reportId — Get full report content
managerRouter.get("/reports/:reportId", async (c) => {
  const { reportId } = c.req.param();
  const projectId = c.req.query("project_id");
  if (!projectId) {
    return c.json({ success: false, error: "project_id is required" }, 400);
  }

  try {
    const report = await c.env.DB.prepare(
      `SELECT * FROM Proprietary_Reports WHERE id = ? AND domain_id = ?`
    ).bind(reportId, projectId).first();

    if (!report) {
      return c.json({ success: false, error: "Report not found" }, 404);
    }

    return c.json({ success: true, report });
  } catch (err) {
    console.error(`[manager/reports] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch report" }, 500);
  }
});

// POST /reports/:reportId/publish — Human-approved publishing
managerRouter.post("/reports/:reportId/publish", async (c) => {
  const { reportId } = c.req.param();
  const body = await c.req.json<{ project_id: string }>();
  const { project_id } = body;

  if (!project_id) {
    return c.json({ success: false, error: "project_id is required" }, 400);
  }

  try {
    const { publishReport } = await import("../cron/dataSynthesizer");
    const result = await publishReport(reportId, project_id, c.env);
    return c.json(result);
  } catch (err) {
    console.error(`[manager/reports/publish] Error: ${err}`);
    return c.json({ success: false, error: "Publish failed" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 53: AI Telemetry Status Endpoint
// ─────────────────────────────────────────────────────────────

managerRouter.get("/telemetry-status", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) {
    return c.json({ success: false, error: "project_id is required" }, 400);
  }

  try {
    const [ragCache, reports, contentCount] = await Promise.all([
      c.env.CONFIG_KV.get(`rag:summaries:${projectId}`),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM Proprietary_Reports WHERE domain_id = ?`
      ).bind(projectId).first<{ cnt: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM Content_Queue WHERE domain_id = ? AND status = 'published'`
      ).bind(projectId).first<{ cnt: number }>(),
    ]);

    return c.json({
      success: true,
      status: {
        llms_txt: {
          active: true,
          description: "Translating website architecture into /llms.txt format for AI engines",
          last_generated: new Date().toISOString(),
        },
        rag_bait: {
          active: !!ragCache,
          summaries_cached: ragCache ? Object.keys(JSON.parse(ragCache).summaries || {}).length : 0,
          description: "Injecting structured answer blocks visible to AI crawlers",
        },
        proprietary_reports: {
          total: reports?.cnt ?? 0,
          description: "First-party research reports for citation authority",
        },
        content_indexed: {
          total: contentCount?.cnt ?? 0,
          description: "Published content pieces feeding /llms.txt",
        },
        data_synthesizer: {
          active: true,
          schedule: "Weekly (Sundays 03:00 UTC)",
          description: "Scanning for data milestones to generate proprietary reports",
        },
      },
    });
  } catch (err) {
    console.error(`[manager/telemetry-status] Error: ${err}`);
    return c.json({ success: false, error: "Telemetry fetch failed" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Helper — map action types to audit categories
// ─────────────────────────────────────────────────────────────

function mapActionTypeToCategory(
  actionType: string
): "performance" | "seo" | "accessibility" | "security" | "content" {
  switch (actionType) {
    case "technical_audit":
    case "page_optimization":
      return "performance";
    case "schema_markup":
    case "link_building":
      return "seo";
    case "content_generation":
    case "content_refresh":
      return "content";
    default:
      return "seo";
  }
}
