/**
 * ============================================================
 * Swarme — Phase 2 Audit: PostHog Product Analytics
 * ============================================================
 *
 * Lightweight PostHog wrapper. Initializes on first call.
 * Tracks key funnel events:
 *   - signup, login, chat_sent, content_published,
 *     test_created, media_generated, subscription_upgraded
 *
 * The POSTHOG_API_KEY is read from the global config endpoint
 * or from VITE_POSTHOG_KEY env var. If neither is set,
 * all tracking calls are silently no-ops.
 * ============================================================
 */

// PostHog JS SDK types (we load it dynamically to avoid bundle bloat)
interface PostHogInstance {
  capture: (event: string, properties?: Record<string, any>) => void;
  identify: (distinctId: string, properties?: Record<string, any>) => void;
  reset: () => void;
  opt_out_capturing: () => void;
}

let posthog: PostHogInstance | null = null;
let initAttempted = false;

const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Initialize PostHog. Called once on app boot.
 * Safe to call multiple times — only runs once.
 */
export async function initAnalytics(apiKey?: string): Promise<void> {
  if (initAttempted) return;
  initAttempted = true;

  const key = apiKey || import.meta.env.VITE_POSTHOG_KEY || "";
  if (!key || key.length < 10) return;

  try {
    // Dynamic import to keep bundle small when PostHog isn't configured
    const ph = await import("posthog-js");
    ph.default.init(key, {
      api_host: POSTHOG_HOST,
      autocapture: false,      // We track events explicitly
      capture_pageview: false,  // SPA — we handle routing ourselves
      persistence: "memory",    // Respect privacy — no cookies/localStorage
      disable_session_recording: true,
      loaded: (instance) => {
        posthog = instance as unknown as PostHogInstance;
      },
    });
    posthog = ph.default as unknown as PostHogInstance;
  } catch {
    // PostHog not installed or failed to load — silent no-op
  }
}

/**
 * Identify the current user (call after login/signup).
 */
export function identifyUser(userId: string, traits?: Record<string, any>): void {
  posthog?.identify(userId, traits);
}

/**
 * Reset identity (call on logout).
 */
export function resetAnalytics(): void {
  posthog?.reset();
}

/**
 * Track a funnel event.
 */
export function trackEvent(event: string, properties?: Record<string, any>): void {
  posthog?.capture(event, {
    ...properties,
    timestamp: new Date().toISOString(),
    platform: "web",
  });
}

// ── Typed convenience wrappers ───────────────────────────────

export const analytics = {
  signup: (email: string, plan: string) =>
    trackEvent("signup", { email, plan }),

  login: (userId: string, method: string) =>
    trackEvent("login", { user_id: userId, method }),

  chatSent: (projectId: string, messageLength: number) =>
    trackEvent("chat_sent", { project_id: projectId, message_length: messageLength }),

  contentPublished: (projectId: string, contentType: string) =>
    trackEvent("content_published", { project_id: projectId, content_type: contentType }),

  testCreated: (projectId: string, testName: string) =>
    trackEvent("test_created", { project_id: projectId, test_name: testName }),

  mediaGenerated: (projectId: string, creditsUsed: number) =>
    trackEvent("media_generated", { project_id: projectId, credits_used: creditsUsed }),

  subscriptionUpgraded: (userId: string, fromPlan: string, toPlan: string) =>
    trackEvent("subscription_upgraded", { user_id: userId, from_plan: fromPlan, to_plan: toPlan }),

  pageView: (path: string) =>
    trackEvent("$pageview", { $current_url: path }),
};
