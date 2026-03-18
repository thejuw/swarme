/**
 * ============================================================
 * Swarme — Phase 65.5: Global Governance API
 * ============================================================
 *
 * CRUD endpoints for the Global_Rule_Approvals ledger.
 * Enterprise tenants must explicitly approve or reject each
 * Global Hive Mind rule before it affects their AI Manager.
 *
 * All endpoints are domain-scoped (JWT-authenticated) and
 * require the domain_id from the authenticated user's context.
 *
 * Routes:
 *   GET  /api/governance/rules            — List all rules with approval status
 *   GET  /api/governance/rules/pending     — List only pending rules
 *   POST /api/governance/rules/:ruleId     — Approve or reject a rule
 *   GET  /api/governance/status            — Governance stats for the domain
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";
import { fetchGlobalRules, type GlobalRule } from "../../utils/hiveSync";

// ── Types ───────────────────────────────────────────────────

interface ApprovalRow {
  rule_id: string;
  domain_id: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface RuleWithApproval extends GlobalRule {
  approval_status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
}

// ── Router ──────────────────────────────────────────────────

export const governanceRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/governance/rules
 * Returns all active global rules with their approval status for
 * the authenticated user's domain. Pending rules that don't yet
 * have an approval row are auto-seeded as "pending".
 */
governanceRouter.get("/rules", async (c) => {
  const domainId = c.get("domainId" as never) as string | undefined;
  if (!domainId) {
    return c.json({ success: false, error: "No domain context" }, 400);
  }

  try {
    // Fetch all active global rules from KV
    const allRules = await fetchGlobalRules(c.env);

    if (allRules.length === 0) {
      return c.json({ success: true, rules: [], counts: { total: 0, pending: 0, approved: 0, rejected: 0 } });
    }

    // Fetch existing approval rows for this domain
    const approvalRows = await c.env.DB.prepare(
      `SELECT rule_id, status, reviewed_by, reviewed_at
       FROM Global_Rule_Approvals
       WHERE domain_id = ?1`,
    )
      .bind(domainId)
      .all<ApprovalRow>();

    const approvalMap = new Map<string, ApprovalRow>();
    for (const row of approvalRows.results ?? []) {
      approvalMap.set(row.rule_id, row);
    }

    // Auto-seed pending rows for any rules that don't have an approval record yet
    const unseeded: string[] = [];
    for (const rule of allRules) {
      if (!approvalMap.has(rule.id)) {
        unseeded.push(rule.id);
      }
    }

    for (const ruleId of unseeded) {
      try {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO Global_Rule_Approvals (rule_id, domain_id, status)
           VALUES (?1, ?2, 'pending')`,
        )
          .bind(ruleId, domainId)
          .run();
      } catch {
        // Non-fatal — row may already exist from a concurrent request
      }
    }

    // Build enriched response
    const rulesWithApproval: RuleWithApproval[] = allRules.map((rule) => {
      const approval = approvalMap.get(rule.id);
      return {
        ...rule,
        approval_status: (approval?.status as RuleWithApproval["approval_status"]) ?? "pending",
        reviewed_by: approval?.reviewed_by ?? null,
        reviewed_at: approval?.reviewed_at ?? null,
      };
    });

    // Count by status
    const counts = { total: rulesWithApproval.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of rulesWithApproval) {
      counts[r.approval_status]++;
    }

    return c.json({ success: true, rules: rulesWithApproval, counts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * GET /api/governance/rules/pending
 * Returns only pending (unreviewed) global rules for this domain.
 * Used by the NetworkAlert component to show action cards.
 */
governanceRouter.get("/rules/pending", async (c) => {
  const domainId = c.get("domainId" as never) as string | undefined;
  if (!domainId) {
    return c.json({ success: false, error: "No domain context" }, 400);
  }

  try {
    const allRules = await fetchGlobalRules(c.env);
    if (allRules.length === 0) {
      return c.json({ success: true, rules: [] });
    }

    // Get approved + rejected rule_ids for this domain
    const reviewedRows = await c.env.DB.prepare(
      `SELECT rule_id FROM Global_Rule_Approvals
       WHERE domain_id = ?1 AND status IN ('approved', 'rejected')`,
    )
      .bind(domainId)
      .all<{ rule_id: string }>();

    const reviewedIds = new Set(
      (reviewedRows.results ?? []).map((r) => r.rule_id),
    );

    // Pending = all rules minus reviewed ones
    const pendingRules = allRules.filter((r) => !reviewedIds.has(r.id));

    // Auto-seed pending rows
    for (const rule of pendingRules) {
      try {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO Global_Rule_Approvals (rule_id, domain_id, status)
           VALUES (?1, ?2, 'pending')`,
        )
          .bind(rule.id, domainId)
          .run();
      } catch {
        // Non-fatal
      }
    }

    return c.json({ success: true, rules: pendingRules });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * POST /api/governance/rules/:ruleId
 * Approve or reject a specific global rule for this domain.
 *
 * Body: { "action": "approved" | "rejected" }
 */
governanceRouter.post("/rules/:ruleId", async (c) => {
  const domainId = c.get("domainId" as never) as string | undefined;
  const userEmail = c.get("userEmail" as never) as string | undefined;
  if (!domainId) {
    return c.json({ success: false, error: "No domain context" }, 400);
  }

  const ruleId = c.req.param("ruleId");
  if (!ruleId) {
    return c.json({ success: false, error: "Missing ruleId" }, 400);
  }

  let body: { action?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const action = body.action;
  if (action !== "approved" && action !== "rejected") {
    return c.json(
      { success: false, error: "action must be 'approved' or 'rejected'" },
      400,
    );
  }

  try {
    const now = new Date().toISOString();

    // Upsert the approval row
    await c.env.DB.prepare(
      `INSERT INTO Global_Rule_Approvals (rule_id, domain_id, status, reviewed_by, reviewed_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (rule_id, domain_id) DO UPDATE
       SET status = ?3, reviewed_by = ?4, reviewed_at = ?5`,
    )
      .bind(ruleId, domainId, action, userEmail ?? null, now)
      .run();

    return c.json({
      success: true,
      rule_id: ruleId,
      domain_id: domainId,
      new_status: action,
      reviewed_at: now,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * GET /api/governance/status
 * Returns governance stats for the authenticated domain.
 */
governanceRouter.get("/status", async (c) => {
  const domainId = c.get("domainId" as never) as string | undefined;
  if (!domainId) {
    return c.json({ success: false, error: "No domain context" }, 400);
  }

  try {
    const allRules = await fetchGlobalRules(c.env);

    const counts = await c.env.DB.prepare(
      `SELECT status, COUNT(*) as cnt
       FROM Global_Rule_Approvals
       WHERE domain_id = ?1
       GROUP BY status`,
    )
      .bind(domainId)
      .all<{ status: string; cnt: number }>();

    const statusMap: Record<string, number> = {};
    for (const row of counts.results ?? []) {
      statusMap[row.status] = row.cnt;
    }

    return c.json({
      success: true,
      governance: {
        total_global_rules: allRules.length,
        approved: statusMap["approved"] ?? 0,
        rejected: statusMap["rejected"] ?? 0,
        pending: statusMap["pending"] ?? 0,
        unreviewed: allRules.length - Object.values(statusMap).reduce((a, b) => a + b, 0),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});
