/**
 * provisioning.tsx — Phase 59: Provisioning Theatre
 *
 * Dark terminal with sequential log lines over 4-6s,
 * simulating swarm agent deployment. Auto-redirects to
 * the dashboard on completion.
 *
 * Route: /#/onboarding/provisioning
 * Layout: Standalone fullscreen terminal
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Terminal, CheckCircle2, Loader2 } from "lucide-react";

// ── Provisioning log lines ──────────────────────────────
const PROVISION_LINES = [
  { text: "Initializing Swarme Edge Runtime...", delay: 0, status: "run" },
  { text: "Allocating Durable Object: swarm-controller", delay: 500, status: "run" },
  { text: "Deploying Worker: seo-auditor@edge-dfw", delay: 1000, status: "ok" },
  { text: "Deploying Worker: content-engine@edge-iad", delay: 1500, status: "ok" },
  { text: "Deploying Worker: accessibility-scanner@edge-lhr", delay: 1900, status: "ok" },
  { text: "Provisioning D1 database: swarme-prod", delay: 2400, status: "run" },
  { text: "Running migrations (0001 -> 0037)...", delay: 2900, status: "ok" },
  { text: "Seeding KV namespace: CONFIG_KV", delay: 3300, status: "ok" },
  { text: "Bootstrapping Vectorize index: brand-memory", delay: 3700, status: "run" },
  { text: "Registering 12 swarm agents...", delay: 4100, status: "ok" },
  { text: "Enabling real-time telemetry feed...", delay: 4500, status: "ok" },
  { text: "Running initial site baseline audit...", delay: 4900, status: "run" },
  { text: "Swarm deployment complete ✓", delay: 5400, status: "done" },
];

function StatusIcon({ status }: { status: string }) {
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald" />;
  }
  if (status === "ok") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald/70" />;
  }
  return <Loader2 className="h-3.5 w-3.5 text-neon-cyan animate-spin" />;
}

export default function Provisioning() {
  const [, navigate] = useLocation();
  const [visibleLines, setVisibleLines] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setIsComplete(true);
    // Auto-redirect to dashboard after brief pause
    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    const timers = PROVISION_LINES.map((line, i) =>
      setTimeout(() => {
        setVisibleLines(i + 1);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        if (i === PROVISION_LINES.length - 1) {
          setTimeout(handleComplete, 800);
        }
      }, line.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [handleComplete]);

  // Progress percentage
  const progress = Math.round((visibleLines / PROVISION_LINES.length) * 100);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d1117" }}>
      {/* Radial gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(46,160,67,0.08), transparent)",
        }}
      />

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center relative px-4">
        <div className="w-full max-w-2xl">
          {/* Brand + tagline */}
          <div className="flex items-center gap-3 mb-6">
            <SwarmeLogo className="h-8 w-8 text-white" />
            <div>
              <h1 className="text-lg font-semibold text-white">
                Deploying Your Swarm
              </h1>
              <p className="text-xs text-gh-muted font-mono">
                Edge workers are being provisioned globally
              </p>
            </div>
          </div>

          {/* Terminal window */}
          <div
            className="rounded-xl border border-gh-border overflow-hidden"
            style={{ background: "#0d1117" }}
            data-testid="provisioning-terminal"
          >
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gh-border bg-gh-surface/60">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex items-center gap-1.5 ml-3">
                <Terminal className="h-3.5 w-3.5 text-gh-muted" />
                <span className="text-xs font-mono text-gh-muted">
                  swarme provisioning — edge deployment
                </span>
              </div>
              <span className="ml-auto text-xs font-mono text-gh-muted tabular-nums">
                {progress}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-gh-surface">
              <motion.div
                className="h-full bg-neon-emerald"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            {/* Terminal body */}
            <div
              ref={scrollRef}
              className="p-4 font-mono text-sm leading-7 min-h-[300px] max-h-[380px] overflow-y-auto"
            >
              {PROVISION_LINES.slice(0, visibleLines).map((line, i) => {
                const isLatest = i === visibleLines - 1 && !isComplete;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`flex items-center gap-2.5 ${
                      line.status === "done"
                        ? "text-neon-emerald font-medium"
                        : isLatest
                          ? "text-gh-text"
                          : "text-gh-muted"
                    }`}
                  >
                    {isLatest && line.status === "run" ? (
                      <Loader2 className="h-3.5 w-3.5 text-neon-cyan animate-spin shrink-0" />
                    ) : (
                      <StatusIcon status={line.status} />
                    )}
                    <span>{line.text}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Completion message */}
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 text-center"
            >
              <p className="text-sm text-neon-emerald font-medium">
                All systems operational — redirecting to dashboard...
              </p>
              <div className="flex justify-center mt-3">
                <Loader2 className="h-4 w-4 text-neon-emerald animate-spin" />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
