/**
 * ============================================================
 * Phase 42: GA4 Data API Sync Engine
 * ============================================================
 *
 * Fetches post-click analytics from GA4 via the Data API (v1beta)
 * runReport endpoint. Pulls three report dimensions:
 *
 *   1. Bounce Rate by Device (desktop, mobile, tablet)
 *   2. Average Session Duration by page
 *   3. Conversion Rate by Geographic Region
 *
 * Called from the daily cron (06:00 UTC, alongside GSC sync).
 * Uses raw fetch() — fully edge-compatible on Cloudflare Workers.
 * ============================================================
 */

import type { Env } from "../index";

// ── Constants ────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

// ── Types ────────────────────────────────────────────────────

interface Ga4User {
  id: string;
  ga4_refresh_token: string;
  ga4_property_id: string;
}

interface Ga4RunReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit: number;
}

interface Ga4DimensionValue {
  value: string;
}

interface Ga4MetricValue {
  value: string;
}

interface Ga4Row {
  dimensionValues: Ga4DimensionValue[];
  metricValues: Ga4MetricValue[];
}

interface Ga4RunReportResponse {
  rows?: Ga4Row[];
  rowCount?: number;
  error?: { message: string; code: number };
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface Ga4SyncResult {
  usersProcessed: number;
  rowsUpserted: number;
  errors: string[];
}

// ── Token Refresh ────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string,
  env: Env,
): Promise<string | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[GA4 Sync] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
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
    console.error(`[GA4 Sync] Token refresh failed: ${data.error_description || data.error}`);
    return null;
  }

  return data.access_token || null;
}

// ── GA4 Data API: runReport ─────────────────────────────────

/**
 * Execute a GA4 Data API runReport call.
 * See: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 */
async function runReport(
  accessToken: string,
  propertyId: string,
  request: Ga4RunReportRequest,
): Promise<Ga4Row[]> {
  const url = `${GA4_API_BASE}/properties/${propertyId}:runReport`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const data = (await res.json()) as Ga4RunReportResponse;

  if (!res.ok || data.error) {
    throw new Error(`GA4 API error: ${data.error?.message || res.statusText}`);
  }

  return data.rows || [];
}

// ── Date Helpers ─────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // yesterday

  const start = new Date(now);
  start.setDate(start.getDate() - 7); // 7 days back

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

// ── Report Fetchers ─────────────────────────────────────────

/**
 * Report 1: Bounce Rate by Device Category per page path.
 * Dimensions: pagePath, deviceCategory, date
 * Metrics: sessions, bounceRate, averageSessionDuration
 */
