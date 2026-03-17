/**
 * hero.tsx — Phase 30 + Phase 59: GitHub-aesthetic dynamic hero
 *
 * Two-column layout:
 *   Left: Gradient headline + subheadline + URL input + glowing CTA
 *   Right: Animated mock terminal with typing effect
 *
 * Phase 59: Added prominent URL input that routes to /#/scanner?url=...
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { ArrowRight, Terminal, Search } from "lucide-react";

// ── Terminal typing commands ────────────────────────
const COMMANDS = [
  { text: "> Swarm deployed to Shopify...", color: "text-neon-cyan" },
  { text: "> Analyzing DOM structure...", color: "text-gh-text" },
  {
    text: "> Injecting missing ADA alt-text (142 resolved)",
    color: "text-neon-purple",
  },
  { text: "> Pushing to IndexNow... [SUCCESS]", color: "text-neon-emerald" },
  { text: "> CRO heatmap scan complete — 3 hotspots", color: "text-neon-cyan" },
  {
    text: "> Content decay check — 7 pages refreshed",
    color: "text-gh-text",
  },
  {
    text: "> Social queue: 4 posts drafted for approval",
    color: "text-neon-purple",
  },
  { text: "> Lighthouse score: 94 → 98 (+4)", color: "text-neon-emerald" },
];

function useTypingAnimation() {
  const [lines, setLines] = useState<{ text: string; color: string }[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  const advanceChar = useCallback(() => {
    const cmd = COMMANDS[cmdIndex % COMMANDS.length];
    if (charIndex < cmd.text.length) {
      setCurrentText(cmd.text.slice(0, charIndex + 1));
      setCharIndex((c) => c + 1);
    } else {
      // Line finished — push to history, move on
      setLines((prev) => {
        const next = [...prev, { text: cmd.text, color: cmd.color }];
        // Keep last 6 lines visible
        return next.length > 6 ? next.slice(-6) : next;
      });
      setCurrentText("");
      setCharIndex(0);
      setCmdIndex((i) => i + 1);
      setIsTyping(false);
    }
  }, [cmdIndex, charIndex]);

  useEffect(() => {
    if (!isTyping) {
      // Pause between commands
      const pause = setTimeout(() => setIsTyping(true), 800);
      return () => clearTimeout(pause);
    }
    const speed = 28 + Math.random() * 22; // 28-50ms per char
    const timer = setTimeout(advanceChar, speed);
    return () => clearTimeout(timer);
  }, [isTyping, advanceChar]);

  return { lines, currentText, currentColor: COMMANDS[cmdIndex % COMMANDS.length]?.color ?? "text-gh-text" };
}

/** Phase 59: URL input that routes to the scanner page */
function HeroUrlInput() {
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const encoded = encodeURIComponent(trimmed);
    // Navigate to scanner with the URL as a path segment
    // (wouter hash routing doesn't support query strings)
    window.location.hash = `/scanner/${encoded}`;
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-lg" data-testid="hero-url-form">
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gh-muted pointer-events-none" />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter your site URL to scan..."
          className="w-full h-12 pl-10 pr-28 rounded-lg border border-gh-border bg-gh-surface/60 text-gh-text font-mono text-sm placeholder:text-gh-muted/60 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 transition-all"
          data-testid="input-hero-url"
        />
        <button
          type="submit"
          disabled={!url.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-md bg-neon-emerald text-white text-sm font-semibold hover:bg-neon-emerald/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
          data-testid="button-hero-scan"
        >
          Scan
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-xs text-gh-muted mt-2">
        Free instant analysis — no account required.
      </p>
    </form>
  );
}

export function Hero() {
  const [, navigate] = useLocation();
  const { lines, currentText, currentColor } = useTypingAnimation();

  return (
    <section className="relative overflow-hidden min-h-[calc(100vh-3.5rem)]">
      {/* Radial gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88,166,255,0.12), transparent), radial-gradient(ellipse 60% 40% at 80% 50%, rgba(137,87,229,0.08), transparent)",
        }}
      />
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#58a6ff 1px, transparent 1px), linear-gradient(90deg, #58a6ff 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ── Left: Copy ────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gh-border bg-gh-surface/50 mb-6">
              <span className="h-2 w-2 rounded-full bg-neon-emerald animate-pulse" />
              <span className="text-xs font-mono text-gh-muted">
                v3.0 — Edge-native swarm intelligence
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              <span className="bg-gradient-to-r from-white via-gh-text to-gh-muted bg-clip-text text-transparent">
                Deploy an Autonomous
              </span>
              <br />
              <span className="bg-gradient-to-r from-neon-cyan via-neon-emerald to-neon-purple bg-clip-text text-transparent">
                Growth Engineering Team.
              </span>
            </h1>

            <p className="mt-5 text-lg text-gh-muted max-w-lg leading-relaxed">
              12 AI agents analyze your DOM, conduct autonomous research, and
              deploy self-healing SEO — fixing broken schemas, injecting
              missing accessibility attributes, and publishing optimized
              content at the edge. Zero manual intervention.
            </p>

            {/* Phase 59: URL input bar */}
            <HeroUrlInput />

            <div className="mt-5 flex flex-col sm:flex-row items-start gap-3">
              <button
                onClick={() => navigate("/signup")}
                className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-neon-emerald text-white font-semibold text-base animate-glow-pulse hover:bg-neon-emerald/90 transition-colors"
                data-testid="button-hero-cta"
              >
                Deploy Your Swarm
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => {
                  document
                    .getElementById("analyzer")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-gh-border text-gh-text font-medium text-base hover:border-gh-muted/60 hover:bg-gh-surface/50 transition-all"
                data-testid="button-hero-try"
              >
                Free Site Audit
              </button>
            </div>

            {/* Stats strip */}
            <div className="mt-12 flex flex-wrap gap-8">
              {[
                { value: "12", label: "AI Agents" },
                { value: "100%", label: "Edge-native" },
                { value: "<200ms", label: "Avg latency" },
                { value: "24/7", label: "Monitoring" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {s.value}
                  </p>
                  <p className="text-xs text-gh-muted mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Right: Terminal ─────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            {/* Glow behind terminal */}
            <div
              className="absolute -inset-4 rounded-2xl blur-2xl opacity-30 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(88,166,255,0.3), rgba(137,87,229,0.3), rgba(46,160,67,0.3))",
              }}
            />
            {/* Terminal window */}
            <div
              className="relative rounded-xl border border-gh-border overflow-hidden"
              style={{ background: "#0d1117" }}
              data-testid="hero-terminal"
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
                    swarme-agent — bash
                  </span>
                </div>
              </div>
              {/* Terminal body */}
              <div className="p-4 font-mono text-sm leading-6 min-h-[260px] max-h-[260px] flex flex-col justify-end">
                {/* Completed lines */}
                {lines.map((line, i) => (
                  <div key={i} className={`${line.color} opacity-70`}>
                    {line.text}
                  </div>
                ))}
                {/* Currently typing line */}
                <div className={currentColor}>
                  {currentText}
                  <span className="inline-block w-[7px] h-[14px] bg-gh-text ml-0.5 align-text-bottom animate-cursor-blink" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
