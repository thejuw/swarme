/**
 * ============================================================
 * Swarme — Phase 40: Autonomous Multimedia Generation
 * ============================================================
 *
 * Image generation pipeline using Google Gemini (Imagen), with
 * permanent storage in Cloudflare R2 to prevent hotlinking.
 *
 * Pipeline:
 *   1. Parse `<media-placeholder>` tags from drafted HTML
 *   2. For each placeholder, call Gemini's image generation
 *      endpoint with an optimized prompt
 *   3. Decode the base64 image data from the response
 *   4. Upload to Cloudflare R2 with a UUID filename
 *   5. Replace the placeholder with an ADA-compliant <img> tag
 *      pointing at the permanent R2 public URL
 *
 * Error handling:
 *   - Individual image failures are logged and skipped (the
 *     placeholder is removed from the HTML, never left raw)
 *   - Full pipeline failures degrade gracefully — the draft
 *     HTML is returned with placeholders stripped
 *
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Gemini image generation endpoint (Imagen via Gemini API). */
const GEMINI_IMAGE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

/** Timeout for the Gemini generation request (90 seconds). */
const GEMINI_TIMEOUT_MS = 90_000;

/** Maximum number of placeholders to process per article. */
const MAX_PLACEHOLDERS_PER_ARTICLE = 5;

/** Default image aspect ratio for Gemini. */
const DEFAULT_ASPECT_RATIO = "16:9" as const;

/**
 * Regex to match `<media-placeholder>` tags in generated HTML.
 *
 * Expected format:
 *   <media-placeholder description="A hero image showing..."></media-placeholder>
 *   <media-placeholder description="An infographic illustrating..."/>
 *
 * Captures the `description` attribute value.
 */
const PLACEHOLDER_REGEX =
  /<media-placeholder\s+description="([^"]+)"\s*(?:\/>|><\/media-placeholder>)/gi;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Result from generating and storing a single image. */
export interface GeneratedImage {
  /** UUID-based filename stored in R2. */
  r2Key: string;
  /** Public URL for the stored image. */
  publicUrl: string;
  /** SEO-optimized alt text for the image. */
  altText: string;
  /** The original placeholder description. */
  description: string;
  /** Final prompt sent to the model. */
  generationPrompt: string;
  /** Image size in bytes. */
  sizeBytes: number;
}

/** Per-placeholder processing result. */
export interface PlaceholderResult {
  index: number;
  description: string;
  status: "generated" | "skipped";
  image?: GeneratedImage;
  error?: string;
}

/** Overall result of the media generation pipeline. */
export interface MediaGenerationResult {
  /** Number of placeholders found in the HTML. */
  totalPlaceholders: number;
  /** Number of images successfully generated and stored. */
  imagesGenerated: number;
  /** Number of placeholders that failed (stripped from output). */
  imagesSkipped: number;
  /** Per-placeholder details. */
  details: PlaceholderResult[];
  /** The final HTML with placeholders replaced by <img> tags. */
  processedHtml: string;
}

// ─────────────────────────────────────────────────────────────
// Task 40.1: generateAndStoreImage
// ─────────────────────────────────────────────────────────────

/**
 * Generates an image via Gemini (Imagen) and stores it in Cloudflare R2.
 *
 * Steps:
 *   1. Build an optimized image generation prompt
 *   2. Call the Gemini generateContent API with IMAGE response modality
 *   3. Decode the base64 image data from the response
 *   4. Upload to R2 with a UUID key under `media/{projectId}/`
 *   5. Return the permanent public URL and metadata
 *
 * @param description  Human-readable description from the placeholder
 * @param altText      SEO-optimized alt text for the <img> tag
 * @param projectId    Project ID for R2 key namespacing
 * @param env          Cloudflare Worker environment bindings
 * @returns Generated image metadata including the R2 public URL
 */
