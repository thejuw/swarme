/**
 * vectorize.ts — Phase 39: Dynamic Semantic Link Graph
 *
 * Uses Cloudflare Vectorize + Workers AI embeddings to build a
 * semantic map of all published content. When a new article is
 * about to be published, we:
 *  1. Generate an embedding of the new article's primary topic
 *  2. Query Vectorize for the Top 3 most similar historical articles
 *  3. Inject <a> tags into the new HTML pointing to those articles
 *
 * Embedding model: @cf/baai/bge-base-en-v1.5 (768 dimensions)
 * Fallback: OpenAI text-embedding-3-small (1536 dims, truncated)
 *
 * The link injector scans for natural anchor phrases from the
 * matched articles' titles/keywords and wraps the first occurrence
 * in a contextual internal link.
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ArticleMetadata {
  assetId: string;
  projectId: string;
  title: string;
  keyword: string;
  slug: string;
  publishedUrl: string;
}

export interface SimilarArticle {
  assetId: string;
  title: string;
  keyword: string;
  slug: string;
  publishedUrl: string;
  score: number;
}

export interface LinkInjectionResult {
  modifiedHtml: string;
  linksInjected: SimilarArticle[];
  linksAttempted: number;
}

// ─────────────────────────────────────────────────────────────
// Step 1: Generate Embedding via Workers AI
// ─────────────────────────────────────────────────────────────

/**
 * Generate a vector embedding for the given text using Cloudflare
 * Workers AI (BGE-base-en-v1.5, 768 dims). Falls back to OpenAI
 * text-embedding-3-small if Workers AI is unavailable.
 */
export async function generateEmbedding(
  text: string,
  env: Env,
): Promise<number[]> {
  // Truncate to ~500 tokens (~2000 chars) for embedding quality
  const truncated = text.slice(0, 2000);

  try {
    // Primary: Cloudflare Workers AI
    const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [truncated],
    });

    const vectors = (result as { data: number[][] }).data;
    if (vectors?.[0]?.length > 0) {
      return vectors[0];
    }
    throw new Error("Empty embedding returned from Workers AI");
  } catch (err) {
    console.warn(`[Vectorize] Workers AI embedding failed, trying OpenAI: ${err instanceof Error ? err.message : err}`);

    // Fallback: OpenAI text-embedding-3-small
    if (!env.OPENAI_API_KEY) {
      throw new Error("No embedding model available — both Workers AI and OpenAI failed");
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: truncated,
        dimensions: 768, // Match Vectorize index dimensions
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI embedding error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };

    return data.data[0].embedding;
  }
}

// ─────────────────────────────────────────────────────────────
// Step 2: Index Article in Vectorize
// ─────────────────────────────────────────────────────────────

/**
 * Generate an embedding for the article and upsert it into the
 * Vectorize index with metadata for later retrieval.
 *
 * Called after a content asset is published so it becomes
 * discoverable for future link injection.
 */
export async function embedAndIndexArticle(
  assetId: string,
  textContent: string,
  metadata: ArticleMetadata,
  env: Env,
): Promise<void> {
  // Generate embedding from article text
  const embedding = await generateEmbedding(textContent, env);

  // Upsert into Vectorize index
  await env.VECTORIZE.upsert([
    {
      id: assetId,
      values: embedding,
      metadata: {
        projectId: metadata.projectId,
        title: metadata.title,
        keyword: metadata.keyword,
        slug: metadata.slug,
        publishedUrl: metadata.publishedUrl,
      },
    },
  ]);

  console.log(`[Vectorize] Indexed article ${assetId}: "${metadata.title}"`);
}

// ─────────────────────────────────────────────────────────────
// Step 3: Query for Semantically Similar Articles
// ─────────────────────────────────────────────────────────────

/**
 * Query the Vectorize index for the Top N most similar articles
 * to the given text, scoped to the same project.
 *
 * Excludes the article itself (by assetId) if provided.
 */
