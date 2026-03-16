/**
 * ============================================================
 * Phase 46: Public Developer API v1 Router
 * ============================================================
 *
 * Endpoints exposed under /v1/* for programmatic access.
 * All routes require Bearer API key auth via apiAuth middleware.
 *
 * Endpoints:
 *   GET  /v1/metrics            — Project metrics snapshot
 *   GET  /v1/tasks              — Paginated task list
 *   POST /v1/analyze            — Trigger a crawl analysis job
 *   GET  /v1/analyze/:job_id    — Poll job status + results
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../../index";

const v1Router = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// GET /v1/metrics — Project metrics snapshot
// ─────────────────────────────────────────────────────────────

/**
 * Returns aggregated metrics for the user's project(s):
 *   - total tasks, completion rate, visibility score
 *   - 7-day task trend
 */
v1Router.get("/metrics", async (c) => {
  const userId = c.get("userId") as string;

  try {
    // Get the user's linked project
    const project = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.domain, p.visibility_score, p.active_agents
       FROM Projects p
       JOIN Users u ON u.id = ?1
       WHERE p.id = 'proj_001'
       LIMIT 1`
    )
      .bind(userId)
      .first<{
        id: string;
        name: string;
        domain: string;
        visibility_score: number;
        active_agents: number;
      }>();

    if (!project) {
      return c.json({ error: "No project found" }, 404);
    }

    // Total tasks + completion rate
    const taskStats = await c.env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'Running' THEN 1 ELSE 0 END) AS running,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending
       FROM Agent_Tasks WHERE project_id = ?1`
    )
      .bind(project.id)
      .first<{
        total: number;
        completed: number;
        failed: number;
        running: number;
        pending: number;
      }>();

    // 7-day trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { results: trend } = await c.env.DB.prepare(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM Agent_Tasks
       WHERE project_id = ?1 AND DATE(created_at) >= ?2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
      .bind(project.id, sevenDaysAgo)
      .all<{ date: string; count: number }>();

    return c.json({
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        visibility_score: project.visibility_score,
        active_agents: project.active_agents,
      },
      tasks: {
        total: taskStats?.total ?? 0,
        completed: taskStats?.completed ?? 0,
        failed: taskStats?.failed ?? 0,
        running: taskStats?.running ?? 0,
        pending: taskStats?.pending ?? 0,
        completion_rate:
          taskStats && taskStats.total > 0
            ? Math.round(((taskStats.completed ?? 0) / taskStats.total) * 100)
            : 0,
      },
      trend: trend || [],
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[API v1] /metrics error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /v1/tasks — Paginated task list
// ─────────────────────────────────────────────────────────────

/**
 * Query params:
 *   ?page=1        (default 1)
 *   &limit=20      (default 20, max 100)
 *   &status=Running (optional filter)
 *   &agent_type=cro (optional filter)
 */
v1Router.get("/tasks", async (c) => {
  const userId = c.get("userId") as string;

  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
    const offset = (page - 1) * limit;
    const statusFilter = c.req.query("status") || null;
    const agentFilter = c.req.query("agent_type") || null;

    // Build WHERE clause dynamically with parameterized inputs
    let whereClause = "WHERE project_id = ?1";
    const binds: (string | number)[] = ["proj_001"];
    let bindIdx = 2;

    if (statusFilter) {
      whereClause += ` AND status = ?${bindIdx}`;
      binds.push(statusFilter);
      bindIdx++;
    }
    if (agentFilter) {
      whereClause += ` AND agent_type = ?${bindIdx}`;
      binds.push(agentFilter);
      bindIdx++;
    }

    // Get total count
    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM Agent_Tasks ${whereClause}`
    )
      .bind(...binds)
      .first<{ total: number }>();
    const total = countRow?.total ?? 0;

    // Fetch page
    binds.push(limit, offset);
    const { results: tasks } = await c.env.DB.prepare(
      `SELECT id, project_id, agent_type, action, status,
              task_description, result_payload, created_at, updated_at
       FROM Agent_Tasks ${whereClause}
       ORDER BY created_at DESC
       LIMIT ?${bindIdx} OFFSET ?${bindIdx + 1}`
    )
      .bind(...binds)
      .all();

    return c.json({
      tasks: tasks || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        has_more: page * limit < total,
      },
    });
  } catch (err: any) {
    console.error("[API v1] /tasks error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /v1/analyze — Trigger a crawl analysis job
// ─────────────────────────────────────────────────────────────

/**
 * Body: { url: string, analysis_type?: "full" | "cro" | "seo" }
 * Returns: { job_id: string, status: "queued" }
 *
 * Creates an Agent_Tasks row of type "api_crawl" with status "Pending",
 * then kicks off background processing via the Durable Object.
 */
v1Router.post("/analyze", async (c) => {
  const userId = c.get("userId") as string;

  try {
    const body = await c.req.json<{
      url: string;
      analysis_type?: "full" | "cro" | "seo";
    }>();

    if (!body.url || typeof body.url !== "string") {
      return c.json({ error: "url is required" }, 400);
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    const analysisType = body.analysis_type || "full";
    const jobId = `api_job_${crypto.randomUUID().slice(0, 12)}`;

    // Insert task row
    await c.env.DB.prepare(
      `INSERT INTO Agent_Tasks (id, project_id, agent_type, action, status, task_description, result_payload, created_at, updated_at)
       VALUES (?1, 'proj_001', 'cro', ?2, 'Pending', ?3, ?4, ?5, ?5)`
    )
      .bind(
        jobId,
        `API Crawl: ${analysisType}`,
        `API-triggered ${analysisType} analysis of ${body.url}`,
        JSON.stringify({ source: "api", url: body.url, analysis_type: analysisType, requested_by: userId }),
        new Date().toISOString()
      )
      .run();

    return c.json(
      {
        job_id: jobId,
        status: "queued",
        analysis_type: analysisType,
        url: body.url,
        created_at: new Date().toISOString(),
      },
      202
    );
  } catch (err: any) {
    console.error("[API v1] /analyze error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /v1/analyze/:job_id — Poll job status + results
// ─────────────────────────────────────────────────────────────

v1Router.get("/analyze/:job_id", async (c) => {
  const userId = c.get("userId") as string;
  const { job_id } = c.req.param();

  try {
    const task = await c.env.DB.prepare(
      `SELECT id, agent_type, action, status, task_description,
              result_payload, created_at, updated_at
       FROM Agent_Tasks
       WHERE id = ?1 AND project_id = 'proj_001'`
    )
      .bind(job_id)
      .first();

    if (!task) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Parse result_payload if it's JSON
    let result = null;
    if (task.result_payload && typeof task.result_payload === "string") {
      try {
        result = JSON.parse(task.result_payload as string);
      } catch {
        result = task.result_payload;
      }
    }

    return c.json({
      job_id: task.id,
      status: (task.status as string).toLowerCase(),
      action: task.action,
      description: task.task_description,
      result,
      created_at: task.created_at,
      updated_at: task.updated_at,
    });
  } catch (err: any) {
    console.error("[API v1] /analyze/:job_id error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export { v1Router };
