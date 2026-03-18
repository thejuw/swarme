/**
 * ============================================================
 * Phase 61: Memory Compressor — Background Worker
 * ============================================================
 *
 * Runs daily at midnight UTC via the scheduled cron handler.
 *
 * For each domain:
 *   1. Fetch all Chat_History rows older than 48 hours that
 *      haven't been compressed yet (compressed = 0).
 *   2. Pass the raw transcript to Perplexity Sonar (lightweight)
 *      with a compression prompt that extracts durable facts.
 *   3. Insert the extracted facts into User_Memories.
 *   4. Mark the processed Chat_History rows as compressed = 1.
 *
 * This prevents the Chat_History table from growing unbounded
 * while preserving strategic insights in long-term memory.
 * ============================================================
 */

import type { Env } from "../index";

interface CompressibleBatch {
  domain_id: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
}

interface CompressorResult {
  domainsProcessed: number;
  messagesCompressed: number;
  factsExtracted: number;
  errors: number;
}

/**
 * Main entry point — called by handleScheduled on the daily midnight cron.
 */
export async function handleMemoryCompression(
  env: Env
): Promise<CompressorResult> {
  const result: CompressorResult = {
    domainsProcessed: 0,
    messagesCompressed: 0,
    factsExtracted: 0,
    errors: 0,
  };

  // Step 1: Find all uncompressed messages older than 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { results: rawRows } = await env.DB.prepare(
    `SELECT id, domain_id, role, content, created_at
     FROM Chat_History
     WHERE compressed = 0
       AND created_at < ?
     ORDER BY domain_id, created_at ASC
     LIMIT 500`
  )
    .bind(cutoff)
    .all<{
      id: string;
      domain_id: string;
      role: string;
      content: string;
      created_at: string;
    }>();

  if (!rawRows || rawRows.length === 0) {
    console.log("[memoryCompressor] No messages to compress.");
    return result;
  }

  // Step 2: Group messages by domain_id
  const batches = new Map<string, CompressibleBatch>();
  for (const row of rawRows) {
    let batch = batches.get(row.domain_id);
    if (!batch) {
      batch = { domain_id: row.domain_id, messages: [] };
      batches.set(row.domain_id, batch);
    }
    batch.messages.push({
      id: row.id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    });
  }

  console.log(
    `[memoryCompressor] Processing ${batches.size} domain(s), ${rawRows.length} total messages`
  );

  // Step 3: Compress each batch
  // Retrieve Perplexity API key (same logic as aiManager)
  const globalConfig = await env.CONFIG_KV.get<Record<string, Record<string, string>>>(
    "global:config:keys",
    "json"
  );
  const vaultKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY;
  const apiKey =
    vaultKey && vaultKey.trim().length > 10
      ? vaultKey.trim()
      : env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.error("[memoryCompressor] No Perplexity API key available. Skipping compression.");
    return result;
  }

  for (const [domainId, batch] of batches) {
    try {
      const facts = await compressBatch(batch, apiKey);
      result.domainsProcessed++;

      // Insert extracted facts into User_Memories
      for (const fact of facts) {
        const factId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await env.DB.prepare(
          `INSERT INTO User_Memories (id, domain_id, memory_fact, source)
           VALUES (?, ?, ?, 'compressor')`
        )
          .bind(factId, domainId, fact)
          .run();
        result.factsExtracted++;
      }

      // Mark messages as compressed
      const ids = batch.messages.map((m) => m.id);
      // D1 doesn't support IN with bound arrays, so batch in groups
      for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        const placeholders = chunk.map(() => "?").join(",");
        await env.DB.prepare(
          `UPDATE Chat_History SET compressed = 1 WHERE id IN (${placeholders})`
        )
          .bind(...chunk)
          .run();
      }

      result.messagesCompressed += batch.messages.length;

      console.log(
        `[memoryCompressor] ${domainId}: compressed ${batch.messages.length} messages into ${facts.length} fact(s)`
      );
    } catch (err) {
      result.errors++;
      console.error(
        `[memoryCompressor] Error processing domain ${domainId}: ${err}`
      );
    }
  }

  return result;
}

/**
 * Takes a batch of messages and calls the LLM to extract durable facts.
 * Returns an array of single-sentence memory facts.
 */
async function compressBatch(
  batch: CompressibleBatch,
  apiKey: string
): Promise<string[]> {
  // Build the transcript
  const transcript = batch.messages
    .map(
      (m) =>
        `[${m.created_at}] ${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
    )
    .join("\n\n");

  const compressionPrompt = `You are a memory extraction engine for an AI SEO platform called Swarme.

Below is a transcript of a conversation between a user and their AI Strategy Officer. Your task is to extract any permanent, durable facts that should be remembered for future sessions.

Extract ONLY facts that are:
- User preferences (tone, style, communication preferences)
- Strategic decisions (business model changes, new goals, pivots)
- Brand identity facts (target audience shifts, competitor updates)
- Important milestones or numbers (revenue targets, traffic goals)
- Technical preferences (preferred tools, integrations, workflows)

Do NOT extract:
- Greetings or pleasantries
- Temporary requests ("make this shorter")
- Questions the user asked (unless they reveal a preference)
- Information that is already stored in Brand_Context

Output each fact as a single sentence on its own line. If there are no durable facts to extract, output exactly: NONE

--- TRANSCRIPT ---
${transcript}
--- END TRANSCRIPT ---`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You are a precise fact extraction engine. Output only the requested facts, one per line. No preamble, no numbering, no bullets." },
        { role: "user", content: compressionPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity compression failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices[0]?.message?.content?.trim() ?? "";

  if (raw === "NONE" || raw.length === 0) {
    return [];
  }

  // Split by newlines, trim, and filter empty lines
  return raw
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length > 10 && line.length < 500);
}