export async function querySimilarArticles(
  text: string,
  projectId: string,
  env: Env,
  options: {
    topK?: number;
    excludeAssetId?: string;
    minScore?: number;
  } = {},
): Promise<SimilarArticle[]> {
  const { topK = 3, excludeAssetId, minScore = 0.65 } = options;

  // Generate embedding for the query text
  const queryEmbedding = await generateEmbedding(text, env);

  // Query Vectorize with project filter
  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: topK + (excludeAssetId ? 1 : 0), // fetch extra in case we exclude self
    returnMetadata: "all",
    filter: {
      projectId: { $eq: projectId },
    },
  });

  const similar: SimilarArticle[] = [];

  for (const match of results.matches) {
    // Skip self
    if (excludeAssetId && match.id === excludeAssetId) continue;

    // Skip low-relevance matches
    if (match.score < minScore) continue;

    // Stop at topK
    if (similar.length >= topK) break;

    const meta = match.metadata as Record<string, string> | undefined;
    similar.push({
      assetId: match.id,
      title: meta?.title ?? "",
      keyword: meta?.keyword ?? "",
      slug: meta?.slug ?? "",
      publishedUrl: meta?.publishedUrl ?? "",
      score: match.score,
    });
  }

  return similar;
}

// ─────────────────────────────────────────────────────────────
// Step 4: Inject Internal Links into HTML
// ─────────────────────────────────────────────────────────────

/**
 * Scans the article HTML for natural anchor phrases derived from
 * similar articles' titles/keywords and injects contextual <a> tags.
 *
 * Rules:
 *  - Max 3 internal links per article
 *  - Only link the FIRST occurrence of each anchor phrase
 *  - Never inject a link inside an existing <a>, <h1>-<h6>, <code>,
 *    <pre>, <script>, or <style> tag
 *  - Anchor text must be 2+ words to avoid false positives
 *  - Each injected link gets `data-swarme-autolink="true"` for tracking
 */
export function injectInternalLinks(
  html: string,
  similarArticles: SimilarArticle[],
): LinkInjectionResult {
  const linksInjected: SimilarArticle[] = [];
  let modifiedHtml = html;
  let linksAttempted = 0;

  for (const article of similarArticles) {
    if (linksInjected.length >= 3) break;

    // Generate candidate anchor phrases from the article's title and keyword
    const candidates = generateAnchorCandidates(article.title, article.keyword);

    for (const anchor of candidates) {
      if (linksInjected.length >= 3) break;
      linksAttempted++;

      // Find the anchor text in the HTML, but NOT inside existing tags
      const injected = injectSingleLink(modifiedHtml, anchor, article.publishedUrl);
      if (injected !== null) {
        modifiedHtml = injected;
        linksInjected.push(article);
        break; // Move to next article after successful injection
      }
    }
  }

  return { modifiedHtml, linksInjected, linksAttempted };
}

/**
 * Generate candidate anchor phrases from article title and keyword.
 * Returns phrases ordered by specificity (longer first).
 */
function generateAnchorCandidates(title: string, keyword: string): string[] {
  const candidates: string[] = [];

  // Use keyword as primary anchor (most relevant)
  if (keyword && keyword.split(/\s+/).length >= 2) {
    candidates.push(keyword.toLowerCase());
  }

  // Extract meaningful multi-word phrases from title
  // Remove common stop words at start/end and split by common delimiters
  const titlePhrases = title
    .replace(/[—\-–|:,]/g, "|")
    .split("|")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.split(/\s+/).length >= 2 && p.length > 5);

  candidates.push(...titlePhrases);

  // Deduplicate
  return [...new Set(candidates)];
}

/**
 * Inject a single <a> tag for the first occurrence of `anchor`
 * in the HTML body, avoiding existing tags.
 *
 * Returns modified HTML or null if no safe injection point found.
 */
