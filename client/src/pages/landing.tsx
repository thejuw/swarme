/**
 * landing.tsx — Phase 30: GitHub-aesthetic homepage redesign
 *
 * Complete overhaul of the public landing page with a premium,
 * developer-focused, dynamic aesthetic inspired by GitHub's homepage.
 * Deep dark backgrounds, neon accent glows, scroll-driven animations,
 * bento grid features, and an animated terminal hero.
 */

import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  Cpu,
  BarChart3,
} from "lucide-react";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Hero } from "@/components/landing/hero";
import { ScrollSpine, SpineNode } from "@/components/landing/scroll-spine";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { AnalyzerSection } from "@/components/landing/analyzer-section";
import { Footer } from "@/components/footer";

// ── Section reveal wrapper ──────────────────────
function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── How It Works ────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: Globe,
      title: "Connect Your Store",
      desc: "Link your Shopify, WordPress, or custom site. The swarm maps your entire domain in minutes.",
      color: "#58a6ff",
    },
    {
      step: "02",
      icon: Cpu,
      title: "Agents Deploy",
      desc: "12 specialized agents activate — crawling, auditing, writing, optimizing, and publishing at the edge.",
      color: "#2ea043",
    },
    {
      step: "03",
      icon: BarChart3,
      title: "Watch Rankings Climb",
      desc: "Real-time dashboards track every metric. Revenue attribution shows exactly what the swarm earned.",
      color: "#8957e5",
    },
  ];

  return (
    <section className="py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 rounded-full border border-gh-border bg-gh-surface/40 text-xs font-mono text-neon-emerald mb-4">
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Three steps. Zero babysitting.
            </h2>
          </div>
        </RevealSection>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <RevealSection key={s.step} delay={i * 0.1}>
              <div className="text-center group">
                <div
                  className="inline-flex items-center justify-center h-14 w-14 rounded-xl border border-gh-border mb-4 transition-colors group-hover:border-opacity-60"
                  style={{
                    background: `${s.color}0d`,
                    borderColor: `${s.color}30`,
                  }}
                >
                  <s.icon
                    className="h-6 w-6"
                    style={{ color: s.color }}
                  />
                </div>
                <p className="text-xs font-mono text-gh-muted mb-2">
                  Step {s.step}
                </p>
                <h3 className="font-semibold text-white text-base mb-1">
                  {s.title}
                </h3>
                <p className="text-sm text-gh-muted leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </RevealSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────
function FinalCTA() {
  const [, navigate] = useLocation();

  return (
    <section className="py-20 relative overflow-hidden">
      {/* Radial background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 100%, rgba(46,160,67,0.08), transparent)",
        }}
      />
      <div className="relative max-w-2xl mx-auto text-center px-4 sm:px-6">
        <RevealSection>
          <SwarmeLogo className="h-10 w-10 text-white mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to deploy your swarm?
          </h2>
          <p className="mt-3 text-gh-muted text-lg">
            Start a free trial. No credit card required.
          </p>
          <button
            onClick={() => navigate("/signup")}
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-neon-emerald text-white font-semibold text-base animate-glow-pulse hover:bg-neon-emerald/90 transition-colors"
            data-testid="button-final-cta"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-5 flex items-center justify-center gap-5 text-sm text-gh-muted">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald" />
              No credit card
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald" />
              14-day free trial
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-neon-emerald" />
              Cancel anytime
            </span>
          </div>
        </RevealSection>
      </div>
    </section>
  );
}

// ── Main Landing Page ─────────────────────────

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen text-gh-text"
      style={{ background: "#0d1117" }}
    >
      {/* ── Navigation ─────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gh-border/60 backdrop-blur-md"
        style={{ background: "rgba(13,17,23,0.85)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14">
          <div className="flex items-center gap-2.5">
            <SwarmeLogo className="h-7 w-7 text-white" />
            <span className="font-semibold tracking-tight text-sm text-white">
              Swarme
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="text-sm text-gh-muted hover:text-white transition-colors px-3 py-1.5"
              data-testid="link-pricing-nav"
            >
              Pricing
            </button>
            <button
              onClick={() => navigate("/login")}
              className="text-sm text-gh-muted hover:text-white transition-colors px-3 py-1.5"
              data-testid="link-login"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="text-sm font-medium text-white bg-gh-surface border border-gh-border rounded-md px-4 py-1.5 hover:bg-gh-border/50 transition-colors"
              data-testid="link-signup"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────── */}
      <Hero />

      {/* ── Spine + Content sections ──────── */}
      <ScrollSpine>
        {/* Divider */}
        <div className="border-t border-gh-border/40" />
        <SpineNode color="#58a6ff" />

        {/* Features Bento Grid */}
        <Features />

        <SpineNode color="#2ea043" />
        <div className="border-t border-gh-border/40" />

        {/* How It Works */}
        <HowItWorks />

        <SpineNode color="#8957e5" />
        <div className="border-t border-gh-border/40" />

        {/* PLG Analyzer */}
        <AnalyzerSection />

        <SpineNode color="#2ea043" />
        <div className="border-t border-gh-border/40" />

        {/* Pricing */}
        <Pricing />

        <SpineNode color="#58a6ff" />
        <div className="border-t border-gh-border/40" />
      </ScrollSpine>

      {/* ── Final CTA ────────────────────── */}
      <FinalCTA />

      {/* ── Footer ────────────────────────── */}
      <div style={{ background: "#0d1117" }}>
        <Footer />
      </div>
    </div>
  );
}
