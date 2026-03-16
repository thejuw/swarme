/**
 * Phase 54.1 — API Fuzzing & Race Condition Engine
 *
 * Tests:
 *   1. Payload fuzzing: malformed JSON, invalid JWT, extreme strings, SQL injection
 *   2. Race condition: 50 simultaneous deductFunds calls on $200 balance
 *      — exactly 1 must succeed, 49 must fail
 *
 * Results logged to Chaos_Logs table.
 */

// ── Types ────────────────────────────────────────────────────

export interface ChaosLogEntry {
  id: string;
  domain_id: string;
  test_type: "api_fuzz" | "race_condition" | "prompt_injection" | "xss_escape";
  severity: "critical" | "high" | "medium" | "low" | "info";
  test_name: string;
  payload: string | null;
  expected: string;
  actual: string;
  passed: boolean;
  metadata: string | null;
  run_id: string;
  created_at: string;
}

export interface FuzzResult {
  run_id: string;
  total_tests: number;
  passed: number;
  failed: number;
  critical_failures: number;
  logs: ChaosLogEntry[];
}

// ── Fuzz Payloads ────────────────────────────────────────────

const MALFORMED_JSON_PAYLOADS = [
  { name: "empty_body", payload: "" },
  { name: "null_body", payload: "null" },
  { name: "bare_string", payload: '"just a string"' },
  { name: "unclosed_object", payload: '{"key": "value"' },
  { name: "trailing_comma", payload: '{"key": "value",}' },
  { name: "nested_bomb", payload: JSON.stringify({ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: "deep" } } } } } } } } } }) },
  { name: "array_instead_of_object", payload: "[1,2,3]" },
  { name: "number_body", payload: "42" },
  { name: "boolean_body", payload: "true" },
  { name: "unicode_escape_bomb", payload: '{"key": "\\u0000\\u0001\\u0002"}' },
];