function injectSingleLink(
  html: string,
  anchor: string,
  targetUrl: string,
): string | null {
  // Build a regex that matches the anchor text as a whole word,
  // case-insensitive, but only when NOT inside an HTML tag
  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![<\\/a-zA-Z])\\b(${escapedAnchor})\\b(?![^<]*>)`,
    "i",
  );

  // Find the match
  const match = pattern.exec(html);
  if (!match || match.index === undefined) return null;

  // Verify the match is not inside a forbidden tag
  const before = html.slice(0, match.index);
  if (isInsideForbiddenTag(before)) return null;

  // Build the linked version
  const originalText = match[1]; // Preserve original casing
  const link = `<a href="${targetUrl}" data-swarme-autolink="true" title="${escapeAttr(anchor)}">${originalText}</a>`;

  // Replace only the first occurrence
  return (
    html.slice(0, match.index) +
    link +
    html.slice(match.index + originalText.length)
  );
}

/**
 * Check if the position in the HTML is inside a tag that should
 * not contain injected links.
 */
function isInsideForbiddenTag(htmlBefore: string): boolean {
  // Count open/close tags for forbidden elements
  const forbidden = ["a", "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "script", "style", "button"];

  for (const tag of forbidden) {
    const openPattern = new RegExp(`<${tag}[\\s>]`, "gi");
    const closePattern = new RegExp(`</${tag}>`, "gi");

    const opens = (htmlBefore.match(openPattern) || []).length;
    const closes = (htmlBefore.match(closePattern) || []).length;

    if (opens > closes) return true; // We're inside this tag
  }

  return false;
}

/**
 * Escape a string for use in an HTML attribute value.
 */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────────────────────
// Step 5: Record injected links in D1
// ─────────────────────────────────────────────────────────────

/**
 * Save the injected internal links to the Internal_Links table
 * for analytics and graph visualization.
 */
export async function recordInternalLinks(
  sourceAssetId: string,
  projectId: string,
  injectedLinks: SimilarArticle[],
  env: Env,
): Promise<void> {
  for (const link of injectedLinks) {
    try {
      await env.DB.prepare(
        `INSERT INTO Internal_Links (id, project_id, source_asset_id, target_asset_id, anchor_keyword, similarity_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `il_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          projectId,
          sourceAssetId,
          link.assetId,
          link.keyword || link.title,
          link.score,
        )
        .run();
    } catch (err) {
      console.error(`[Vectorize] Failed to record internal link: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Full Pipeline Helper
// ─────────────────────────────────────────────────────────────

/**
 * Full link injection pipeline:
 *  1. Generate embedding for the new article
 *  2. Query Vectorize for similar published articles
 *  3. Inject internal links into the HTML
 *  4. Record the links in D1
 *  5. Return modified HTML
 *
 * Called from the Durable Object just before CMS push.
 */
export async function injectSemanticLinks(
  assetId: string,
  html: string,
  keyword: string,
  projectId: string,
  env: Env,
): Promise<LinkInjectionResult> {
  try {
    // Query for similar articles (using keyword + first 500 chars of article)
    const queryText = `${keyword}. ${stripHtmlTags(html).slice(0, 500)}`;
    const similarArticles = await querySimilarArticles(queryText, projectId, env, {
      topK: 5, // Fetch 5 to have fallbacks
      excludeAssetId: assetId,
      minScore: 0.65,
    });

    if (similarArticles.length === 0) {
      console.log(`[Vectorize] No similar articles found for "${keyword}" — skipping link injection`);
      return { modifiedHtml: html, linksInjected: [], linksAttempted: 0 };
    }

    // Inject links
    const result = injectInternalLinks(html, similarArticles);

    // Record in D1
    if (result.linksInjected.length > 0) {
      await recordInternalLinks(assetId, projectId, result.linksInjected, env);
      console.log(`[Vectorize] Injected ${result.linksInjected.length} internal links into "${keyword}"`);
    }

    return result;
  } catch (err) {
    // Non-fatal — return original HTML if anything fails
    console.error(`[Vectorize] Link injection failed: ${err instanceof Error ? err.message : err}`);
    return { modifiedHtml: html, linksInjected: [], linksAttempted: 0 };
  }
}

/**
 * Strip HTML tags for plain text extraction.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
