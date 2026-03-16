/**
 * analyzer-section.tsx — Phase 30: GitHub-repo-style PLG Analyzer
 *
 * Redesigned "Free Website Analyzer" styled like a GitHub repo search bar.
 * On submit: terminal-style skeleton loader before revealing the risk score.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { runPublicAnalysis, type AnalyzerResult } from "@/lib/api";
import {
  Search,
  ArrowRight,
  Loader2,
  Shield,
  Eye,
  Gauge,
  CheckCircle2,
} from "lucide-react";

// ── Terminal boot lines (shown as skeleton loader) ──
const BOOT_LINES = [
  { text: "Initializing swarm connection...", delay: 0 },
  { text: "Resolving DNS and TLS handshake...", delay: 400 },
  { text: "Spawning crawler agent [edge: DFW]...", delay: 900 },
  { text: "Running Lighthouse audit...", delay: 1500 },
  { text: "Scanning DOM for ADA violations...", delay: 2200 },
  { text: "Checking security headers...", delay: 2800 },
  { text: "Compiling risk assessment...", delay: 3400 },
];

function TerminalLoader({ url }: { url: string }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(i + 1);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, line.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className="rounded-lg border border-gh-border overflow-hidden"
      style={{ background: "#0d1117" }}
    >
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gh-border bg-gh-surface/60">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-xs font-mono text-gh-muted ml-2 truncate">
          swarme audit — {url}
        </span>
      </div>
      {/* Terminal body */}
      <div
        ref={scrollRef}
        className="p-3 font-mono text-xs leading-5 max-h-[180px] overflow-y-auto"
      >
        {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            <span className="text-neon-emerald">✓</span>
            <span className="text-gh-text">{line.text}</span>
          </motion.div>
        ))}
        {visibleLines < BOOT_LINES.length && (
          <div className="flex items-center gap-2 text-gh-muted">
            <Loader2 className="h-3 w-3 animate-spin text-neon-cyan" />
            <span>Processing...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return "text-neon-emerald";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-neon-emerald/10 border-neon-emerald/20";
  if (score >= 60) return "bg-yellow-400/10 border-yellow-400/20";
  return "bg-red-400/10 border-red-400/20";
}

export function AnalyzerSection() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [showLoader, setShowLoader] = useState(false);
  const [, navigate] = useLocation();

  const analysis = useMutation({
    mutationFn: async () => {
      let normalizedUrl = url.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }
      const res = await runPublicAnalysis(normalizedUrl);
      if (!res.success || !res.result) {
        throw new Error(res.error || "Analysis failed");
      }
      return res.result;
    },
    onMutate: () => {
      setResult(null);
      setShowLoader(true);
    },
    onSuccess: (data) => {
      // Show loader for at least 3.5s for dramatic effect
      setTimeout(() => {
        setShowLoader(false);
        setResult(data);
      }, 3800);
    },
    onError: () => {
      setShowLoader(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    analysis.mutate();
  };

  return (
    <section id="analyzer" className="py-20" data-testid="analyzer-section">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-3 py-1 rounded-full border border-gh-border bg-gh-surface/40 text-xs font-mono text-neon-purple mb-4">
            Free Tool
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Audit any website in seconds.
          </h2>
          <p className="mt-3 text-gh-muted">
            Enter a URL. Our swarm agents will crawl, analyze, and score your
            site across SEO, accessibility, performance, and security.
          </p>
        </motion.div>

        {/* GitHub-repo-style search bar */}
        <motion.form
          onSubmit={handleSubmit}
          className="relative flex items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gh-muted" />
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full h-12 pl-10 pr-4 rounded-lg border border-gh-border bg-gh-surface/60 text-gh-text font-mono text-sm placeholder:text-gh-muted/60 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 transition-all"
              data-testid="input-analyzer-url"
            />
          </div>
          <button
            type="submit"
            disabled={analysis.isPending || !url.trim()}
            className="h-12 px-6 rounded-lg bg-neon-emerald text-white font-semibold text-sm shrink-0 hover:bg-neon-emerald/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            data-testid="button-analyze"
          >
            {analysis.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Analyze
          </button>
        </motion.form>

        {/* Terminal skeleton loader */}
        <AnimatePresence>
          {showLoader && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <TerminalLoader url={url} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results card */}
        <AnimatePresence>
          {result && !showLoader && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded-xl border border-gh-border p-5"
              style={{ background: "#0d1117" }}
              data-testid="analyzer-results"
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-5">
                <div className="min-w-0">
                  <p className="text-sm text-gh-text truncate">
                    {result.analyzedUrl}
                  </p>
                  <p className="text-xs text-gh-muted mt-0.5 truncate">
                    {result.pageTitle}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span
                    className={`text-4xl font-bold tabular-nums ${scoreColor(result.overallScore)}`}
                  >
                    {result.overallScore}
                  </span>
                  <span className="text-sm text-gh-muted">/100</span>
                </div>
              </div>

              {/* Score grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "SEO", score: result.seoScore, icon: Search },
                  {
                    label: "Accessibility",
                    score: result.accessibilityScore,
                    icon: Eye,
                  },
                  {
                    label: "Performance",
                    score: result.performanceScore,
                    icon: Gauge,
                  },
                  {
                    label: "Security",
                    score: result.securityScore,
                    icon: Shield,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border ${scoreBg(item.score)}`}
                  >
                    <item.icon className="h-4 w-4 text-gh-muted" />
                    <span className="text-[11px] text-gh-muted">
                      {item.label}
                    </span>
                    <span
                      className={`text-xl font-bold tabular-nums ${scoreColor(item.score)}`}
                    >
                      {item.score}
                    </span>
                  </div>
                ))}
              </div>

              {/* Findings + CTA */}
              {result.findings.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gh-muted">
                    {result.findings.length} issues found
                  </p>
                  <button
                    onClick={() => navigate("/free-analyzer")}
                    className="text-sm text-neon-cyan hover:underline flex items-center gap-1"
                    data-testid="button-full-report"
                  >
                    Full Report
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gh-border/60">
                <button
                  onClick={() => navigate("/signup")}
                  className="w-full py-2.5 rounded-lg bg-neon-emerald text-white font-semibold text-sm hover:bg-neon-emerald/90 transition-colors flex items-center justify-center gap-2"
                  data-testid="button-analyzer-signup"
                >
                  Deploy the Full Swarm
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
