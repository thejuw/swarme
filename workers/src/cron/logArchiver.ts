/**
 * ============================================================
 * Swarme — Phase 64: Cold Storage Log Archiver
 * ============================================================
 *
 * Runs on the 1st of every month (00:30 UTC). Moves records
 * older than 90 days from hot D1 tables into immutable .jsonl
 * files on R2, then purges the archived rows from D1.
 *
 * Tables archived:
 *   - Action_History  (Phase 37)
 *   - Chaos_Logs      (Phase 54)
 *   - Chat_History    (Phase 61)
 *
 * Archive path convention:
 *   audit-archives/{YYYY}/{MM}/{table_name}_{YYYY-MM-DD}.jsonl
 *
 * Each archive push is recorded in Archive_Manifests (Phase 64)
 * for chain-of-custody auditing (SOC 2 requirement).
 *
 * Safety:
 *   - R2 upload is confirmed before any DELETE runs
 *   - SHA-256 integrity hash is stored in the manifest
 *   - Batch size is capped at 500 rows per query to stay within
 *     D1 row-return limits and Worker CPU time
 * ============================================================
 */

import type { Env } from "../index";

// ── Configuration ───────────────────────────────────────────

/** Number of days after which records become archive-eligible */
const RETENTION_DAYS = 90;

/** Maximum rows per D1 query batch (keeps CPU time safe) */
const BATCH_SIZE = 500;

/** R2 directory prefix for all audit archives */
const R2_PREFIX = "audit-archives";

/** Tables to archive — each entry specifies the table name, the
 *  timestamp column used for age filtering, and the primary key */
const ARCHIVE_TARGETS = [
  {
    table: "Action_History",
    timestampCol: "created_at",
    pkCol: "id",
  },
  {
    table: "Chaos_Logs",
    timestampCol: "created_at",
    pkCol: "id",
  },
  {
    table: "Chat_History",
    timestampCol: "created_at",
    pkCol: "id",
  },
] as const;

// ── Types ───────────────────────────────────────────────────

interface ArchiveResult {
  table: string;
  recordsArchived: number;
  r2Key: string;
  byteSize: number;
  sha256: string;
  oldestRecord: string;
  newestRecord: string;
}

interface ArchiverSummary {
  tablesProcessed: number;
  totalRecordsArchived: number;
  archives: ArchiveResult[];
  errors: string[];
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Compute the cutoff ISO timestamp — anything older than this
 * date is eligible for archival.
 */
function getCutoffDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - RETENTION_DAYS);
  return d.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Build the R2 object key for this archive batch.
 * Example: audit-archives/2026/03/Action_History_2026-03-01.jsonl
 */
function buildR2Key(table: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${R2_PREFIX}/${yyyy}/${mm}/${table}_${yyyy}-${mm}-${dd}.jsonl`;
}

/**
 * SHA-256 hash of a string (using Web Crypto, available in Workers).
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Core Archive Logic ──────────────────────────────────────

/**
 * Archive a single table: fetch old rows → write .jsonl to R2 →
 * log manifest → delete from D1.
 */
async function archiveTable(
  env: Env,
  target: (typeof ARCHIVE_TARGETS)[number],
  cutoff: string,
): Promise<ArchiveResult | null> {
  const { table, timestampCol, pkCol } = target;

  // 1. Collect ALL eligible rows (batched reads)
  const allRows: Record<string, unknown>[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const batch = await env.DB.prepare(
      `SELECT * FROM ${table}
       WHERE ${timestampCol} < ?1
       ORDER BY ${timestampCol} ASC
       LIMIT ?2 OFFSET ?3`,
    )
      .bind(cutoff, BATCH_SIZE, offset)
      .all();

    if (!batch.results || batch.results.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...batch.results);
      offset += batch.results.length;
      if (batch.results.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
  }

  if (allRows.length === 0) {
    console.log(`[LogArchiver] ${table}: No records older than ${cutoff}`);
    return null;
  }

  // 2. Build JSONL content — one JSON object per line
  const jsonlContent = allRows.map((row) => JSON.stringify(row)).join("\n");
  const byteSize = new TextEncoder().encode(jsonlContent).length;
  const hash = await sha256(jsonlContent);

  // 3. Determine date range in the batch
  const timestamps = allRows
    .map((r) => r[timestampCol] as string)
    .filter(Boolean)
    .sort();
  const oldestRecord = timestamps[0] || cutoff;
  const newestRecord = timestamps[timestamps.length - 1] || cutoff;

  // 4. Upload to R2 (immutable — once written, never overwritten)
  const r2Key = buildR2Key(table);
  await env.MEDIA_BUCKET.put(r2Key, jsonlContent, {
    httpMetadata: { contentType: "application/jsonl" },
    customMetadata: {
      table,
      recordCount: String(allRows.length),
      oldestRecord,
      newestRecord,
      sha256Hash: hash,
      archivedAt: new Date().toISOString(),
    },
  });

  console.log(
    `[LogArchiver] ${table}: Uploaded ${allRows.length} records to R2 → ${r2Key} (${byteSize} bytes)`,
  );

  // 5. Record the manifest in D1 (chain-of-custody for SOC 2)
  const manifestId = `arch_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  await env.DB.prepare(
    `INSERT INTO Archive_Manifests (id, table_name, r2_key, record_count, oldest_record, newest_record, byte_size, sha256_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(
    manifestId,
    table,
    r2Key,
    allRows.length,
    oldestRecord,
    newestRecord,
    byteSize,
    hash,
  ).run();

  // 6. DELETE archived rows from D1 (batch to stay within limits)
  const pks = allRows.map((r) => r[pkCol] as string);
  for (let i = 0; i < pks.length; i += BATCH_SIZE) {
    const chunk = pks.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(", ");
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE ${pkCol} IN (${placeholders})`,
    )
      .bind(...chunk)
      .run();
  }

  console.log(
    `[LogArchiver] ${table}: Purged ${pks.length} rows from D1`,
  );

  return {
    table,
    recordsArchived: allRows.length,
    r2Key,
    byteSize,
    sha256: hash,
    oldestRecord,
    newestRecord,
  };
}

// ── Exported Cron Handler ───────────────────────────────────

/**
 * handleLogArchival — called by the scheduled event dispatcher
 * on the 1st of every month at 00:30 UTC.
 *
 * Iterates over each archivable table, pushes .jsonl to R2,
 * records a manifest, then purges the source rows from D1.
 */
export async function handleLogArchival(env: Env): Promise<ArchiverSummary> {
  const cutoff = getCutoffDate();
  const summary: ArchiverSummary = {
    tablesProcessed: 0,
    totalRecordsArchived: 0,
    archives: [],
    errors: [],
  };

  console.log(`[LogArchiver] Starting cold storage archival — cutoff: ${cutoff}`);

  for (const target of ARCHIVE_TARGETS) {
    try {
      const result = await archiveTable(env, target, cutoff);
      summary.tablesProcessed++;
      if (result) {
        summary.totalRecordsArchived += result.recordsArchived;
        summary.archives.push(result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LogArchiver] Failed to archive ${target.table}: ${msg}`);
      summary.errors.push(`${target.table}: ${msg}`);
    }
  }

  console.log(
    `[LogArchiver] Complete — ${summary.tablesProcessed} tables, ` +
    `${summary.totalRecordsArchived} records archived, ${summary.errors.length} errors`,
  );

  return summary;
}
