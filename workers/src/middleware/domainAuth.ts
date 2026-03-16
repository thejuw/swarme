/**
 * ============================================================
 * Phase 47 → Phase 55: Domain Ownership + RBAC Middleware
 * ============================================================
 *
 * Enforces strict multi-domain isolation by verifying the
 * authenticated user's role against the Domain_Members table.
 *
 * Placement: AFTER protectRoute() — reads c.get("userId").
 *
 * Domain ID resolution order:
 *   1. Route param `:domainId`  (e.g. /api/domain/:domainId/...)
 *   2. X-Domain-Id request header (for global context switcher)
 *
 * Phase 55 RBAC Upgrade:
 *   - Checks Domain_Members.role for the authenticated user
 *   - Falls back to Domains.user_id for legacy owner detection
 *   - Only 'owner' or 'manager' can hit POST/PATCH/PUT/DELETE
 *   - Only 'owner' can access Wallet routes
 *   - 'viewer' can only hit GET routes
 *
 * On success, sets:
 *   - c.set("domainId",       <string>)
 *   - c.set("domainUrl",      <string>)
 *   - c.set("platformType",   <string>)
 *   - c.set("vaultId",        <string>)
 *   - c.set("memberRole",     <string>)  ← Phase 55
 *
 * On failure:
 *   - 400 if no domain_id can be resolved
 *   - 403 if no membership or insufficient role
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

// Phase 55: Domain_Members row
interface MemberRow {
  id: string;
  domain_id: string;
  user_id: string;
  role: "owner" | "manager" | "viewer";
}

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  manager: 1,
  owner: 2,
};

// HTTP methods that require write access (manager+)
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// ─────────────────────────────────────────────────────────────
// Middleware factory
// ─────────────────────────────────────────────────────────────

/**
 * Creates a Hono middleware that:
 *   1. Resolves domain_id from route param or header
 *   2. Queries Domain_Members for RBAC role (falls back to Domains.user_id for legacy)
 *   3. Enforces method-level permissions based on role
 *   4. Attaches domain metadata + role to Hono context
 *
 * @param opts.optional — If true, allows requests without a
 *   domain_id to pass through (for routes that list all domains).
 * @param opts.requireRole — Minimum role required (default: 'viewer')
 * @param opts.walletRoute — If true, requires 'owner' role exclusively
 */
export function domainAuth(opts?: {
  optional?: boolean;
  requireRole?: "viewer" | "manager" | "owner";
  walletRoute?: boolean;
}) {
  const isOptional = opts?.optional ?? false;
  const minRole = opts?.walletRoute ? "owner" : (opts?.requireRole ?? "viewer");

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // ── 1. Resolve domain_id ──────────────────────────────────
    const domainId =
      c.req.param("domainId") ||
      c.req.header("X-Domain-Id") ||
      "";

    if (!domainId) {
      if (isOptional) {
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

    // ── 3. Query domain metadata (parameterized — no SQL injection) ──
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

    // ── 4. Phase 55: RBAC role resolution ─────────────────────
    //    First check Domain_Members table, then fall back to
    //    legacy Domains.user_id ownership check
    let memberRole: "owner" | "manager" | "viewer" | null = null;

    const member = await c.env.DB.prepare(
      "SELECT id, domain_id, user_id, role FROM Domain_Members WHERE domain_id = ?1 AND user_id = ?2"
    )
      .bind(domainId, userId)
      .first<MemberRow>();

    if (member) {
      memberRole = member.role;
    } else if (domain.user_id === userId) {
      // Legacy fallback: Domains table owner → implicit 'owner' role
      memberRole = "owner";
    }

    if (!memberRole) {
      console.warn(
        `[domainAuth] Access blocked: user=${userId} has no membership for domain=${domainId}`
      );
      return c.json(
        { success: false, error: "Access denied: no membership for this domain" },
        403
      );
    }

    // ── 5. Method-level RBAC enforcement ──────────────────────
    const method = c.req.method.toUpperCase();

    // Wallet routes: owner only
    if (opts?.walletRoute && memberRole !== "owner") {
      console.warn(
        `[domainAuth] Wallet access blocked: user=${userId} role=${memberRole} for domain=${domainId}`
      );
      return c.json(
        { success: false, error: "Access denied: wallet operations require owner role" },
        403
      );
    }

    // Write methods: require manager or owner
    if (WRITE_METHODS.has(method) && ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY["manager"]) {
      console.warn(
        `[domainAuth] Write blocked: user=${userId} role=${memberRole} method=${method} for domain=${domainId}`
      );
      return c.json(
        { success: false, error: `Access denied: ${method} operations require manager or owner role` },
        403
      );
    }

    // Explicit minimum role check
    if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minRole]) {
      return c.json(
        { success: false, error: `Access denied: this route requires ${minRole} role or higher` },
        403
      );
    }

    // ── 6. Attach verified domain context for downstream ──────
    c.set("domainId", domain.id);
    c.set("domainUrl", domain.domain_url);
    c.set("platformType", domain.platform_type);
    c.set("vaultId", domain.credentials_vault_id);
    c.set("memberRole", memberRole);

    await next();
  };
}
