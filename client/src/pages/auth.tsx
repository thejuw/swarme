/**
 * auth.tsx — Phase 19: Login & Signup Pages
 *
 * Clean, dark-first authentication forms using Shadcn Card + Input.
 * Routes: /#/login and /#/signup
 */

import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { authLogin, authRegister } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Loader2, AlertCircle } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { getRewardfulReferralId } from "@/hooks/use-rewardful";

/** Site key — set via VITE_TURNSTILE_SITE_KEY env or use Cloudflare's always-pass test key */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";

// ─────────────────────────────────────────────────────────────
// Shared AuthForm component
// ─────────────────────────────────────────────────────────────

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "signup" && password !== confirmPassword) {
        throw new Error(t("auth.passwordMismatch"));
      }
      if (password.length < 8) {
        throw new Error(t("auth.passwordTooShort"));
      }
      if (mode === "signup" && !acceptedTerms) {
        throw new Error("You must accept the terms to continue.");
      }
      if (mode === "login") {
        const result = await authLogin(email, password, turnstileToken);
        if (!result.success || !result.token || !result.user) {
          throw new Error(result.error || t("auth.genericError"));
        }
        return result;
      }
      // Signup: capture Rewardful referral ID if present
      const referralId = getRewardfulReferralId();
      const result = await authRegister(email, password, turnstileToken, referralId, true);
      if (!result.success || !result.token || !result.user) {
        throw new Error(result.error || t("auth.genericError"));
      }
      return result;
    },
    onSuccess: (data) => {
      login(data.token!, data.user!);
      // On signup, go to connect-store (integration wizard / free trial);
      // on login, go to dashboard.
      navigate(mode === "signup" ? "/connect-store" : "/");
    },
    onError: (err: Error) => {
      setError(err.message);
      // Reset Turnstile widget so user can retry
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTermsError(false);
    if (mode === "signup" && !acceptedTerms) {
      setTermsError(true);
      setError("You must accept the terms to continue.");
      return;
    }
    mutation.mutate();
  };

  const isLogin = mode === "login";
  const title = isLogin ? t("auth.loginTitle") : t("auth.signupTitle");
  const subtitle = isLogin ? t("auth.loginSubtitle") : t("auth.signupSubtitle");
  const submitLabel = isLogin ? t("auth.loginButton") : t("auth.signupButton");
  const switchLabel = isLogin ? t("auth.noAccount") : t("auth.hasAccount");
  const switchRoute = isLogin ? "/signup" : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo + Brand */}
        <div className="flex flex-col items-center mb-8">
          <SwarmeLogo className="h-10 w-10 text-foreground mb-3" />
          <span className="text-lg font-semibold tracking-tight">Swarme</span>
          <span className="text-xs text-muted-foreground font-mono mt-0.5">
            EDGE SEO SWARM
          </span>
        </div>

        <Card className="border border-border/60">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">{title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  {t("auth.emailLabel")}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  {t("auth.passwordLabel")}
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  data-testid="input-password"
                />
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("auth.confirmPasswordLabel")}
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t("auth.confirmPasswordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </div>
              )}

              {/* Phase 28: Terms acceptance checkbox (signup only) */}
              {!isLogin && (
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="accept-terms"
                      checked={acceptedTerms}
                      onCheckedChange={(checked) => {
                        setAcceptedTerms(checked === true);
                        if (checked) setTermsError(false);
                      }}
                      className={termsError ? "border-destructive" : ""}
                      data-testid="checkbox-accept-terms"
                    />
                    <label
                      htmlFor="accept-terms"
                      className="text-sm leading-tight text-muted-foreground cursor-pointer"
                    >
                      I agree to the{" "}
                      <a
                        href="/#/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                        data-testid="link-terms-inline"
                      >
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a
                        href="/#/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                        data-testid="link-privacy-inline"
                      >
                        Privacy Policy
                      </a>
                      .
                    </label>
                  </div>
                  {termsError && (
                    <p className="text-xs text-destructive" data-testid="text-terms-error">
                      You must accept the terms to continue.
                    </p>
                  )}
                </div>
              )}

              {/* Invisible Turnstile widget */}
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                options={{ size: "invisible", theme: "dark" }}
                onSuccess={(token) => setTurnstileToken(token)}
                onError={() => setTurnstileToken(undefined)}
                onExpire={() => setTurnstileToken(undefined)}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
                data-testid="button-auth-submit"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {submitLabel}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => navigate(switchRoute)}
                className="text-primary hover:underline font-medium"
                data-testid="link-auth-switch"
              >
                {switchLabel}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {t("auth.termsNotice")}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Exported page components
// ─────────────────────────────────────────────────────────────

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function SignupPage() {
  return <AuthForm mode="signup" />;
}
