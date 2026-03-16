/**
 * adapters/ugcFactory.ts — Phase 51.5 B2B API Abstraction
 *
 * Swarme's master corporate API keys are used for ALL external UGC
 * platform interactions (Billo, Insense, etc.). Client payment
 * information is NEVER passed to third-party services.
 *
 * This factory pattern isolates platform-specific API calls behind a
 * unified interface so the rest of the codebase never handles raw
 * vendor credentials or payment routing.
 */

export interface UgcBriefPayload {
  product_name: string;
  product_url: string;
  brief_description: string;
  content_type: "video" | "photo" | "unboxing" | "review" | "testimonial";
  budget_credits: number;
  deadline_days: number;
  domain_id: string;
  project_id: string;
}

export interface UgcBriefResult {
  success: boolean;
  external_brief_id: string;
  platform: UgcPlatform;
  estimated_delivery_days: number;
  credits_reserved: number;
}

export interface UgcStatusResult {
  external_brief_id: string;
  platform: UgcPlatform;
  status: "pending" | "in_progress" | "delivered" | "revision_requested" | "cancelled";
  deliverables_url?: string;
  creator_handle?: string;
}

export type UgcPlatform = "billo" | "insense";

interface PlatformAdapter {
  submitBrief(payload: UgcBriefPayload): Promise<UgcBriefResult>;
  checkStatus(externalBriefId: string): Promise<UgcStatusResult>;
  cancelBrief(externalBriefId: string): Promise<{ success: boolean }>;
}

/**
 * Corporate API key configuration.
 * Keys are stored in KV (CONFIG_KV) and injected at runtime.
 * Client credentials are NEVER used for third-party API calls.
 */
interface CorporateKeyConfig {
  billo_api_key?: string;
  billo_api_secret?: string;
  insense_api_key?: string;
  insense_api_secret?: string;
}