const INVALID_JWT_PAYLOADS = [
  { name: "empty_bearer", token: "" },
  { name: "no_bearer_prefix", token: "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.invalid" },
  { name: "malformed_jwt", token: "Bearer not.a.jwt" },
  { name: "expired_jwt", token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid" },
  { name: "null_signature", token: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0." },
  { name: "algorithm_none_attack", token: "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoic3VwZXJhZG1pbiJ9." },
];

const EXTREME_STRING_PAYLOADS = [
  { name: "mega_string_1mb", generator: () => "A".repeat(1_000_000) },
  { name: "null_bytes", generator: () => "test\x00injection\x00here" },
  { name: "unicode_rtl_override", generator: () => "normal\u202Edetcejni\u202Ctext" },
  { name: "emoji_bomb", generator: () => "😀".repeat(10_000) },
  { name: "zalgo_text", generator: () => "ẗ̷̡̧̗̣̱̲̦̪̻̤̻̟̖̫̫̜́̑̐͊̊̏̈̏̿̓̅͂͠e̷̜̰̗̰̮̮̤̼̲͊̆̃s̷̰̰̣̣̝̹̲͉̏̅̿͑̎̿̈͆̈́̚̕t̶̢̨̛̙̰̮̝̝̱̪̮͉̂̄̔̑͊̿̃̌̓̆" },
  { name: "script_tag", generator: () => '<script>alert("xss")</script>' },
  { name: "prototype_pollution", generator: () => JSON.stringify({ "__proto__": { "isAdmin": true } }) },
];

const SQL_INJECTION_PAYLOADS = [
  { name: "classic_or_1eq1", payload: "' OR 1=1 --" },
  { name: "union_select", payload: "' UNION SELECT id, email, password_hash FROM Users --" },
  { name: "stacked_query", payload: "'; DROP TABLE Users; --" },
  { name: "blind_time_based", payload: "' AND (SELECT CASE WHEN (1=1) THEN sqlite3_sleep(5000) ELSE 0 END) --" },
  { name: "hex_encoded", payload: "0x27204f5220313d31202d2d" },
  { name: "double_encode", payload: "%2527%2520OR%25201%253D1%2520--" },
  { name: "comment_bypass", payload: "admin'/**/OR/**/1=1--" },
  { name: "batch_insert", payload: "'); INSERT INTO Chaos_Logs (id, domain_id, test_type, severity, test_name, passed, run_id) VALUES ('pwned','dom_001','api_fuzz','critical','sql_escape',0,'evil'); --" },
];

// ── Helpers ──────────────────────────────────────────────────

function makeLogId(): string {
  return `chaos_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function makeRunId(): string {
  return `run_${Date.now()}_${crypto.randomUUID().split("-")[0]}`;
}

function buildLog(
  partial: Omit<ChaosLogEntry, "id" | "created_at">
): ChaosLogEntry {
  return {
    ...partial,
    id: makeLogId(),
    created_at: new Date().toISOString(),
  };
}

// ── 1. Payload Fuzz Tests ────────────────────────────────────

/**
 * Fuzz API endpoints with malformed JSON, invalid JWTs, extreme strings, and SQL injection.
 * The server should reject all payloads with appropriate HTTP error codes — never 5xx.
 */
export async function runPayloadFuzzer(
  env: Env,
  domainId: string,
  apiBaseUrl: string
): Promise<ChaosLogEntry[]> {
  const runId = makeRunId();
  const logs: ChaosLogEntry[] = [];

  // ── Malformed JSON payloads against a POST endpoint ──
  for (const test of MALFORMED_JSON_PAYLOADS) {
    let statusCode = 0;
    let responseBody = "";
    try {
      const resp = await fetch(`${apiBaseUrl}/api/credits/deduct`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock_test_token" },
        body: test.payload,
      });
      statusCode = resp.status;
      responseBody = await resp.text().catch(() => "");
    } catch (e: any) {
      responseBody = e.message;
    }

    // Server must return 4xx, never 5xx or 2xx
    const passed = statusCode >= 400 && statusCode < 500;
    logs.push(
      buildLog({
        domain_id: domainId,
        test_type: "api_fuzz",
        severity: !passed && statusCode >= 500 ? "critical" : !passed ? "high" : "info",
        test_name: `malformed_json:${test.name}`,
        payload: test.payload.slice(0, 500),
        expected: "HTTP 4xx rejection",
        actual: `HTTP ${statusCode}: ${responseBody.slice(0, 200)}`,
        passed,
        metadata: null,
        run_id: runId,
      })
    );
  }

  // ── Invalid JWT payloads ──
  for (const test of INVALID_JWT_PAYLOADS) {
    let statusCode = 0;
    let responseBody = "";
    try {
      const resp = await fetch(`${apiBaseUrl}/api/projects/proj_001/settings`, {
        method: "GET",
        headers: { Authorization: test.token },
      });
      statusCode = resp.status;
      responseBody = await resp.text().catch(() => "");
    } catch (e: any) {
      responseBody = e.message;
    }

    const passed = statusCode === 401 || statusCode === 403;
    logs.push(
      buildLog({
        domain_id: domainId,
        test_type: "api_fuzz",
        severity: !passed ? "critical" : "info",
        test_name: `invalid_jwt:${test.name}`,
        payload: test.token.slice(0, 200),
        expected: "HTTP 401 or 403",
        actual: `HTTP ${statusCode}: ${responseBody.slice(0, 200)}`,
        passed,
        metadata: null,
        run_id: runId,
      })
    );
  }

  // ── Extreme strings in request body fields ──
  for (const test of EXTREME_STRING_PAYLOADS) {
    const extremeValue = test.generator();
    let statusCode = 0;
    let responseBody = "";
    try {
      const resp = await fetch(`${apiBaseUrl}/api/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock_test_token" },
        body: JSON.stringify({ title: extremeValue, body: "normal body", domain_id: domainId }),
      });
      statusCode = resp.status;
      responseBody = await resp.text().catch(() => "");
    } catch (e: any) {
      responseBody = e.message;
    }

    // Must not crash (5xx), should validate/reject or sanitize
    const passed = statusCode < 500;
    logs.push(
      buildLog({
        domain_id: domainId,
        test_type: "api_fuzz",
        severity: statusCode >= 500 ? "critical" : "info",
        test_name: `extreme_string:${test.name}`,
        payload: extremeValue.slice(0, 300),
        expected: "No 5xx server error",
        actual: `HTTP ${statusCode}: ${responseBody.slice(0, 200)}`,
        passed,
        metadata: JSON.stringify({ payload_length: extremeValue.length }),
        run_id: runId,
      })
    );
  }

  // ── SQL injection payloads in query parameters ──
  for (const test of SQL_INJECTION_PAYLOADS) {
    let statusCode = 0;
    let responseBody = "";
    try {
      const resp = await fetch(
        `${apiBaseUrl}/api/content?domain_id=${encodeURIComponent(test.payload)}&project_id=proj_001`,
        {
          method: "GET",
          headers: { Authorization: "Bearer mock_test_token" },
        }
      );
      statusCode = resp.status;
      responseBody = await resp.text().catch(() => "");
    } catch (e: any) {
      responseBody = e.message;
    }

    // Must not leak data or crash — should return 4xx or empty 200
    const bodyLower = responseBody.toLowerCase();
    const leakedData =
      bodyLower.includes("password_hash") ||
      bodyLower.includes("sqlite_") ||
      bodyLower.includes("syntax error");
    const passed = statusCode < 500 && !leakedData;

    logs.push(
      buildLog({
        domain_id: domainId,
        test_type: "api_fuzz",
        severity: leakedData ? "critical" : statusCode >= 500 ? "high" : "info",
        test_name: `sql_injection:${test.name}`,
        payload: test.payload,
        expected: "No data leak, no 5xx",
        actual: `HTTP ${statusCode}, leaked=${leakedData}: ${responseBody.slice(0, 200)}`,
        passed,
        metadata: null,
        run_id: runId,
      })
    );
  }

  return logs;
}

