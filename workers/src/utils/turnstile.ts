/**
 * turnstile.ts — Phase 22: Cloudflare Turnstile server-side verification.
 *
 * Validates Turnstile tokens via the siteverify endpoint.
 * If TURNSTILE_SECRET_KEY is not configured, verification is
 * silently skipped (graceful degradation for dev / early setup).
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResult {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify a Turnstile token server-side.
 *
 * @param token   The `cf-turnstile-response` token from the client widget.
 * @param ip      The connecting client IP (from CF-Connecting-IP header).
 * @param secret  The TURNSTILE_SECRET_KEY from env / vault.
 * @returns       `true` if verified (or if secret is empty — graceful bypass).
 *                `false` if verification explicitly failed.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip: string | undefined,
  secret: string | undefined
): Promise<boolean> {
  // Graceful bypass: if secret not configured, skip verification
  if (!secret) {
    console.log("[Turnstile] Secret not configured — skipping verification");
    return true;
  }

  if (!token) {
    console.warn("[Turnstile] No token provided");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);
    if (ip) {
      formData.append("remoteip", ip);
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const result: TurnstileVerifyResult = await response.json();

    if (!result.success) {
      console.warn("[Turnstile] Verification failed:", result["error-codes"]);
    }

    return result.success;
  } catch (error) {
    console.error("[Turnstile] Verification error:", error);
    // Fail open on network errors to avoid blocking legitimate users
    return true;
  }
}
