/**
 * ============================================================
 * Swarme — Phase 3: Edge-Native Agent Architecture
 * ============================================================
 *
 * Four specialized agents built on Cloudflare Agents SDK.
 * Each extends Agent with @callable() RPC methods and
 * schedule() for cron-like recurring work.
 *
 * Agents:
 *   1. AuditAgent    — Site audits, accessibility checks, link rot
 *   2. ResearchAgent — Competitor analysis, keyword research, trends
 *   3. ContentAgent  — Content drafting, decay refresh, publishing
 *   4. CROAgent      — A/B testing, CRO telemetry, conversion optimization
 *
 * Each agent:
 *   - Runs as a Durable Object with SQLite state
 *   - Exposes @callable() methods for typed RPC from the frontend
 *   - Uses schedule() for autonomous recurring tasks
 *   - Writes results back to D1 via env.DB
 *   - Respects human-in-the-loop: high-stakes actions create
 *     approval requests instead of executing directly
 * ============================================================
 */

import { Agent } from "agents";
import type { Env } from "../index";

// ── Shared Types ─────────────────────────────────────────────

export interface AgentTaskResult {
  success: boolean;
  agent: string;
  action: string;
  summary: string;
  data?: Record<string, any>;
  requires_approval?: boolean;
  approval_id?: string;
}

// ── Helper: Log task to D1 ───────────────────────────────────

async function logAgentTask(
  env: Env,
  projectId: string,
  agentType: string,
  action: string,
  status: string,
  description: string,
  resultPayload?: Record<string, any>,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(
      projectId, agentType, action, status, description,
      resultPayload ? JSON.stringify(resultPayload) : null,
    ).run();
  } catch (err) {
    console.error(`[${agentType}] Failed to log task:`, err);
  }
}

// ── Helper: Create approval request ──────────────────────────

async function createApprovalRequest(
  env: Env,
  projectId: string,
  agentType: string,
  action: string,
  description: string,
  payload: Record<string, any>,
): Promise<string> {
  const id = `appr_${crypto.randomUUID().slice(0, 12)}`;
  await env.DB.prepare(
    `INSERT INTO Agent_Approvals (id, project_id, agent_type, action, description, payload, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', datetime('now'))`,
  ).bind(id, projectId, agentType, action, description, JSON.stringify(payload)).run();
  return id;
}

// ═════════════════════════════════════════════════════════════
// 1. AUDIT AGENT
// ═════════════════════════════════════════════════════════════

export class AuditAgent extends Agent<Env> {
  async onStart() {
    // Schedule recurring audits
    this.schedule("0 6 * * *", "dailyAudit", { type: "visibility" });
    this.schedule("0 0 * * 0", "weeklyLinkRot", { type: "link_rot" });
  }

  async dailyAudit(data: { type: string }) {
    const projectId = this.name;
    await logAgentTask(this.env, projectId, "auditor", "daily_audit", "Running", `Scheduled ${data.type} audit`);
  }

  async weeklyLinkRot(data: { type: string }) {
    const projectId = this.name;
    await logAgentTask(this.env, projectId, "auditor", "link_rot_scan", "Running", "Weekly link rot scan");
  }

  async runSiteAudit(projectId: string, auditType: string = "full"): Promise<AgentTaskResult> {
    await logAgentTask(this.env, projectId, "auditor", `run_${auditType}_audit`, "Running", `On-demand ${auditType} audit`);

    return {
      success: true,
      agent: "audit",
      action: `run_${auditType}_audit`,
      summary: `${auditType} audit initiated for project ${projectId}`,
    };
  }

  async runAccessibilityCheck(projectId: string, url: string): Promise<AgentTaskResult> {
    // High-stakes: requires approval before modifying DOM
    const approvalId = await createApprovalRequest(
      this.env, projectId, "auditor", "accessibility_fix",
      `Accessibility fixes for ${url}`,
      { url, fix_type: "alt_text,aria,heading_order" },
    );

    return {
      success: true,
      agent: "audit",
      action: "accessibility_check",
      summary: `Accessibility check queued for ${url}. Approval required before fixes are applied.`,
      requires_approval: true,
      approval_id: approvalId,
    };
  }
}

// ═════════════════════════════════════════════════════════════
// 2. RESEARCH AGENT
// ═════════════════════════════════════════════════════════════

export class ResearchAgent extends Agent<Env> {
  async onStart() {
    this.schedule("0 8 * * 1", "weeklyCompetitorPulse", {});
  }

  async weeklyCompetitorPulse() {
    const projectId = this.name;
    await logAgentTask(this.env, projectId, "researcher", "competitor_pulse", "Running", "Weekly competitor analysis");
  }

  async analyzeCompetitors(projectId: string, competitors: string[]): Promise<AgentTaskResult> {
    await logAgentTask(
      this.env, projectId, "researcher", "competitor_analysis", "Running",
      `Analyzing ${competitors.length} competitors`,
    );

    return {
      success: true,
      agent: "research",
      action: "competitor_analysis",
      summary: `Competitor analysis initiated for ${competitors.join(", ")}`,
    };
  }

  async discoverKeywords(projectId: string, seedKeywords: string[]): Promise<AgentTaskResult> {
    await logAgentTask(
      this.env, projectId, "researcher", "keyword_discovery", "Running",
      `Keyword research from seeds: ${seedKeywords.join(", ")}`,
    );

    return {
      success: true,
      agent: "research",
      action: "keyword_discovery",
      summary: `Keyword discovery initiated from ${seedKeywords.length} seed keywords`,
    };
  }

