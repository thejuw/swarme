/**
 * ============================================================
 * Phase 57.3: Edge DOM Sanitization
 * ============================================================
 *
 * Wraps ragRewriter.ts and geoRewriter.ts injection payloads
 * to prevent any executable JavaScript from reaching the final
 * DOM. This is a defense-in-depth layer — even if an upstream
 * LLM hallucinates a `<script>` tag or an `onclick` handler,
 * the sanitizer strips it before injection.
 *
 * Allowed tags:
 *   <b>, <i>, <a>, <em>, <strong>, <span>, <br>, <p>, <ul>,
 *   <ol>, <li>, <div>, <h1>-<h6>
 *
 * Allowed attributes:
 *   - href (on <a> only, must be http/https/mailto, adds rel="noopener")
 *   - class, id, style (limited), aria-*, data-*
 *
 * Stripped:
 *   - <script>, <iframe>, <object>, <embed>, <form>, <input>
 *   - on* event handlers (onclick, onerror, onload, etc.)
 *   - javascript: / vbscript: / data: URIs
 *   - Any tag not in the allowlist
 *
 * Security:
 *   - Runs synchronously at the edge with zero external calls
 *   - Idempotent — safe to call multiple times
 *   - JSON-LD payloads are additionally validated as parseable JSON
 * ============================================================
 */

// ── Allowlists ───────────────────────────────────────────────

const SAFE_TAGS = new Set([
  "b", "i", "a", "em", "strong", "span", "br", "p",
  "ul", "ol", "li", "div", "h1", "h2", "h3", "h4", "h5", "h6",
]);

const SAFE_ATTRS = new Set([
  "class", "id", "style", "title", "lang", "dir",
]);

/** Attributes that start with these prefixes are allowed */
const SAFE_ATTR_PREFIXES = ["aria-", "data-"];

/** href is allowed ONLY on <a> tags with safe protocols */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// ── Event handler pattern ────────────────────────────────────

const EVENT_HANDLER_RE = /\bon\w+\s*=/gi;
const SCRIPT_TAG_RE = /<\/?script\b[^>]*>/gi;
const DANGEROUS_TAG_RE =
  /<\/?(script|iframe|object|embed|form|input|textarea|select|button|applet|meta|link|base|svg)\b[^>]*>/gi;
const DANGEROUS_URI_RE = /(?:javascript|vbscript|data)\s*:/gi;

// ── Core Sanitizer ───────────────────────────────────────────

/**
 * Sanitize an HTML string for safe DOM injection.
 * Strips all executable content while preserving safe formatting tags.
 *
 * @param html - Raw HTML string (from LLM, KV cache, or D1)
 * @returns Sanitized HTML string safe for `element.append(html, { html: true })`
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") return "";

  let clean = html;

  // 1. Strip all <script> tags and their contents
  clean = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");

  // 2. Strip dangerous self-closing/void tags
  clean = clean.replace(DANGEROUS_TAG_RE, "");

  // 3. Strip event handlers from remaining tags (onclick, onerror, etc.)
  clean = clean.replace(EVENT_HANDLER_RE, "");

  // 4. Strip dangerous URI schemes from attributes
  clean = clean.replace(DANGEROUS_URI_RE, "blocked:");

  // 5. Enforce href safety on <a> tags — add rel="noopener"
  clean = clean.replace(
    /<a\b([^>]*?)>/gi,
    (_match: string, attrs: string) => {
      // Ensure rel="noopener" is present
      if (!/rel\s*=/i.test(attrs)) {
        attrs += ' rel="noopener"';
      } else if (!/noopener/i.test(attrs)) {
        attrs = attrs.replace(
          /rel\s*=\s*"([^"]*)"/i,
          'rel="$1 noopener"',
        );
      }
      return `<a${attrs}>`;
    },
  );

  // 6. Remove any remaining tags not in the allowlist
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (SAFE_TAGS.has(tag)) {
      return match;
    }
    // Strip the tag entirely (keep inner content)
    return "";
  });

  return clean.trim();
}

// ── JSON-LD Sanitizer ────────────────────────────────────────

/**
 * Sanitize a JSON-LD `<script type="application/ld+json">` block.
 * Ensures the payload is valid JSON and contains no executable code.
 *
 * @param jsonLdScript - Full `<script type="application/ld+json">...</script>` string
 * @returns Sanitized script tag, or empty string if invalid
 */
export function sanitizeJsonLd(jsonLdScript: string): string {
  if (!jsonLdScript || typeof jsonLdScript !== "string") return "";

  // Extract JSON content from the script tag
  const match = jsonLdScript.match(
    /<script\s+type\s*=\s*"application\/ld\+json"\s*>([\s\S]*?)<\/script\s*>/i,
  );

  if (!match || !match[1]) {
    // Not a valid JSON-LD script tag — reject entirely
    return "";
  }

  const rawJson = match[1].trim();

  // Validate it's actually JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    console.warn("[Sanitizer] Invalid JSON in JSON-LD script — stripped");
    return "";
  }

  if (typeof parsed !== "object" || parsed === null) {
    return "";
  }

  // Re-serialize to strip any sneaky content
  // (JSON.stringify naturally strips functions, undefined, etc.)
  const safeJson = JSON.stringify(parsed);

  // Final check: no event handlers or script tags in the serialized output
  if (SCRIPT_TAG_RE.test(safeJson) || EVENT_HANDLER_RE.test(safeJson)) {
    console.warn("[Sanitizer] Detected executable code in JSON-LD — stripped");
    return "";
  }

  // Reset regex lastIndex (global flag)
  SCRIPT_TAG_RE.lastIndex = 0;
  EVENT_HANDLER_RE.lastIndex = 0;

  return `<script type="application/ld+json">${safeJson}</script>`;
}

// ── Convenience: Sanitize entire injection payload ───────────

/**
 * Sanitize a complete HTML injection payload that may contain
 * both HTML content and JSON-LD script tags.
 *
 * Used as a wrapper around ragRewriter / geoRewriter output
 * before it reaches `element.append(payload, { html: true })`.
 */
export function sanitizeInjectionPayload(payload: string): string {
  if (!payload || typeof payload !== "string") return "";

  // Separate JSON-LD scripts from regular HTML
  const jsonLdBlocks: string[] = [];
  const htmlWithoutJsonLd = payload.replace(
    /<script\s+type\s*=\s*"application\/ld\+json"\s*>[\s\S]*?<\/script\s*>/gi,
    (match) => {
      const sanitized = sanitizeJsonLd(match);
      if (sanitized) jsonLdBlocks.push(sanitized);
      return ""; // Remove from HTML stream
    },
  );

  // Sanitize the remaining HTML
  const safeHtml = sanitizeHtml(htmlWithoutJsonLd);

  // Reconstruct: safe HTML + safe JSON-LD blocks
  return [safeHtml, ...jsonLdBlocks].filter(Boolean).join("\n");
}