export async function generateAndStoreImage(
  description: string,
  altText: string,
  projectId: string,
  env: Env,
): Promise<GeneratedImage> {
  // ── Step 1: Build an optimized prompt ──
  const imagePrompt = buildImagePrompt(description);

  // ── Step 2: Call Gemini Image Generation ──
  const apiKey = await resolveGeminiKey(projectId, env);
  if (!apiKey) {
    throw new Error("No Gemini API key available for image generation");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(`${GEMINI_IMAGE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: imagePrompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: DEFAULT_ASPECT_RATIO,
          },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text().catch(() => "");
    throw new Error(
      `Gemini Image API error ${geminiResponse.status}: ${errorBody.slice(0, 200)}`
    );
  }

  const geminiJson = (await geminiResponse.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  // Extract the base64 image data from the response
  const parts = geminiJson.candidates?.[0]?.content?.parts;
  const imagePart = parts?.find((p) => p.inlineData);

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image data");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  const extension = mimeType.includes("jpeg") ? "jpg" : "png";

  // ── Step 3: Decode the base64 image ──
  const binaryString = atob(imagePart.inlineData.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const imageBytes = bytes.buffer;

  // Guard against unexpectedly large images (20 MB max)
  if (imageBytes.byteLength > 20 * 1024 * 1024) {
    throw new Error(
      `Image too large: ${(imageBytes.byteLength / (1024 * 1024)).toFixed(1)} MB`
    );
  }

  // ── Step 4: Upload to R2 ──
  const uuid = crypto.randomUUID();
  const r2Key = `media/${projectId}/${uuid}.${extension}`;

  await env.MEDIA_BUCKET.put(r2Key, imageBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      description,
      altText,
      projectId,
      generatedAt: new Date().toISOString(),
      model: "gemini-imagen",
    },
  });

  const publicBase = env.R2_PUBLIC_BASE ?? `https://media.swarme.io`;
  const publicUrl = `${publicBase}/${r2Key}`;

  return {
    r2Key,
    publicUrl,
    altText,
    description,
    generationPrompt: imagePrompt,
    sizeBytes: imageBytes.byteLength,
  };
}

// ─────────────────────────────────────────────────────────────
// Task 40.2: Placeholder Parsing & HTML Injection
// ─────────────────────────────────────────────────────────────

/**
 * Extracts all `<media-placeholder>` tags from the HTML.
 *
 * @param html  The drafted article HTML
 * @returns Array of { index, description, fullMatch } for each placeholder
 */
export function extractPlaceholders(
  html: string,
): Array<{ index: number; description: string; fullMatch: string }> {
  const results: Array<{ index: number; description: string; fullMatch: string }> = [];
  let match: RegExpExecArray | null;
  let i = 0;

  // Reset the regex (global flag means it tracks lastIndex)
  PLACEHOLDER_REGEX.lastIndex = 0;

  while ((match = PLACEHOLDER_REGEX.exec(html)) !== null) {
    results.push({
      index: i++,
      description: match[1],
      fullMatch: match[0],
    });

    // Safety: enforce max placeholder limit
    if (results.length >= MAX_PLACEHOLDERS_PER_ARTICLE) break;
  }

  return results;
}

/**
 * Generates an SEO-optimized alt text from a placeholder description
 * and the article keyword context.
 *
 * @param description  The placeholder's description attribute
 * @param keyword      The target keyword for the article
 * @returns A concise, descriptive alt text (max 125 chars)
 */
export function generateAltText(description: string, keyword: string): string {
  // Build a concise alt text that incorporates the keyword naturally
  const cleaned = description
    .replace(/^(a |an |the )/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Capitalize first letter
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // Include keyword if not already present (case-insensitive)
  const keywordLower = keyword.toLowerCase();
  if (!capitalized.toLowerCase().includes(keywordLower)) {
    const alt = `${capitalized} — ${keyword}`;
    return alt.length > 125 ? alt.slice(0, 122) + "..." : alt;
  }

  return capitalized.length > 125
    ? capitalized.slice(0, 122) + "..."
    : capitalized;
}

/**
 * Builds an ADA-compliant `<img>` tag for injection into the HTML.
 *
 * @param publicUrl  The permanent R2 URL
 * @param altText    SEO-optimized alt text
 * @returns A complete <img> tag with loading="lazy" and proper attributes
 */
export function buildImgTag(publicUrl: string, altText: string): string {
  // Escape HTML entities in alt text to prevent XSS
  const escapedAlt = altText
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return [
    `<figure class="swarme-media" role="img" aria-label="${escapedAlt}">`,
    `  <img src="${publicUrl}" alt="${escapedAlt}" loading="lazy" decoding="async"`,
    `    style="max-width:100%;height:auto;" />`,
    `</figure>`,
  ].join("\n");
}

/**
 * Full media generation pipeline: parses placeholders, generates
 * images, stores in R2, and injects <img> tags into the HTML.
 *
 * This is the main entry point called from the Durable Object
 * pipeline after the DRAFTING step.
 *
 * @param html       The drafted article HTML (may contain `<media-placeholder>` tags)
 * @param keyword    The target keyword for the article
 * @param projectId  Project ID for R2 key namespacing
 * @param env        Cloudflare Worker environment bindings
 * @returns The processed HTML and generation details
 */
export async function processMediaPlaceholders(
  html: string,
  keyword: string,
  projectId: string,
  env: Env,
): Promise<MediaGenerationResult> {
  const placeholders = extractPlaceholders(html);

  if (placeholders.length === 0) {
    return {
      totalPlaceholders: 0,
      imagesGenerated: 0,
      imagesSkipped: 0,
      details: [],
      processedHtml: html,
    };
  }

  const details: PlaceholderResult[] = [];
  let processedHtml = html;

  // Process placeholders sequentially to respect API rate limits
  for (const placeholder of placeholders) {
    const altText = generateAltText(placeholder.description, keyword);

    try {
      const image = await generateAndStoreImage(
        placeholder.description,
        altText,
        projectId,
        env,
      );

      // Replace the placeholder with the real <img> tag
      const imgTag = buildImgTag(image.publicUrl, image.altText);
      processedHtml = processedHtml.replace(placeholder.fullMatch, imgTag);

      details.push({
        index: placeholder.index,
        description: placeholder.description,
        status: "generated",
        image,
      });

      console.log(
        `[Media] Generated image ${placeholder.index + 1}/${placeholders.length}: ${image.r2Key} (${(image.sizeBytes / 1024).toFixed(0)} KB)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(
        `[Media] Failed to generate image for placeholder ${placeholder.index + 1}: ${message}`
      );

      // Strip the failed placeholder from the HTML instead of leaving it raw
      processedHtml = processedHtml.replace(placeholder.fullMatch, "");

      details.push({
        index: placeholder.index,
        description: placeholder.description,
        status: "skipped",
        error: message,
      });
    }
  }

  return {
    totalPlaceholders: placeholders.length,
    imagesGenerated: details.filter((d) => d.status === "generated").length,
    imagesSkipped: details.filter((d) => d.status === "skipped").length,
    details,
    processedHtml,
  };
}

// ─────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Builds an optimized image generation prompt from a placeholder description.
 *
 * Adds style guidance to produce professional, editorial-quality
 * images that match the Swarme brand aesthetic.
 */
function buildImagePrompt(description: string): string {
  return [
    description,
    "",
    "Style: Professional editorial photography / clean infographic style.",
    "The image should be suitable for a premium blog article.",
    "Use modern, vibrant colors with clean composition.",
    "No text overlays, watermarks, or logos.",
  ].join("\n");
}

/**
 * Resolves the Gemini API key, checking per-project KV first,
 * then falling back to the Worker secret.
 */
async function resolveGeminiKey(
  projectId: string,
  env: Env,
): Promise<string | null> {
  const KV_KEY = `config:project:${projectId}:gemini_api_key`;
  const projectKey = await env.CONFIG_KV.get(KV_KEY);
  return projectKey || env.GEMINI_API_KEY || null;
}