// ─────────────────────────────────────────────────────────
// Billo Adapter
// ─────────────────────────────────────────────────────────
function createBilloAdapter(keys: CorporateKeyConfig): PlatformAdapter {
  const baseUrl = "https://api.billo.app/v1";

  async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!keys.billo_api_key || !keys.billo_api_secret) {
      throw new Error("Billo corporate API keys not configured in CONFIG_KV");
    }
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": keys.billo_api_key,
        "X-Api-Secret": keys.billo_api_secret,
        ...(options.headers || {}),
      },
    });
  }

  return {
    async submitBrief(payload: UgcBriefPayload): Promise<UgcBriefResult> {
      const res = await authedFetch("/briefs", {
        method: "POST",
        body: JSON.stringify({
          product_name: payload.product_name,
          product_url: payload.product_url,
          description: payload.brief_description,
          content_type: payload.content_type,
          deadline_days: payload.deadline_days,
          // Budget is converted from Swarme Credits to platform currency
          // by the corporate billing layer — NOT the client
          internal_ref: `${payload.domain_id}:${payload.project_id}`,
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      return {
        success: res.ok,
        external_brief_id: (data.id as string) || "",
        platform: "billo",
        estimated_delivery_days: (data.estimated_days as number) || payload.deadline_days,
        credits_reserved: payload.budget_credits,
      };
    },

    async checkStatus(externalBriefId: string): Promise<UgcStatusResult> {
      const res = await authedFetch(`/briefs/${externalBriefId}`);
      const data = await res.json() as Record<string, unknown>;
      return {
        external_brief_id: externalBriefId,
        platform: "billo",
        status: mapBilloStatus(data.status as string),
        deliverables_url: data.deliverable_url as string | undefined,
        creator_handle: data.creator_username as string | undefined,
      };
    },

    async cancelBrief(externalBriefId: string): Promise<{ success: boolean }> {
      const res = await authedFetch(`/briefs/${externalBriefId}/cancel`, {
        method: "POST",
      });
      return { success: res.ok };
    },
  };
}

function mapBilloStatus(raw: string): UgcStatusResult["status"] {
  const map: Record<string, UgcStatusResult["status"]> = {
    pending: "pending",
    active: "in_progress",
    completed: "delivered",
    revision: "revision_requested",
    cancelled: "cancelled",
  };
  return map[raw] || "pending";
}

// ─────────────────────────────────────────────────────────
// Insense Adapter
// ─────────────────────────────────────────────────────────
function createInsenseAdapter(keys: CorporateKeyConfig): PlatformAdapter {
  const baseUrl = "https://api.insense.pro/v2";

  async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!keys.insense_api_key || !keys.insense_api_secret) {
      throw new Error("Insense corporate API keys not configured in CONFIG_KV");
    }
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keys.insense_api_key}`,
        ...(options.headers || {}),
      },
    });
  }

  return {
    async submitBrief(payload: UgcBriefPayload): Promise<UgcBriefResult> {
      const res = await authedFetch("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: `Swarme: ${payload.product_name}`,
          product_link: payload.product_url,
          brief: payload.brief_description,
          format: payload.content_type,
          deadline: payload.deadline_days,
          metadata: {
            domain_id: payload.domain_id,
            project_id: payload.project_id,
          },
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      return {
        success: res.ok,
        external_brief_id: (data.campaign_id as string) || "",
        platform: "insense",
        estimated_delivery_days: (data.eta_days as number) || payload.deadline_days,
        credits_reserved: payload.budget_credits,
      };
    },

    async checkStatus(externalBriefId: string): Promise<UgcStatusResult> {
      const res = await authedFetch(`/campaigns/${externalBriefId}`);
      const data = await res.json() as Record<string, unknown>;
      return {
        external_brief_id: externalBriefId,
        platform: "insense",
        status: mapInsenseStatus(data.state as string),
        deliverables_url: data.assets_url as string | undefined,
        creator_handle: data.creator as string | undefined,
      };
    },

    async cancelBrief(externalBriefId: string): Promise<{ success: boolean }> {
      const res = await authedFetch(`/campaigns/${externalBriefId}`, {
        method: "DELETE",
      });
      return { success: res.ok };
    },
  };
}

function mapInsenseStatus(raw: string): UgcStatusResult["status"] {
  const map: Record<string, UgcStatusResult["status"]> = {
    draft: "pending",
    active: "in_progress",
    completed: "delivered",
    in_review: "revision_requested",
    cancelled: "cancelled",
  };
  return map[raw] || "pending";
}

// ─────────────────────────────────────────────────────────
// Factory (public API)
// ─────────────────────────────────────────────────────────

/**
 * Creates a platform adapter using Swarme's corporate API keys.
 *
 * SECURITY INVARIANT:
 *   - `keys` are fetched from CONFIG_KV by the calling route handler
 *   - Client payment info is NEVER forwarded to the third-party API
 *   - Credits are deducted from Credit_Balances BEFORE the brief is dispatched
 *   - If the external call fails, credits are refunded via Credit_Ledger
 */
export function createUgcAdapter(
  platform: UgcPlatform,
  keys: CorporateKeyConfig,
): PlatformAdapter {
  switch (platform) {
    case "billo":
      return createBilloAdapter(keys);
    case "insense":
      return createInsenseAdapter(keys);
    default:
      throw new Error(`Unsupported UGC platform: ${platform}`);
  }
}

/**
 * Helper to load corporate keys from CONFIG_KV.
 * Must be called within a Cloudflare Worker context.
 */
export async function loadCorporateKeys(
  kv: KVNamespace,
): Promise<CorporateKeyConfig> {
  const [billoKey, billoSecret, insenseKey, insenseSecret] = await Promise.all([
    kv.get("ugc:billo:api_key"),
    kv.get("ugc:billo:api_secret"),
    kv.get("ugc:insense:api_key"),
    kv.get("ugc:insense:api_secret"),
  ]);
  return {
    billo_api_key: billoKey || undefined,
    billo_api_secret: billoSecret || undefined,
    insense_api_key: insenseKey || undefined,
    insense_api_secret: insenseSecret || undefined,
  };
}
