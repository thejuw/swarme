/**
 * scanner.tsx — Phase 59: PLO Scanner Page
 *
 * Animated terminal that simulates fetching a URL's <head> data.
 * After ~4s the results blur and an auth slide-over modal triggers,
 * converting the visitor into a signup.
 *
 * Route: /#/scanner?url=...
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { runScannerAnalysis, type ScannerResult } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SwarmeLogo } from "@/components/swarme-logo";
import {
  Terminal,
  Loader2,
  Lock,
  ArrowRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Scanner boot lines (sequentially revealed) ─────────────
const SCAN_LINES = [
  { text: "Initializing scanner agent...", delay: 0, color: "text-gh-muted" },
  { text: "Resolving DNS...", delay: 500, color: "text-gh-text" },
  { text: "TLS handshake complete ✓", delay: 900, color: "text-neon-emerald" },
  { text: "Fetching <head> element...", delay: 1400, color: "text-neon-cyan" },
  { text: "Parsing meta tags...", delay: 2000, color: "text-gh-text" },
  { text: "Extracting Open Graph data...", delay: 2500, color: "text-neon-purple" },
  { text: "Checking Schema.org markup...", delay: 3000, color: "text-gh-text" },
  { text: "Evaluating SEO signals...", delay: 3400, color: "text-neon-cyan" },
  { text: "Compiling results...", delay: 3800, color: "text-neon-emerald" },
];

function ScanTerminal({ url, onComplete }: { url: string; onComplete: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const timers = SCAN_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(i + 1);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        if (i === SCAN_LINES.length - 1 && !completedRef.current) {
          completedRef.current = true;
          setTimeout(onComplete, 600);
        }
      }, line.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className="rounded-xl border border-gh-border overflow-hidden"
      style={{ background: "#0d1117" }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gh-border bg-gh-surface/60">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-1.5 ml-3">
          <Terminal className="h-3.5 w-3.5 text-gh-muted" />
          <span className="text-xs font-mono text-gh-muted truncate">
            swarme scanner — {url}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="p-4 font-mono text-sm leading-6 min-h-[200px] max-h-[280px] overflow-y-auto"
      >
        {SCAN_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-2 ${line.color}`}
          >
            <span className="text-neon-emerald shrink-0">$</span>
            <span>{line.text}</span>
          </motion.div>
        ))}
        {visibleLines < SCAN_LINES.length && (
          <div className="flex items-center gap-2 text-gh-muted mt-1">
            <Loader2 className="h-3 w-3 animate-spin text-neon-cyan" />
            <span className="text-xs">Processing...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Results panel (gets blurred for unauthenticated users) ──
function ResultsPanel({
  result,
  isBlurred,
}: {
  result: ScannerResult;
  isBlurred: boolean;
}) {
  const { headData, seoScore, issues } = result;

  const scoreColor =
    seoScore >= 80
      ? "text-neon-emerald"
      : seoScore >= 60
        ? "text-yellow-400"
        : "text-red-400";

  const scoreBg =
    seoScore >= 80
      ? "bg-neon-emerald/10 border-neon-emerald/30"
      : seoScore >= 60
        ? "bg-yellow-400/10 border-yellow-400/30"
        : "bg-red-400/10 border-red-400/30";

  const metaTags = [
    { label: "Title", value: headData.title, maxLen: 60 },
    { label: "Description", value: headData.description, maxLen: 160 },
    { label: "Canonical", value: headData.canonical },
    { label: "OG Image", value: headData.ogImage },
    { label: "Generator", value: headData.generator },
    { label: "Robots", value: headData.robots },
    { label: "Viewport", value: headData.viewport },
    { label: "Charset", value: headData.charset },
    { label: "Twitter Card", value: headData.twitterCard },
    { label: "Schema.org", value: headData.schemaOrg ? "Detected ✓" : "Missing ✗" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* SEO Score Badge */}
      <div className={`flex items-center justify-between rounded-lg border p-4 ${scoreBg}`}>
        <div>
          <p className="text-sm font-medium text-gh-text">SEO Health Score</p>
          <p className="text-xs text-gh-muted mt-0.5">Based on &lt;head&gt; analysis</p>
        </div>
        <div className="text-right">
          <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
            {seoScore}
          </span>
          <span className="text-sm text-gh-muted">/100</span>
        </div>
      </div>

      {/* Meta tag grid */}
      <div
        className="rounded-xl border border-gh-border overflow-hidden"
        style={{ background: "#0d1117" }}
      >
        <div className="px-4 py-3 border-b border-gh-border bg-gh-surface/60">
          <p className="text-sm font-medium text-gh-text">Head Tag Analysis</p>
        </div>
        <div className={`divide-y divide-gh-border/40 transition-all duration-500 ${isBlurred ? "blur-[6px] select-none" : ""}`}>
          {metaTags.map((tag) => (
            <div key={tag.label} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-xs font-mono text-gh-muted w-24 shrink-0 pt-0.5">
                {tag.label}
              </span>
              <span className="text-sm text-gh-text break-all flex-1">
                {tag.value || <span className="text-gh-muted italic">Not found</span>}
              </span>
              {tag.value ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Issues list */}
      {issues.length > 0 && (
        <div
          className={`rounded-xl border border-gh-border p-4 transition-all duration-500 ${isBlurred ? "blur-[6px] select-none" : ""}`}
          style={{ background: "#0d1117" }}
        >
          <p className="text-sm font-medium text-gh-text mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            {issues.length} Issues Detected
          </p>
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm text-gh-muted"
              >
                <span className="text-yellow-400 shrink-0 mt-0.5">•</span>
                <span>{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Auth slide-over modal ──────────────────────────────────
function AuthSlideOver({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          {/* Slide-over panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-md z-50 border-l border-gh-border shadow-2xl"
            style={{ background: "#0d1117" }}
            data-testid="scanner-auth-modal"
          >
            <div className="flex flex-col h-full p-6">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-md text-gh-muted hover:text-gh-text hover:bg-gh-surface/60 transition-colors"
                data-testid="button-close-auth-modal"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-neon-emerald/10 border border-neon-emerald/20 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-neon-emerald" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Unlock Full Results
                    </h2>
                    <p className="text-sm text-gh-muted">
                      Create a free account to continue
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {[
                    "Complete head tag analysis with fix suggestions",
                    "Full SEO audit across 200+ signals",
                    "Automated accessibility compliance report",
                    "Performance benchmarks vs. competitors",
                    "AI-powered action plan to improve scores",
                  ].map((benefit, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-neon-emerald shrink-0 mt-0.5" />
                      <span className="text-sm text-gh-text">{benefit}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={() => navigate("/signup")}
                  className="w-full bg-neon-emerald hover:bg-neon-emerald/90 text-white py-3"
                  data-testid="button-scanner-signup"
                >
                  Create Free Account
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>

                <div className="text-center mt-4">
                  <button
                    onClick={() => navigate("/login")}
                    className="text-sm text-neon-cyan hover:underline"
                    data-testid="link-scanner-login"
                  >
                    Already have an account? Sign in
                  </button>
                </div>

                <p className="text-xs text-gh-muted text-center mt-6">
                  No credit card required. Free tier includes 3 audits/month.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main Scanner Page ──────────────────────────────────────
export default function ScannerPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Parse URL from route param: /#/scanner/:encodedUrl
  const [, routeParams] = useRoute("/scanner/:url");
  const scanUrl = routeParams?.url ? decodeURIComponent(routeParams.url) : "";

  const [phase, setPhase] = useState<"scanning" | "results">("scanning");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);

  const analysis = useMutation({
    mutationFn: async () => {
      let normalized = scanUrl.trim();
      if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
      }
      const res = await runScannerAnalysis(normalized);
      if (!res.success || !res.result) {
        throw new Error(res.error || "Scanner failed");
      }
      return res.result;
    },
  });

  // Auto-start scan when page loads with a URL
  useEffect(() => {
    if (scanUrl) {
      analysis.mutate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScanComplete = () => {
    setPhase("results");
    // If user is NOT authenticated, blur results and show auth modal after a brief reveal
    if (!user) {
      setTimeout(() => {
        setIsBlurred(true);
        setTimeout(() => setShowAuthModal(true), 400);
      }, 1200);
    }
  };

  // If no URL provided, redirect to landing
  if (!scanUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d1117" }}>
        <div className="text-center space-y-4">
          <p className="text-gh-muted">No URL provided.</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0d1117" }}>
      {/* Radial gradient backdrop */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88,166,255,0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(137,87,229,0.05), transparent)",
        }}
      />

      {/* Header */}
      <header className="relative border-b border-gh-border/60 bg-gh-surface/20 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <SwarmeLogo className="h-6 w-6 text-white group-hover:text-neon-emerald transition-colors" />
            <span className="text-sm font-semibold text-white">Swarme</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate("/dashboard")}
                className="text-gh-muted hover:text-gh-text"
                data-testid="link-scanner-dashboard"
              >
                Dashboard
              </Button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="text-sm text-gh-muted hover:text-gh-text transition-colors"
                  data-testid="link-scanner-signin"
                >
                  Sign in
                </button>
                <Button
                  size="sm"
                  onClick={() => navigate("/signup")}
                  className="bg-neon-emerald hover:bg-neon-emerald/90 text-white"
                  data-testid="button-scanner-header-signup"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="relative max-w-4xl mx-auto px-4 py-10">
        {/* Scan target header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-neon-cyan" />
            <span className="text-xs font-mono text-gh-muted uppercase tracking-wider">
              Scanner Report
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white truncate" data-testid="text-scanner-url">
            {scanUrl}
          </h1>
        </div>

        {/* Terminal animation (always shows first) */}
        {phase === "scanning" && (
          <ScanTerminal url={scanUrl} onComplete={handleScanComplete} />
        )}

        {/* Results (with conditional blur) */}
        {phase === "results" && analysis.data && (
          <ResultsPanel result={analysis.data} isBlurred={isBlurred} />
        )}

        {/* Error state */}
        {analysis.isError && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gh-text mb-2">
              Unable to scan this URL
            </p>
            <p className="text-xs text-gh-muted mb-4">
              {analysis.error?.message || "An unexpected error occurred."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/")}
              data-testid="button-scanner-retry"
            >
              Try Another URL
            </Button>
          </div>
        )}

        {/* Blurred overlay CTA (visible when blurred) */}
        <AnimatePresence>
          {isBlurred && !showAuthModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center mt-6"
            >
              <Button
                onClick={() => setShowAuthModal(true)}
                className="bg-neon-emerald hover:bg-neon-emerald/90 text-white"
                data-testid="button-unlock-results"
              >
                <Lock className="h-4 w-4 mr-2" />
                Unlock Full Results
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Auth slide-over */}
      <AuthSlideOver
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
