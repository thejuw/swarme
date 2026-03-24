/**
 * ============================================================
 * Swarme — Phase 2 Audit: Server-Side PostHog Event Tracking
 * ============================================================
 *
 * Sends funnel events to PostHog's Capture API from the Worker.
 * Used for server-side events that the frontend can't track
 * (cron completions, webhook processing, agent task outcomes).
 *
 * PostHog Capture API: POST https://us.i.posthog.com/capture/
 * Requires: POSTHOG_API_KEY env secret
 * ============================================================
 */

import type { Env } from "../index";

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";

interface PostHogEvent {
  event: string;
  distinct_id: string;
  properties?: Record<string, any>;
}

/**
 * Send a single event to PostHog's server-side capture API.
 * Non-blocking — errors are logged but never thrown.
 */
export async function captureEvent(
  env: Env,
  event: PostHogEvent,
): Promise<void> {
  const apiKey = env.POSTHOG_API_KEY;
  if (!apiKey) return;

  try {
    await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event: event.event,
        distinct_id: event.distinct_id,
        properties: {
          ...event.properties,
          $lib: "swarme-worker",
          environment: env.ENVIRONMENT || "development",
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch {
    // Non-critical — never block the main flow for analytics
  }
}

/**
 * Batch-send multiple events in a single request.
 */
export async function captureBatch(
  env: Env,
  events: PostHogEvent[],
): Promise<void> {
  const apiKey = env.POSTHOG_API_KEY;
  if (!apiKey || events.length === 0) return;

  try {
    await fetch("https://us.i.posthog.com/batch/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        batch: events.map((e) => ({
          type: "capture",
          event: e.event,
          distinct_id: e.distinct_id,
          properties: {
            ...e.properties,
            $lib: "swarme-worker",
            environment: env.ENVIRONMENT || "development",
          },
          timestamp: new Date().toISOString(),
        })),
      }),
    });
  } catch {
    // Non-critical
  }
}

// ── Typed convenience wrappers ───────────────────────────────

export const serverAnalytics = {
  userSignedUp: (env: Env, userId: string, email: string, plan: string) =>
    captureEvent(env, { event: "server_signup", distinct_id: userId, properties: { email, plan } }),

  contentPublished: (env: Env, userId: string, projectId: string, platform: string) =>
    captureEvent(env, { event: "server_content_published", distinct_id: userId, properties: { project_id: projectId, platform } }),

  agentTaskCompleted: (env: Env, projectId: string, agentType: string, action: string) =>
    captureEvent(env, { event: "server_agent_task_completed", distinct_id: projectId, properties: { agent_type: agentType, action } }),

  subscriptionChanged: (env: Env, userId: string, fromPlan: string, toPlan: string) =>
    captureEvent(env, { event: "server_subscription_changed", distinct_id: userId, properties: { from_plan: fromPlan, to_plan: toPlan } }),

  cronCompleted: (env: Env, cronName: string, result: Record<string, any>) =>
    captureEvent(env, { event: "server_cron_completed", distinct_id: "system", properties: { cron_name: cronName, ...result } }),
};
