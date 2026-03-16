/**
 * ============================================================
 * Phase 56.1: Autonomous 404 Self-Healer (Link Rot Detection)
 * ============================================================
 *
 * Runs as a weekly cron job. For every active domain:
 *   1. HEAD-request each URL in Managed_Links
 *   2. Mark dead links (4xx/5xx or network error)
 *   3. For dead links: query Vectorize for a semantic match
 *      among live pages on the same domain
 *   4. If a suitable replacement is found, store it in
 *      replacement_url and flag for HTMLRewriter link swap
 *   5. Log all actions to Action_History for audit trail
 *
 * The HTMLRewriter integration reads Managed_Links at edge
 * and swaps dead target_urls with their replacement_url.
 *
 * Security:
 *   - All D1 queries use parameterized inputs
 *   - HEAD requests use a 5-second timeout
 *   - Vectorize queries use domain_id as namespace
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

interface ManagedLink {
  id: string;
  domain_id: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  link_type: string;
  last_status: number | null;
  is_alive: number;
}

interface LinkRotResult {
  domainsScanned: number;
  linksChecked: number;
  deadLinksFound: number;
  replacementsFound: number;
  errors: string[];
}

// ── Constants ────────────────────────────────────────────────

const HEAD_TIMEOUT_MS = 5000;
const BATCH_SIZE = 50; // Links per domain per run
const SIMILARITY_THRESHOLD = 0.72; // Minimum cosine similarity for replacement

// ── Main Cron Handler ────────────────────────────────────────

export async function handleLinkRotCron(env: Env): Promise<LinkRotResult> {
  const errors: string[] = [];
  let domainsScanned = 0;
  let linksChecked = 0;
  let deadLinksFound = 0;
  let replacementsFound = 0;

  // Get all active domains
  const domainsResult = await env.DB.prepare(
    `SELECT DISTINCT d.id
     FROM Domains d
     JOIN Projects p ON p.domain_id = d.id
     WHERE p.is_active = 1`,
  ).all<{ id: string }>();

  const domains = domainsResult.results || [];

  for (const domain of domains) {
    domainsScanned++;

    // Fetch links to check for this domain
    const linksResult = await env.DB.prepare(
      `SELECT id, domain_id, source_url, target_url, anchor_text, link_type, last_status, is_alive
       FROM Managed_Links
       WHERE domain_id = ?
       ORDER BY last_checked ASC NULLS FIRST
       LIMIT ?`,
    )
      .bind(domain.id, BATCH_SIZE)
      .all<ManagedLink>();

    const links = linksResult.results || [];

    for (const link of links) {
      linksChecked++;

      try {
        // ── HEAD request with timeout ──
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          HEAD_TIMEOUT_MS,
        );

        let status: number;
        try {
          const res = await fetch(link.target_url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
            headers: {
              "User-Agent": "SwarmeBot/1.0 (Link Health Check)",
            },
          });
          status = res.status;
        } catch (fetchErr) {
          // Network error or timeout — treat as dead
          status = 0;
        } finally {
          clearTimeout(timeoutId);
        }

        const isAlive = status >= 200 && status < 400;
        const now = new Date().toISOString();

        // Update link status in DB
        await env.DB.prepare(
          `UPDATE Managed_Links
           SET last_status = ?, last_checked = ?, is_alive = ?
           WHERE id = ?`,
        )
          .bind(status, now, isAlive ? 1 : 0, link.id)
          .run();

        if (!isAlive) {
          deadLinksFound++;

          // ── Vectorize semantic search for replacement ──
          let replacementUrl: string | null = null;
          try {
            replacementUrl = await findSemanticReplacement(
              env,
              link.domain_id,
              link.anchor_text || link.target_url,
              link.target_url,
            );
          } catch (vecErr) {
            const msg =
              vecErr instanceof Error ? vecErr.message : "Unknown";
            errors.push(
              `Vectorize search failed for ${link.target_url}: ${msg}`,
            );
          }

          if (replacementUrl) {
            replacementsFound++;
            await env.DB.prepare(
              `UPDATE Managed_Links SET replacement_url = ? WHERE id = ?`,
            )
              .bind(replacementUrl, link.id)
              .run();
          }

          // Log dead link to Action_History
          await env.DB.prepare(
            `INSERT INTO Action_History
               (id, domain_id, project_id, agent_type, action, entity_type, entity_id, details, created_at, rolled_back)
             VALUES (?, ?, 'system', 'link_healer', 'DEAD_LINK_DETECTED', 'link', ?, ?, datetime('now'), 0)`,
          )
            .bind(
              crypto.randomUUID(),
              link.domain_id,
              link.id,
              JSON.stringify({
                target_url: link.target_url,
                source_url: link.source_url,
                status,
                replacement_url: replacementUrl,
                anchor_text: link.anchor_text,
              }),
            )
            .run();

          console.log(
            `[Link Rot] Dead link: ${link.target_url} (${status})` +
            (replacementUrl
              ? ` → replacement: ${replacementUrl}`
              : " → no replacement found"),
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown";
        errors.push(`Error checking ${link.target_url}: ${msg}`);
      }
    }
  }

  return {
    domainsScanned,
    linksChecked,
    deadLinksFound,
    replacementsFound,
    errors,
  };
}

// ── Vectorize Semantic Replacement Finder ────────────────────

async function findSemanticReplacement(
  env: Env,
  domainId: string,
  searchText: string,
  deadUrl: string,
): Promise<string | null> {
  // Generate embedding for the anchor text / dead URL context
  const embeddingResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: [searchText],
  });

  const embedding = embeddingResult?.data?.[0];
  if (!embedding || embedding.length === 0) {
    return null;
  }

  // Query Vectorize for similar content within the same domain namespace
  const queryResult = await env.VECTORIZE.query(
    new Float32Array(embedding),
    {
      topK: 5,
      namespace: domainId,
    },
  );

  if (!queryResult.matches || queryResult.matches.length === 0) {
    return null;
  }

  // Find the best match that isn't the dead URL itself
  for (const match of queryResult.matches) {
    if (match.score < SIMILARITY_THRESHOLD) {
      break; // Results are sorted by score descending
    }

    // Extract URL from vector metadata
    const matchUrl =
      (match.metadata as Record<string, string> | undefined)?.url || null;

    if (matchUrl && matchUrl !== deadUrl) {
      return matchUrl;
    }
  }

  return null;
}