async function fetchBounceRateByDevice(
  accessToken: string,
  propertyId: string,
  dateRange: { startDate: string; endDate: string },
): Promise<Ga4Row[]> {
  return runReport(accessToken, propertyId, {
    dateRanges: [dateRange],
    dimensions: [
      { name: "pagePath" },
      { name: "deviceCategory" },
      { name: "date" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
    limit: 500,
  });
}

/**
 * Report 2: Conversion Rate by Geographic Region.
 * Dimensions: pagePath, country, date
 * Metrics: sessions, conversions, userConversionRate
 */
async function fetchConversionByGeo(
  accessToken: string,
  propertyId: string,
  dateRange: { startDate: string; endDate: string },
): Promise<Ga4Row[]> {
  return runReport(accessToken, propertyId, {
    dateRanges: [dateRange],
    dimensions: [
      { name: "pagePath" },
      { name: "country" },
      { name: "date" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "conversions" },
      { name: "userConversionRate" },
    ],
    limit: 500,
  });
}

// ── Upsert Logic ────────────────────────────────────────────

/**
 * Upsert device-level metrics into GA4_Metrics.
 */
async function upsertDeviceMetrics(
  projectId: string,
  rows: Ga4Row[],
  env: Env,
): Promise<number> {
  let count = 0;

  for (const row of rows) {
    const pagePath = row.dimensionValues[0]?.value || "/";
    const device = row.dimensionValues[1]?.value || "unknown";
    const date = row.dimensionValues[2]?.value || "";

    const sessions = parseInt(row.metricValues[0]?.value || "0", 10);
    const bounceRate = parseFloat(row.metricValues[1]?.value || "0");
    const avgDuration = parseFloat(row.metricValues[2]?.value || "0");

    // Format date from YYYYMMDD to YYYY-MM-DD
    const formattedDate = date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : date;

    const id = `ga4_${projectId}_${pagePath}_${device}_${formattedDate}`.replace(/[^a-zA-Z0-9_/.-]/g, "_");

    await env.DB.prepare(
      `INSERT INTO GA4_Metrics (id, project_id, page_path, device_category, date, sessions, bounce_rate, avg_session_duration)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(project_id, page_path, device_category, date, country) DO UPDATE SET
         sessions = excluded.sessions,
         bounce_rate = excluded.bounce_rate,
         avg_session_duration = excluded.avg_session_duration`,
    )
      .bind(id, projectId, pagePath, device, formattedDate, sessions, bounceRate, avgDuration)
      .run();

    count++;
  }

  return count;
}

/**
 * Upsert geo-level conversion metrics into GA4_Metrics.
 */
async function upsertGeoMetrics(
  projectId: string,
  rows: Ga4Row[],
  env: Env,
): Promise<number> {
  let count = 0;

  for (const row of rows) {
    const pagePath = row.dimensionValues[0]?.value || "/";
    const country = row.dimensionValues[1]?.value || "unknown";
    const date = row.dimensionValues[2]?.value || "";

    const sessions = parseInt(row.metricValues[0]?.value || "0", 10);
    const conversions = parseInt(row.metricValues[1]?.value || "0", 10);
    const conversionRate = parseFloat(row.metricValues[2]?.value || "0");

    const formattedDate = date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : date;

    const id = `ga4_geo_${projectId}_${pagePath}_${country}_${formattedDate}`.replace(/[^a-zA-Z0-9_/.-]/g, "_");

    await env.DB.prepare(
      `INSERT INTO GA4_Metrics (id, project_id, page_path, device_category, date, sessions, conversions, conversion_rate, country)
       VALUES (?1, ?2, ?3, 'all', ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(project_id, page_path, device_category, date, country) DO UPDATE SET
         sessions = excluded.sessions,
         conversions = excluded.conversions,
         conversion_rate = excluded.conversion_rate`,
    )
      .bind(id, projectId, pagePath, formattedDate, sessions, conversions, conversionRate, country)
      .run();

    count++;
  }

  return count;
}

// ── Per-User Sync ───────────────────────────────────────────

async function syncUserGa4Data(
  user: Ga4User,
  env: Env,
): Promise<number> {
  // Step 1: Refresh access token
  const accessToken = await refreshAccessToken(user.ga4_refresh_token, env);
  if (!accessToken) {
    throw new Error(`Failed to refresh GA4 token for user ${user.id}`);
  }

  // Step 2: Find user's active projects
  const projectsResult = await env.DB.prepare(
    "SELECT id FROM Projects WHERE user_id = ? AND is_active = 1",
  )
    .bind(user.id)
    .all<{ id: string }>();

  const projects = projectsResult.results || [];
  if (projects.length === 0) {
    console.log(`[GA4 Sync] User ${user.id} has no active projects, skipping`);
    return 0;
  }

  const dateRange = getDateRange();
  let totalUpserted = 0;

  // Step 3: Fetch both reports
  const [deviceRows, geoRows] = await Promise.all([
    fetchBounceRateByDevice(accessToken, user.ga4_property_id, dateRange),
    fetchConversionByGeo(accessToken, user.ga4_property_id, dateRange),
  ]);

  console.log(
    `[GA4 Sync] User ${user.id}: ${deviceRows.length} device rows, ${geoRows.length} geo rows`,
  );

  // Step 4: Upsert into D1 for each project
  for (const project of projects) {
    totalUpserted += await upsertDeviceMetrics(project.id, deviceRows, env);
    totalUpserted += await upsertGeoMetrics(project.id, geoRows, env);
  }

  return totalUpserted;
}

// ── Cron Entry Point ────────────────────────────────────────

/**
 * Main entry point called from the daily cron handler.
 * Iterates all users with GA4 connected and syncs their data.
 */
export async function handleGa4Sync(env: Env): Promise<Ga4SyncResult> {
  const result: Ga4SyncResult = {
    usersProcessed: 0,
    rowsUpserted: 0,
    errors: [],
  };

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.log("[GA4 Sync] Skipping — Google OAuth credentials not configured");
    return result;
  }

  // Find all users with GA4 connected
  const usersResult = await env.DB.prepare(
    `SELECT id, ga4_refresh_token, ga4_property_id
     FROM Users
     WHERE ga4_refresh_token IS NOT NULL
       AND ga4_property_id IS NOT NULL
       AND ga4_property_id != ''`,
  ).all<Ga4User>();

  const users = usersResult.results || [];

  if (users.length === 0) {
    console.log("[GA4 Sync] No users with GA4 connected, skipping");
    return result;
  }

  console.log(`[GA4 Sync] Starting sync for ${users.length} connected user(s)`);

  for (const user of users) {
    try {
      const rowsUpserted = await syncUserGa4Data(user, env);
      result.usersProcessed++;
      result.rowsUpserted += rowsUpserted;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[GA4 Sync] Error for user ${user.id}: ${msg}`);
      result.errors.push(`${user.id}: ${msg}`);
    }
  }

  console.log(
    `[GA4 Sync] Complete — ${result.usersProcessed} users, ${result.rowsUpserted} rows, ${result.errors.length} errors`,
  );

  return result;
}
