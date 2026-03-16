/**
 * MagicLogin — Phase 27: Passwordless Re-engagement Page
 *
 * This page is the landing destination for magic link URLs sent via
 * retention emails/SMS. It:
 *   1. Extracts the `token` from the URL query string
 *   2. POSTs to /api/auth/magic-verify to exchange for a session JWT
 *   3. On success: auto-logs the user in and redirects to /dashboard
 *   4. On failure: shows a helpful error message with option to login normally
 */

import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type MagicState = "verifying" | "success" | "error" | "expired" | "used";

export default function MagicLogin() {
  const [, navigate] = useLocation();
  const params = useParams<{ token?: string }>();
  const { login } = useAuth();
  const [state, setState] = useState<MagicState>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      // Extract token from route param: /#/magic-login/:token
      // Also check query string as fallback: /#/magic-login?token=xxx
      let token = params.token || null;

      if (!token) {
        const hash = window.location.hash;
        const queryStart = hash.indexOf("?");
        if (queryStart !== -1) {
          const searchParams = new URLSearchParams(hash.slice(queryStart));
          token = searchParams.get("token");
        }
      }

      if (!token) {
        setState("error");
        setErrorMsg("No token found in the URL.");
        return;
      }

      try {
        const res = await apiRequest("POST", "/api/auth/magic-verify", { token });
        const data = await res.json();

        if (data.success && data.token && data.user) {
          // Set auth state immediately so ProtectedRoute sees it
          login(data.token, data.user);
          setState("success");
          // Small delay for the success animation, then navigate
          setTimeout(() => {
            navigate("/dashboard");
          }, 1500);
        } else {
          // Determine specific error type
          if (data.error?.includes("expired")) {
            setState("expired");
          } else if (data.error?.includes("already used")) {
            setState("used");
          } else {
            setState("error");
          }
          setErrorMsg(data.error || "Verification failed");
        }
      } catch (err: any) {
        // Parse error from response body if available
        try {
          const errBody = err?.message || "";
          if (errBody.includes("410") || errBody.includes("already used")) {
            setState("used");
            setErrorMsg("This magic link has already been used.");
          } else if (errBody.includes("401") || errBody.includes("expired")) {
            setState("expired");
            setErrorMsg("This magic link has expired.");
          } else {
            setState("error");
            setErrorMsg("Something went wrong. Please try logging in normally.");
          }
        } catch {
          setState("error");
          setErrorMsg("Something went wrong. Please try logging in normally.");
        }
      }
    };

    verifyToken();
  }, [params.token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Verifying state */}
        {state === "verifying" && (
          <div className="space-y-4" data-testid="magic-login-verifying">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Verifying your magic link...</h1>
            <p className="text-sm text-muted-foreground">Hang tight, we're logging you in securely.</p>
          </div>
        )}

        {/* Success state */}
        {state === "success" && (
          <div className="space-y-4" data-testid="magic-login-success">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Welcome back!</h1>
            <p className="text-sm text-muted-foreground">Redirecting you to your command center...</p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              <span>Your swarm is ready</span>
            </div>
          </div>
        )}

        {/* Expired state */}
        {state === "expired" && (
          <div className="space-y-4" data-testid="magic-login-expired">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Link Expired</h1>
            <p className="text-sm text-muted-foreground">
              This magic link has expired (they last 15 minutes). Please log in with your email and password instead.
            </p>
            <Button
              onClick={() => navigate("/login")}
              className="mt-4"
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </div>
        )}

        {/* Already used state */}
        {state === "used" && (
          <div className="space-y-4" data-testid="magic-login-used">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Already Used</h1>
            <p className="text-sm text-muted-foreground">
              This magic link has already been used. Each link can only be used once for security.
            </p>
            <Button
              onClick={() => navigate("/login")}
              className="mt-4"
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </div>
        )}

        {/* Generic error state */}
        {state === "error" && (
          <div className="space-y-4" data-testid="magic-login-error">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Verification Failed</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button
              onClick={() => navigate("/login")}
              className="mt-4"
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