// ── 2. Race Condition Test ───────────────────────────────────

/**
 * Race condition test: fire 50 simultaneous deductFunds calls
 * for $150 each on a $200 balance.
 *
 * EXPECTED: Exactly 1 succeeds, 49 fail with InsufficientCreditsError.
 * If >1 succeeds, the wallet has a critical race condition vulnerability.
 */
export async function runRaceConditionTest(
  env: Env,
  domainId: string,
  apiBaseUrl: string
): Promise<ChaosLogEntry[]> {
  const runId = makeRunId();
  const logs: ChaosLogEntry[] = [];
  const CONCURRENT_REQUESTS = 50;
  const DEDUCT_AMOUNT = 150;
  const INITIAL_BALANCE = 200;

  // Step 1: Reset balance to exactly $200 for deterministic testing
  try {
    await env.DB.prepare(
      "UPDATE Credit_Balances SET available_credits = ?1 WHERE domain_id = ?2"
    ).bind(INITIAL_BALANCE, domainId).run();
  } catch {
    // If no balance row exists, we still proceed — the deduct calls will fail on their own
  }

  // Step 2: Fire 50 simultaneous deduction requests
  const promises: Promise<{ status: number; body: string }>[] = [];

  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(
      fetch(`${apiBaseUrl}/api/credits/deduct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock_test_token",
        },
        body: JSON.stringify({
          domain_id: domainId,
          amount: DEDUCT_AMOUNT,
          description: `chaos_race_test_${i}`,
          reference_id: `race_${runId}_${i}`,
        }),
      }).then(async (r) => ({
        status: r.status,
        body: await r.text().catch(() => ""),
      })).catch((e) => ({
        status: 0,
        body: e.message,
      }))
    );
  }

  const results = await Promise.all(promises);

  // Step 3: Count successes and failures
  const successes = results.filter((r) => r.status >= 200 && r.status < 300);
  const failures = results.filter((r) => r.status >= 400 || r.status === 0);

  // Step 4: Read final balance
  let finalBalance = -1;
  try {
    const row = await env.DB.prepare(
      "SELECT available_credits FROM Credit_Balances WHERE domain_id = ?1"
    ).bind(domainId).first<{ available_credits: number }>();
    finalBalance = row?.available_credits ?? -1;
  } catch {
    // Ignore — we report what we can
  }

  // Step 5: Evaluate
  const exactlyOneSuccess = successes.length === 1;
  const balanceCorrect = finalBalance === INITIAL_BALANCE - DEDUCT_AMOUNT; // $50
  const passed = exactlyOneSuccess && balanceCorrect;

  // Determine severity
  let severity: ChaosLogEntry["severity"] = "info";
  if (!passed) {
    severity = successes.length > 1 ? "critical" : "high";
  }

  logs.push(
    buildLog({
      domain_id: domainId,
      test_type: "race_condition",
      severity,
      test_name: "concurrent_deduct_funds_50x",
      payload: JSON.stringify({
        concurrent_requests: CONCURRENT_REQUESTS,
        deduct_amount: DEDUCT_AMOUNT,
        initial_balance: INITIAL_BALANCE,
      }),
      expected: `Exactly 1 success out of ${CONCURRENT_REQUESTS}, final balance = $${INITIAL_BALANCE - DEDUCT_AMOUNT}`,
      actual: `${successes.length} successes, ${failures.length} failures, final balance = $${finalBalance}`,
      passed,
      metadata: JSON.stringify({
        success_count: successes.length,
        failure_count: failures.length,
        final_balance: finalBalance,
        success_responses: successes.map((s) => s.body.slice(0, 100)),
        sample_failure: failures[0]?.body.slice(0, 200) ?? null,
      }),
      run_id: runId,
    })
  );

  // If multiple successes, that's the critical double-spend vulnerability
  if (successes.length > 1) {
    logs.push(
      buildLog({
        domain_id: domainId,
        test_type: "race_condition",
        severity: "critical",
        test_name: "double_spend_detected",
        payload: null,
        expected: "1 deduction on $200 balance",
        actual: `${successes.length} deductions succeeded — potential loss of $${(successes.length - 1) * DEDUCT_AMOUNT}`,
        passed: false,
        metadata: JSON.stringify({
          financial_impact: (successes.length - 1) * DEDUCT_AMOUNT,
          attack_vector: "parallel HTTP requests to /api/credits/deduct",
          remediation: "Implement atomic compare-and-swap or database-level row locking",
        }),
        run_id: runId,
      })
    );
  }

  return logs;
}

// ── Persistence ──────────────────────────────────────────────

/**
 * Batch-insert chaos logs into D1.
 */
export async function persistChaosLogs(
  env: Env,
  logs: ChaosLogEntry[]
): Promise<void> {
  if (logs.length === 0) return;

  // D1 batch limit is 100 statements
  const BATCH_SIZE = 50;
  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const batch = logs.slice(i, i + BATCH_SIZE);
    const stmts = batch.map((log) =>
      env.DB.prepare(
        `INSERT INTO Chaos_Logs (id, domain_id, test_type, severity, test_name, payload, expected, actual, passed, metadata, run_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      ).bind(
        log.id,
        log.domain_id,
        log.test_type,
        log.severity,
        log.test_name,
        log.payload,
        log.expected,
        log.actual,
        log.passed ? 1 : 0,
        log.metadata,
        log.run_id,
        log.created_at
      )
    );
    await env.DB.batch(stmts);
  }
}

// ── Orchestrator ─────────────────────────────────────────────

/**
 * Run the full API fuzz + race condition suite.
 */
export async function runApiFuzzer(
  env: Env,
  domainId: string,
  apiBaseUrl: string
): Promise<FuzzResult> {
  const allLogs: ChaosLogEntry[] = [];

  // 1. Payload fuzzing
  const fuzzLogs = await runPayloadFuzzer(env, domainId, apiBaseUrl);
  allLogs.push(...fuzzLogs);

  // 2. Race condition test
  const raceLogs = await runRaceConditionTest(env, domainId, apiBaseUrl);
  allLogs.push(...raceLogs);

  // 3. Persist all results
  await persistChaosLogs(env, allLogs);

  // 4. Summarize
  const criticalFailures = allLogs.filter(
    (l) => !l.passed && l.severity === "critical"
  ).length;

  return {
    run_id: allLogs[0]?.run_id ?? makeRunId(),
    total_tests: allLogs.length,
    passed: allLogs.filter((l) => l.passed).length,
    failed: allLogs.filter((l) => !l.passed).length,
    critical_failures: criticalFailures,
    logs: allLogs,
  };
}
