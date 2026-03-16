/**
 * utils/validators.ts — Phase 14: Integration Connection Validators
 *
 * Lightweight credential-test functions for each supported e-commerce
 * platform. Each validator makes a minimal, read-only API call to
 * confirm the credentials are valid before persisting them to KV.
 *
 * Design:
 *   - All validators are stateless (no KV/D1 side effects)
 *   - Timeout after 10 seconds to avoid hanging
 *   - Return a structured result with success + store name on success,
 *     or a user-friendly error message on failure
 */

// ─── Types ────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  storeName: string | null;
  error: string | null;
}

const VALIDATOR_TIMEOUT_MS = 10_000;

/**
 * Creates an AbortSignal that fires after `ms` milliseconds.
 */
function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ─── Shopify Validator ────────────────────────────────────

/**
 * Validates Shopify Admin API credentials by reading the Shop resource.
 *
 * Endpoint: GET /admin/api/2024-01/shop.json
 * Auth: X-Shopify-Access-Token header
 *
 * @param domain      — Shopify store domain (e.g. "store.myshopify.com")
 * @param accessToken — Shopify Custom App Admin API access token
 */
export async function validateShopify(
  domain: string,
  accessToken: string
): Promise<ValidationResult> {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const url = `https://${cleanDomain}/admin/api/2024-01/shop.json`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      signal: createTimeoutSignal(VALIDATOR_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          storeName: null,
          error:
            "Authentication failed. Please check that your Admin API Access Token is correct and the app has the required permissions (write_content for Blog/Article access).",
        };
      }
      if (response.status === 404) {
        return {
          valid: false,
          storeName: null,
          error: `Store not found at "${cleanDomain}". Please verify the Shopify store domain (e.g. your-store.myshopify.com).`,
        };
      }
      return {
        valid: false,
        storeName: null,
        error: `Shopify returned HTTP ${response.status}. Please try again or check your store settings.`,
      };
    }

    const data = (await response.json()) as {
      shop?: { name?: string; domain?: string };
    };

    return {
      valid: true,
      storeName: data.shop?.name ?? cleanDomain,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("timeout")) {
      return {
        valid: false,
        storeName: null,
        error: "Connection timed out. Please check the store domain and try again.",
      };
    }
    return {
      valid: false,
      storeName: null,
      error: `Connection failed: ${message}. Please verify the store domain is correct.`,
    };
  }
}

// ─── WooCommerce Validator ────────────────────────────────

/**
 * Validates WooCommerce REST API credentials by reading system status.
 *
 * Endpoint: GET /wp-json/wc/v3/system_status
 * Auth: Basic (consumer_key:consumer_secret, base64-encoded)
 *
 * @param domain      — WordPress/WooCommerce site domain
 * @param consumerKey — WooCommerce REST API consumer key
 * @param consumerSecret — WooCommerce REST API consumer secret
 */
export async function validateWooCommerce(
  domain: string,
  consumerKey: string,
  consumerSecret: string
): Promise<ValidationResult> {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const url = `https://${cleanDomain}/wp-json/wc/v3/system_status`;

    // WooCommerce uses Basic auth with consumer_key:consumer_secret
    const authToken = btoa(`${consumerKey}:${consumerSecret}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json",
      },
      signal: createTimeoutSignal(VALIDATOR_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          storeName: null,
          error:
            "Authentication failed. Please check your Consumer Key and Consumer Secret. Ensure the API key has Read/Write permissions.",
        };
      }
      if (response.status === 404) {
        return {
          valid: false,
          storeName: null,
          error: `WooCommerce REST API not found at "${cleanDomain}". Make sure WooCommerce is installed and the REST API is enabled.`,
        };
      }
      return {
        valid: false,
        storeName: null,
        error: `WooCommerce returned HTTP ${response.status}. Please try again or check your site settings.`,
      };
    }

    const data = (await response.json()) as {
      environment?: { site_url?: string; wp_version?: string };
      settings?: { store_name?: string };
    };

    const storeName =
      data.settings?.store_name ??
      data.environment?.site_url ??
      cleanDomain;

    return {
      valid: true,
      storeName,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("timeout")) {
      return {
        valid: false,
        storeName: null,
        error: "Connection timed out. Please check the site domain and try again.",
      };
    }
    return {
      valid: false,
      storeName: null,
      error: `Connection failed: ${message}. Please verify the domain and ensure your site is publicly accessible.`,
    };
  }
}

// ─── BigCommerce Validator ────────────────────────────────

/**
 * Validates BigCommerce API credentials by reading the Store resource.
 *
 * Endpoint: GET /v2/store
 * Auth: X-Auth-Token header
 *
 * @param storeHash   — BigCommerce store hash (e.g. "abc123def")
 * @param accessToken — BigCommerce API access token
 */
export async function validateBigCommerce(
  storeHash: string,
  accessToken: string
): Promise<ValidationResult> {
  try {
    const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/store`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: createTimeoutSignal(VALIDATOR_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          storeName: null,
          error:
            "Authentication failed. Please check your Store Hash and API Access Token. The token needs at least 'Read-only' scope for Store Information.",
        };
      }
      if (response.status === 404) {
        return {
          valid: false,
          storeName: null,
          error: `Store not found for hash "${storeHash}". You can find your Store Hash in your BigCommerce control panel under Settings > API.`,
        };
      }
      return {
        valid: false,
        storeName: null,
        error: `BigCommerce returned HTTP ${response.status}. Please try again or check your API credentials.`,
      };
    }

    const data = (await response.json()) as {
      name?: string;
      domain?: string;
    };

    return {
      valid: true,
      storeName: data.name ?? storeHash,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort") || message.includes("timeout")) {
      return {
        valid: false,
        storeName: null,
        error: "Connection timed out. Please check the Store Hash and try again.",
      };
    }
    return {
      valid: false,
      storeName: null,
      error: `Connection failed: ${message}. Please verify the Store Hash is correct.`,
    };
  }
}
