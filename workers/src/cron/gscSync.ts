/**
 * ============================================================
 * Phase 34: GSC Data Ingestion Engine
 * ============================================================
 *
 * Fetches daily Search Console metrics (clicks, impressions, CTR,
 * position) for each connected user and upserts them into D1.
 *
 * Flow:
 *   1. Query Users with a non-null gsc_refresh_token
 *   2. For each user, refresh the OAuth access token
 *   3. Call GSC searchanalytics.query for the last 3 days
 *   4. Upsert rows into GSC_Metrics (conflict on project_id+date)
 *
 * Called from the master daily cron (06:00 UTC) in index.ts.
 * Uses raw fetch() — no Node.js dependencies, fully edge-safe.
 * ============================================================
 */

import type { Env } from "../index";

// ── Constants ────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

// ── Types ────────────────────────────────────────────────────

interface GscUser {
  id: string;
  gsc_refresh_token: string;
  gsc_property_url: string;
}

interface GscRow {
  keys: string[];    // [date]
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscApiResponse {
  rows?: GscRow[];
  error?: { message: string; code: number };
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GscSyncResult {
  usersProcessed: number;
  rowsUpserted: number;
  errors: string[];
}

// ── Token Refresh ────────────────────────────────────────────

/**
 * Exchange a refresh token for a fresh access token.
 */
async function refreshAccessToken(
  refreshToken: string,
  env: Env,
): Promise<string | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[GSC Sync] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
    return null;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const data = (await res.json()) as TokenResponse;

  if (!res.ok || data.error) {
    console.error(`[GSC Sync] Token refresh failed: ${data.error_description || data.error}`);
    return null;
  }

  return data.access_token || null;
}

// ── Search Analytics Query ──────────────────────────────────

/**
 * Fetch aggregate metrics from GSC searchanalytics.query for a date range.
 * Dimensions: ["date"] to get per-day totals.
 */
async function fetchSearchAnalytics(
  accessToken: string,
  propertyUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscRow[]> {
  const encodedProperty = encodeURIComponent(propertyUrl);
  const url = `${GSC_API_BASE}/sites/${encodedProperty}/searchAnalytics/query`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 100,
    }),
  });

  const data = (await res.json()) as GscApiResponse;

  if (!res.ok || data.error) {
    throw new Error(`GSC API error: ${data.error?.message || res.statusText}`);
  }

  return data.rows || [];
}

// ── Date Helpers ─────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD (GSC API format).
 */
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Get the date range for the last N days.
 * GSC data has ~2-day lag, so we query 5 days back through 2 days back.
 */
function getDateRange(daysBack: number = 5, lagDays: number = 2): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - lagDays);

  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

// ── Main Sync Function ──────────────────────────────────────

/**
 * Fetch and upsert GSC data for a single user.
 */
async function syncUserGscData(
  user: GscUser,
  env: Env,
): Promise<number> {
  // Step 1: Refresh access token
  const accessToken = await refreshAccessToken(user.gsc_refresh_token, env);
  if (!accessToken) {
    throw new Error(`Failed to refresh token for user ${user.id}`);
  }

  // Step 2: Find the user's projects (they could own multiple)
  const projectsResult = await env.DB.prepare(
    "SELECT id FROM Projects WHERE user_id = ? AND is_active = 1",
  )
    .bind(user.id)
    .all<{ id: string }>();

  const projects = projectsResult.results || [];
  if (projects.length === 0) {
    console.log(`[GSC Sync] User ${user.id} has no active projects, skipping`);
    return 0;
  }

  // Step 3: Fetch GSC data
  const { startDate, endDate } = getDateRange();
  const rows = await fetchSearchAnalytics(
    accessToken,
    user.gsc_property_url,
    startDate,
    endDate,
  );

  if (rows.length === 0) {
    console.log(`[GSC Sync] No data returned for user ${user.id} (${startDate} → ${endDate})`);
    return 0;
  }

  // Step 4: Upsert into GSC_Metrics for each project
  let totalUpserted = 0;

  for (const project of projects) {
    for (const row of rows) {
      const date = row.keys[0]; // date dimension

      await env.DB.prepare(
        `INSERT INTO GSC_Metrics (project_id, date, clicks, impressions, ctr, position)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(project_id, date) DO UPDATE SET
           clicks = excluded.clicks,
           impressions = excluded.impressions,
           ctr = excluded.ctr,
           position = excluded.position`,
      )
        .bind(
          project.id,
          date,
          row.clicks,
          row.impressions,
          Math.round(row.ctr * 10000) / 10000, // 4 decimal precision
          Math.round(row.position * 100) / 100,  // 2 decimal precision
        )
        .run();

      totalUpserted++;
    }
  }

  console.log(
    `[GSC Sync] User ${user.id}: ${rows.length} days × ${projects.length} projects = ${totalUpserted} rows upserted`,
  );

  return totalUpserted;
}

// ── Cron Entry Point ────────────────────────────────────────

/**
 * Main entry point called from the daily cron handler.
 * Iterates all users with GSC connected and syncs their data.
 */
export async function handleGscSync(env: Env): Promise<GscSyncResult> {
  const result: GscSyncResult = {
    usersProcessed: 0,
    rowsUpserted: 0,
    errors: [],
  };

  // Guard: Google credentials must be configured
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.log("[GSC Sync] Skipping — Google OAuth credentials not configured");
    return result;
  }

  // Find all users with GSC connected
  const usersResult = await env.DB.prepare(
    `SELECT id, gsc_refresh_token, gsc_property_url
     FROM Users
     WHERE gsc_refresh_token IS NOT NULL
       AND gsc_property_url IS NOT NULL
       AND gsc_property_url != ''`,
  ).all<GscUser>();

  const users = usersResult.results || [];

  if (users.length === 0) {
    console.log("[GSC Sync] No users with GSC connected, skipping");
    return result;
  }

  console.log(`[GSC Sync] Starting sync for ${users.length} connected user(s)`);

  for (const user of users) {
    try {
      const rowsUpserted = await syncUserGscData(user, env);
      result.usersProcessed++;
      result.rowsUpserted += rowsUpserted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[GSC Sync] Error for user ${user.id}: ${msg}`);
      result.errors.push(`${user.id}: ${msg}`);
    }
  }

  console.log(
    `[GSC Sync] Complete — ${result.usersProcessed} users, ${result.rowsUpserted} rows, ${result.errors.length} errors`,
  );

  return result;
}
