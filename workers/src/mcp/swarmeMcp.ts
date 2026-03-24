/**
 * ============================================================
 * Swarme — Phase 3: MCP Server (Model Context Protocol)
 * ============================================================
 *
 * Exposes 7 Swarme tools via MCP so Claude, GPT, and other
 * AI models can call them natively through Cloudflare AI Gateway
 * or any MCP-compatible client.
 *
 * Tools:
 *   1. swarme-gsc-report       — Google Search Console data
 *   2. swarme-ga4-report       — Google Analytics 4 metrics
 *   3. swarme-site-audit       — Trigger site audit
 *   4. swarme-content-draft    — Draft article (requires approval)
 *   5. swarme-roadmap-status   — Strategy roadmap overview
 *   6. swarme-competitor-pulse — Competitor analysis
 *   7. swarme-hive-insight     — Global Hive Mind state
 *
 * Architecture:
 *   McpAgent (Durable Object) → MCP Server → tools → D1/KV/R2
 *   Mounted at /mcp on the worker
 * ============================================================
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../index";

interface McpState {
  requestCount: number;
}

export class SwarmeMcpAgent extends McpAgent<Env, McpState, {}> {
  initialState: McpState = {
    requestCount: 0,
  };

  server = new McpServer({
    name: "Swarme Platform",
    version: "1.0.0",
  });

  async init() {
    // ── Tool 1: GSC Report ────────────────────────────────
    this.server.tool(
      "swarme-gsc-report",
      "Fetch Google Search Console performance data (clicks, impressions, CTR, position) for a Swarme project",
      { project_id: z.string().describe("The Swarme project ID"), days: z.number().optional().describe("Number of days to fetch (default 28)") },
      async ({ project_id, days }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const limit = days || 28;
        const metrics = await this.env.DB.prepare(
          `SELECT date, clicks, impressions, ctr, position FROM GSC_Metrics WHERE project_id = ?1 ORDER BY date DESC LIMIT ?2`,
        ).bind(project_id, limit).all();

        const rows = metrics.results || [];
        const totalClicks = rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
        const totalImpressions = rows.reduce((s: number, r: any) => s + (r.impressions || 0), 0);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              project_id,
              days: rows.length,
              total_clicks: totalClicks,
              total_impressions: totalImpressions,
              avg_ctr: rows.length ? (totalClicks / totalImpressions * 100).toFixed(2) + "%" : "N/A",
              daily_metrics: rows,
            }, null, 2),
          }],
        };
      },
    );

    // ── Tool 2: GA4 Report ────────────────────────────────
    this.server.tool(
      "swarme-ga4-report",
      "Fetch Google Analytics 4 metrics (bounce rate, session duration, conversions) for a Swarme project",
      { project_id: z.string().describe("The Swarme project ID") },
      async ({ project_id }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const metrics = await this.env.DB.prepare(
          `SELECT metric_date, bounce_rate, session_duration, conversion_rate, device_type
           FROM GA4_Metrics WHERE project_id = ?1 ORDER BY metric_date DESC LIMIT 14`,
        ).bind(project_id).all();

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ project_id, metrics: metrics.results || [] }, null, 2),
          }],
        };
      },
    );

    // ── Tool 3: Site Audit ────────────────────────────────
    this.server.tool(
      "swarme-site-audit",
      "Trigger a site audit (SEO, accessibility, performance) and return the latest results",
      { project_id: z.string(), audit_type: z.enum(["full", "seo", "accessibility", "performance"]).optional() },
      async ({ project_id, audit_type }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const latest = await this.env.DB.prepare(
          `SELECT id, health_score, findings, roadmap, status, created_at
           FROM Audits WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1`,
        ).bind(project_id).first();

        if (!latest) {
          // Queue a new audit
          await this.env.DB.prepare(
            `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
             VALUES (?1, 'auditor', ?2, 'Queued', ?3)`,
          ).bind(project_id, audit_type || "full", `MCP-triggered ${audit_type || "full"} audit`).run();

          return { content: [{ type: "text" as const, text: `No previous audit found. A new ${audit_type || "full"} audit has been queued.` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              health_score: (latest as any).health_score,
              status: (latest as any).status,
              created_at: (latest as any).created_at,
              findings: JSON.parse((latest as any).findings || "[]").slice(0, 10),
              roadmap_items: JSON.parse((latest as any).roadmap || "[]").length,
            }, null, 2),
          }],
        };
      },
    );

    // ── Tool 4: Content Draft ─────────────────────────────
    this.server.tool(
      "swarme-content-draft",
      "Create a content draft that requires human approval before publishing. Swarme NEVER auto-publishes.",
      { project_id: z.string(), topic: z.string(), keywords: z.array(z.string()).optional(), tone: z.string().optional() },
      async ({ project_id, topic, keywords, tone }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const approvalId = `appr_${crypto.randomUUID().slice(0, 12)}`;

        await this.env.DB.prepare(
          `INSERT INTO Agent_Approvals (id, project_id, agent_type, action, description, payload, status, created_at)
           VALUES (?1, ?2, 'content', 'draft_article', ?3, ?4, 'pending', datetime('now'))`,
        ).bind(
          approvalId, project_id,
          `MCP content draft: "${topic}"`,
          JSON.stringify({ topic, keywords: keywords || [], tone: tone || "professional" }),
        ).run();

        return {
          content: [{
            type: "text" as const,
            text: `Content draft queued for approval (ID: ${approvalId}). Topic: "${topic}". A human operator must approve before publishing.`,
          }],
        };
      },
    );

    // ── Tool 5: Roadmap Status ────────────────────────────
    this.server.tool(
      "swarme-roadmap-status",
      "Get the current strategy roadmap status including suggested, active, and completed items",
      { project_id: z.string() },
      async ({ project_id }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const items = await this.env.DB.prepare(
          `SELECT id, title, priority, status, created_at FROM AI_Roadmap WHERE project_id = ?1
           ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 END`,
        ).bind(project_id).all();

        const rows = items.results || [];
        const counts: Record<string, number> = {};
        for (const r of rows) counts[(r as any).status] = (counts[(r as any).status] || 0) + 1;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ project_id, total: rows.length, status_breakdown: counts, items: rows.slice(0, 20) }, null, 2),
          }],
        };
      },
    );

    // ── Tool 6: Competitor Pulse ──────────────────────────
    this.server.tool(
      "swarme-competitor-pulse",
      "Analyze competitors for a project — returns visibility gaps and citation opportunities",
      { project_id: z.string(), competitor_urls: z.array(z.string()).optional() },
      async ({ project_id, competitor_urls }) => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        // Fetch existing competitor data from D1
        const gaps = await this.env.DB.prepare(
          `SELECT keyword, current_rank, gap_type, competitor_url
           FROM Keywords WHERE project_id = ?1 AND gap_type IS NOT NULL
           ORDER BY search_volume DESC LIMIT 20`,
        ).bind(project_id).all();

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              project_id,
              competitor_urls: competitor_urls || [],
              visibility_gaps: gaps.results || [],
              gap_count: gaps.results?.length || 0,
            }, null, 2),
          }],
        };
      },
    );

    // ── Tool 7: Hive Insight ──────────────────────────────
    this.server.tool(
      "swarme-hive-insight",
      "Query the Swarme Hive Mind for global rules, circuit breaker status, and system health",
      {},
      async () => {
        this.setState({ ...this.state, requestCount: this.state.requestCount + 1 });
        const rules = await this.env.HIVE_MIND.list({ prefix: "hive:rules:" });
        const pulseRaw = await this.env.CONFIG_KV.get("pulse:latest_snapshot");
        const emergencyRaw = await this.env.CONFIG_KV.get("global:emergency_stop");

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              hive_rules: rules.keys.map((k) => k.name.replace("hive:rules:", "")),
              rule_count: rules.keys.length,
              pulse_snapshot: pulseRaw ? JSON.parse(pulseRaw) : null,
              emergency_stop: emergencyRaw ? JSON.parse(emergencyRaw) : { activated: false },
            }, null, 2),
          }],
        };
      },
    );
  }
}
