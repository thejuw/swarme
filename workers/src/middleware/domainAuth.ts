/**
 * ============================================================
 * Phase 47: Domain Ownership Middleware
 * ============================================================
 *
 * Enforces strict multi-domain isolation by verifying that the
 * authenticated user owns the requested domain. Prevents
 * cross-domain data bleeding.
 *
 * Placement: AFTER protectRoute() — reads c.get("userId").
 *
 * Domain ID resolution order:
 *   1. Route param `:domainId`  (e.g. /api/domain/:domainId/...)
 *   2. X-Domain-Id request header (for global context switcher)
 *
 * On success, sets:
 *   - c.set("domainId",       <string>)
 *   - c.set("domainUrl",      <string>)
 *   - c.set("platformType",   <string>)
 *   - c.set("vaultId",        <string>)
 *
 * On failure:
 *   - 400 if no domain_id can be resolved
 *   - 403 if domain doesn't exist or belongs to another user
 *
 * CRITICAL CONSTRAINT (Phase 47):
 *   The AI must NEVER query tables using just user_id.
 *   It must ALWAYS query using domain_id to ensure strict
 *   compartmentalization. This middleware guarantees the
 *   domain_id is verified before any downstream handler.
 * ============================================================
 */

import { Context, Next } from "hono";
import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Domain row shape from D1
// ─────────────────────────────────────────────────────────────

interface DomainRow {
  id: string;
  user_id: string;
  domain_url: string;
  platform_type: string;
  credentials_vault_id: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────
// Middleware factory
// ─────────────────────────────────────────────────────────────

/**
 * Creates a Hono middleware that:
 *   1. Resolves domain_id from route param or header
 *   2. Queries D1 Domains table with parameterized input
 *   3. Verifies Domains.user_id === context.userId
 *   4. Attaches domain metadata to Hono context
 *
 * @param opts.optional — If true, allows requests without a
 *   domain_id to pass through (for routes that list all domains).
 *   Defaults to false (domain_id is required).
 */
export function domainAuth(opts?: { optional?: boolean }) {
  const isOptional = opts?.optional ?? false;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // ── 1. Resolve domain_id ──────────────────────────────────
    const domainId =
      c.req.param("domainId") ||
      c.req.header("X-Domain-Id") ||
      "";

    if (!domainId) {
      if (isOptional) {
        // No domain context — let the handler decide what to do
        await next();
        return;
      }
      return c.json(
        {
          success: false,
          error: "Missing domain context. Provide :domainId param or X-Domain-Id header.",
        },
        400
      );
    }

    // ── 2. Get authenticated user from upstream protectRoute ──
    const userId = c.get("userId") as string | undefined;
    if (!userId) {
      return c.json(
        { success: false, error: "Authentication required before domain verification" },
        401
      );
    }

    // ── 3. Query Domains table (parameterized — no SQL injection) ──
    const domain = await c.env.DB.prepare(
      "SELECT id, user_id, domain_url, platform_type, credentials_vault_id, label FROM Domains WHERE id = ?1"
    )
      .bind(domainId)
      .first<DomainRow>();

    if (!domain) {
      return c.json(
        { success: false, error: "Domain not found" },
        403
      );
    }

    // ── 4. Ownership check — MUST match authenticated user ────
    if (domain.user_id !== userId) {
      // Log the attempted cross-domain access for audit
      console.warn(
        `[domainAuth] Cross-domain access blocked: user=${userId} attempted domain=${domainId} owned by ${domain.user_id}`
      );
      return c.json(
        { success: false, error: "Access denied: domain belongs to another account" },
        403
      );
    }

    // ── 5. Attach verified domain context for downstream ──────
    c.set("domainId", domain.id);
    c.set("domainUrl", domain.domain_url);
    c.set("platformType", domain.platform_type);
    c.set("vaultId", domain.credentials_vault_id);

    await next();
  };
}