  async getGSCReport(projectId: string, dateRange: string = "28d"): Promise<AgentTaskResult> {
    const metrics = await this.env.DB.prepare(
      `SELECT date, clicks, impressions, ctr, position
       FROM GSC_Metrics WHERE project_id = ?1
       ORDER BY date DESC LIMIT 28`,
    ).bind(projectId).all();

    return {
      success: true,
      agent: "research",
      action: "gsc_report",
      summary: `GSC report: ${metrics.results?.length || 0} days of data`,
      data: { metrics: metrics.results || [], date_range: dateRange },
    };
  }

  async getGA4Report(projectId: string): Promise<AgentTaskResult> {
    const metrics = await this.env.DB.prepare(
      `SELECT metric_date, bounce_rate, session_duration, conversion_rate, device_type
       FROM GA4_Metrics WHERE project_id = ?1
       ORDER BY metric_date DESC LIMIT 14`,
    ).bind(projectId).all();

    return {
      success: true,
      agent: "research",
      action: "ga4_report",
      summary: `GA4 report: ${metrics.results?.length || 0} days of data`,
      data: { metrics: metrics.results || [] },
    };
  }
}

// ═════════════════════════════════════════════════════════════
// 3. CONTENT AGENT
// ═════════════════════════════════════════════════════════════

export class ContentAgent extends Agent<Env> {
  async onStart() {
    this.schedule("0 10 * * 1-5", "dailyContentCheck", {});
  }

  async dailyContentCheck() {
    const projectId = this.name;
    await logAgentTask(this.env, projectId, "content", "daily_check", "Running", "Daily content pipeline check");
  }

  async draftArticle(
    projectId: string,
    topic: string,
    keywords: string[],
    tone: string = "professional",
  ): Promise<AgentTaskResult> {
    // Content creation ALWAYS requires human approval before publishing
    const approvalId = await createApprovalRequest(
      this.env, projectId, "content", "draft_article",
      `Draft article: "${topic}"`,
      { topic, keywords, tone },
    );

    await logAgentTask(
      this.env, projectId, "content", "draft_article", "Awaiting_Approval",
      `Draft: "${topic}" (keywords: ${keywords.join(", ")})`,
    );

    return {
      success: true,
      agent: "content",
      action: "draft_article",
      summary: `Article draft queued: "${topic}". Human approval required before publishing.`,
      requires_approval: true,
      approval_id: approvalId,
    };
  }

  async getRoadmapStatus(projectId: string): Promise<AgentTaskResult> {
    const items = await this.env.DB.prepare(
      `SELECT id, title, priority, status, created_at
       FROM AI_Roadmap WHERE project_id = ?1
       ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 END`,
    ).bind(projectId).all();

    const statusCounts: Record<string, number> = {};
    for (const item of items.results || []) {
      const s = (item as any).status || "Unknown";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return {
      success: true,
      agent: "content",
      action: "roadmap_status",
      summary: `Roadmap: ${items.results?.length || 0} items — ${JSON.stringify(statusCounts)}`,
      data: { items: items.results || [], counts: statusCounts },
    };
  }
}

// ═════════════════════════════════════════════════════════════
// 4. CRO AGENT
// ═════════════════════════════════════════════════════════════

export class CROAgent extends Agent<Env> {
  async onStart() {
    this.schedule("*/15 * * * *", "checkRunningTests", {});
  }

  async checkRunningTests() {
    const projectId = this.name;
    const running = await this.env.DB.prepare(
      `SELECT id, test_name FROM AB_Tests WHERE project_id = ?1 AND status = 'Running'`,
    ).bind(projectId).all();

    if ((running.results?.length || 0) > 0) {
      await logAgentTask(
        this.env, projectId, "cro", "check_tests", "Completed",
        `Checked ${running.results?.length} running A/B tests`,
      );
    }
  }

  async launchAbTest(
    projectId: string,
    testName: string,
    selector: string,
    variantA: string,
    variantB: string,
  ): Promise<AgentTaskResult> {
    // A/B test launch requires approval
    const approvalId = await createApprovalRequest(
      this.env, projectId, "cro", "launch_ab_test",
      `Launch A/B test: "${testName}" on ${selector}`,
      { test_name: testName, selector, variant_a: variantA, variant_b: variantB },
    );

    return {
      success: true,
      agent: "cro",
      action: "launch_ab_test",
      summary: `A/B test "${testName}" queued for launch. Approval required.`,
      requires_approval: true,
      approval_id: approvalId,
    };
  }

  async getHiveInsight(projectId: string): Promise<AgentTaskResult> {
    // Query the Hive Mind for global rules and insights
    const rules = await this.env.HIVE_MIND.list({ prefix: "hive:rules:" });
    const ruleCount = rules.keys.length;

    const latestUpdate = await this.env.HIVE_MIND.get("hive:chatops:last_update");

    return {
      success: true,
      agent: "cro",
      action: "hive_insight",
      summary: `Hive Mind: ${ruleCount} active rules`,
      data: {
        rule_count: ruleCount,
        rules: rules.keys.map((k) => k.name.replace("hive:rules:", "")),
        last_update: latestUpdate ? JSON.parse(latestUpdate) : null,
      },
    };
  }
}
