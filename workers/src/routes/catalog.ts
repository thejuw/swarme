/**
 * ============================================================
 * Swarme — Phase 67: Data Lakehouse Catalog API
 * ============================================================
 *
 * Hono sub-router mounted at /api/admin/catalog.
 * Provides an Iceberg-inspired catalog abstraction layer:
 *
 *   GET  /tables              — List all registered data tables
 *   GET  /tables/:name        — Table detail + current snapshot
 *   GET  /tables/:name/schema — Column schema for a table
 *   GET  /snapshots/:name     — List snapshots for a table (paginated)
 *   GET  /files/:snapshotId   — List files in a snapshot
 *   POST /tables/:name/evolve — Evolve table schema (add columns)
 *   POST /commit-batch        — Register a new batch (used by lakehouse cron)
 *   GET  /stats               — Aggregate lakehouse statistics
 *
 * All routes require superadmin JWT (enforced by parent router).
 *
 * Future-proofing:
 *   - When Cloudflare supports native Iceberg catalogs,
 *     this API layer stays the same — only the implementation swaps.
 *   - The schema_json + partition_spec fields map directly to
 *     Iceberg's PartitionSpec and Schema objects.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";

const catalogRouter = new Hono<{ Bindings: Env }>();

// ── GET /tables — List all registered data tables ────────────

catalogRouter.get("/tables", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name, description, format, total_rows, total_bytes,
              retention_days, created_at, updated_at
       FROM Data_Tables ORDER BY name ASC`
    ).all();

    const tables = (result.results || []).map((t: any) => ({
      ...t,
      total_rows: t.total_rows || 0,
      total_bytes: t.total_bytes || 0,
      size_human: humanBytes(t.total_bytes || 0),
    }));

    return c.json({ success: true, tables });
  } catch (err) {
    return c.json({ success: false, error: "Failed to list tables" }, 500);
  }
});

// ── GET /tables/:name — Table detail + current snapshot ──────

catalogRouter.get("/tables/:name", async (c) => {
  const name = c.req.param("name");
  try {
    const table = await c.env.DB.prepare(
      `SELECT * FROM Data_Tables WHERE name = ?1`
    ).bind(name).first();

    if (!table) return c.json({ success: false, error: "Table not found" }, 404);

    // Get latest snapshots
    const snapshots = await c.env.DB.prepare(
      `SELECT id, row_count, file_count, byte_size, created_at
       FROM Data_Snapshots WHERE table_name = ?1
       ORDER BY created_at DESC LIMIT 10`
    ).bind(name).all();

    return c.json({
      success: true,
      table: {
        ...(table as any),
        schema: safeParseJson((table as any).schema_json),
        partition_spec: safeParseJson((table as any).partition_spec),
        size_human: humanBytes((table as any).total_bytes || 0),
      },
      recent_snapshots: snapshots.results || [],
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load table" }, 500);
  }
});

// ── GET /tables/:name/schema — Column schema ────────────────

catalogRouter.get("/tables/:name/schema", async (c) => {
  const name = c.req.param("name");
  try {
    const table = await c.env.DB.prepare(
      `SELECT schema_json, partition_spec FROM Data_Tables WHERE name = ?1`
    ).bind(name).first<{ schema_json: string; partition_spec: string }>();

    if (!table) return c.json({ success: false, error: "Table not found" }, 404);

    return c.json({
      success: true,
      schema: safeParseJson(table.schema_json),
      partition_spec: safeParseJson(table.partition_spec),
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load schema" }, 500);
  }
});

// ── GET /snapshots/:name — Paginated snapshot list ───────────

catalogRouter.get("/snapshots/:name", async (c) => {
  const name = c.req.param("name");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, row_count, file_count, byte_size, summary_json, created_at
       FROM Data_Snapshots WHERE table_name = ?1
       ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
    ).bind(name, limit, offset).all();

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM Data_Snapshots WHERE table_name = ?1`
    ).bind(name).first<{ total: number }>();

    return c.json({
      success: true,
      snapshots: (result.results || []).map((s: any) => ({
        ...s,
        summary: safeParseJson(s.summary_json),
        size_human: humanBytes(s.byte_size || 0),
      })),
      total: countRow?.total || 0,
      limit,
      offset,
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to list snapshots" }, 500);
  }
});

// ── GET /files/:snapshotId — List files in a snapshot ────────

catalogRouter.get("/files/:snapshotId", async (c) => {
  const snapshotId = c.req.param("snapshotId");

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, r2_key, row_count, byte_size, format, partition_values, column_stats, created_at
       FROM Data_Files WHERE snapshot_id = ?1
       ORDER BY created_at ASC`
    ).bind(snapshotId).all();

    return c.json({
      success: true,
      files: (result.results || []).map((f: any) => ({
        ...f,
        partitions: safeParseJson(f.partition_values),
        stats: safeParseJson(f.column_stats),
        size_human: humanBytes(f.byte_size || 0),
      })),
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to list files" }, 500);
  }
});

// ── POST /tables/:name/evolve — Evolve table schema ─────────

catalogRouter.post("/tables/:name/evolve", async (c) => {
  const name = c.req.param("name");
  try {
    const body = await c.req.json<{ add_columns?: Record<string, string> }>();

    const table = await c.env.DB.prepare(
      `SELECT schema_json FROM Data_Tables WHERE name = ?1`
    ).bind(name).first<{ schema_json: string }>();

    if (!table) return c.json({ success: false, error: "Table not found" }, 404);

    const current = safeParseJson(table.schema_json);
    const updated = { ...current, ...(body.add_columns || {}) };

    await c.env.DB.prepare(
      `UPDATE Data_Tables SET schema_json = ?1, updated_at = ?2 WHERE name = ?3`
    ).bind(JSON.stringify(updated), new Date().toISOString(), name).run();

    return c.json({ success: true, schema: updated });
  } catch (err) {
    return c.json({ success: false, error: "Schema evolution failed" }, 500);
  }
});

// ── POST /commit-batch — Register a new data batch ──────────
// Used internally by lakehouseExport cron, but exposed for manual imports.

catalogRouter.post("/commit-batch", async (c) => {
  try {
    const body = await c.req.json<{
      table_name: string;
      r2_key: string;
      row_count: number;
      byte_size: number;
      partition_values?: Record<string, string>;
      column_stats?: Record<string, any>;
    }>();

    if (!body.table_name || !body.r2_key) {
      return c.json({ success: false, error: "table_name and r2_key required" }, 400);
    }

    const now = new Date().toISOString();
    const snapshotId = crypto.randomUUID();
    const fileId = crypto.randomUUID();

    // Create snapshot
    await c.env.DB.prepare(
      `INSERT INTO Data_Snapshots (id, table_name, row_count, file_count, byte_size, created_at)
       VALUES (?1, ?2, ?3, 1, ?4, ?5)`
    ).bind(snapshotId, body.table_name, body.row_count || 0, body.byte_size || 0, now).run();

    // Create file record
    await c.env.DB.prepare(
      `INSERT INTO Data_Files (id, snapshot_id, table_name, r2_key, row_count, byte_size, format, partition_values, column_stats, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'jsonl', ?7, ?8, ?9)`
    ).bind(
      fileId, snapshotId, body.table_name, body.r2_key,
      body.row_count || 0, body.byte_size || 0,
      JSON.stringify(body.partition_values || {}),
      JSON.stringify(body.column_stats || {}),
      now
    ).run();

    // Update table metadata
    await c.env.DB.prepare(
      `UPDATE Data_Tables SET current_snapshot_id = ?1, total_rows = total_rows + ?2, total_bytes = total_bytes + ?3, updated_at = ?4 WHERE name = ?5`
    ).bind(snapshotId, body.row_count || 0, body.byte_size || 0, now, body.table_name).run();

    return c.json({ success: true, snapshot_id: snapshotId, file_id: fileId });
  } catch (err) {
    return c.json({ success: false, error: "Commit failed" }, 500);
  }
});

// ── GET /stats — Aggregate lakehouse statistics ──────────────

catalogRouter.get("/stats", async (c) => {
  try {
    const tableCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM Data_Tables`
    ).first<{ cnt: number }>();

    const totals = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(total_rows), 0) as total_rows, COALESCE(SUM(total_bytes), 0) as total_bytes FROM Data_Tables`
    ).first<{ total_rows: number; total_bytes: number }>();

    const snapshotCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM Data_Snapshots`
    ).first<{ cnt: number }>();

    const fileCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM Data_Files`
    ).first<{ cnt: number }>();

    // Last 24h export activity
    const recentActivity = await c.env.DB.prepare(
      `SELECT COUNT(*) as exports, COALESCE(SUM(row_count), 0) as rows_exported
       FROM Data_Snapshots WHERE created_at > datetime('now', '-1 day')`
    ).first<{ exports: number; rows_exported: number }>();

    return c.json({
      success: true,
      stats: {
        tables: tableCount?.cnt || 0,
        total_rows: totals?.total_rows || 0,
        total_bytes: totals?.total_bytes || 0,
        total_size_human: humanBytes(totals?.total_bytes || 0),
        snapshots: snapshotCount?.cnt || 0,
        files: fileCount?.cnt || 0,
        last_24h_exports: recentActivity?.exports || 0,
        last_24h_rows: recentActivity?.rows_exported || 0,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load stats" }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────

function humanBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function safeParseJson(str: string | null | undefined): any {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

export { catalogRouter };
