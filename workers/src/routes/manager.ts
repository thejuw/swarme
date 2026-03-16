/**
 * ============================================================
 * Phase 26: AI Manager API Routes
 * ============================================================
 *
 * POST /chat          — Send a message to the AI Manager
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
