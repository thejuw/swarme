/**
 * about.tsx — Public About page
 *
 * Company overview, mission, and team values.
 * Matches legal pages pattern: sticky header + prose layout + Footer.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { ArrowLeft, Zap, Shield, Globe, Users } from "lucide-react";

export default function AboutPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-about-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <SwarmeLogo className="h-5 w-5 text-foreground" />
            <span className="font-semibold tracking-tight text-sm">Swarme</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 flex-1">
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-about-title">
          About Swarme
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          The autonomous SEO platform built for the edge.
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* Mission */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Our Mission
            </h2>
            <p>
              Swarme was founded on a simple premise: SEO shouldn't require an army of specialists
              manually monitoring rankings, rewriting meta tags, and chasing algorithm updates.
              We built a platform where 12 specialized AI agents operate continuously at the edge,
              handling everything from technical audits to content optimization — autonomously.
            </p>
          </section>

          {/* Values grid */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-5">
              What Drives Us
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { icon: Zap, title: "Speed at Scale", desc: "Every agent runs on Cloudflare Workers — sub-50ms cold starts across 300+ global edge locations." },
                { icon: Shield, title: "Security First", desc: "SOC 2 Type II ready. Your data never leaves the edge. Zero-trust architecture by default." },
                { icon: Globe, title: "Global by Design", desc: "Multi-language, multi-region support. Your SEO strategy adapts to local search behavior automatically." },
                { icon: Users, title: "Human in the Loop", desc: "Agents draft, humans approve. Every significant change requires explicit operator sign-off." },
              ].map((v) => (
                <div key={v.title} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground">
                    <v.icon className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{v.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Team */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              The Team
            </h2>
            <p>
              We're a distributed team of engineers, search specialists, and AI researchers
              who have collectively built infrastructure serving billions of requests. Our backgrounds
              span Cloudflare, Google Search, and Y Combinator-backed startups. We believe the future
              of SEO is autonomous, transparent, and operator-controlled.
            </p>
          </section>

          {/* Contact CTA */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Get in Touch
            </h2>
            <p>
              Interested in partnering, investing, or joining the team?
              Reach out at{" "}
              <a href="mailto:hello@swarme.io" className="text-primary hover:underline">
                hello@swarme.io
              </a>{" "}
              or visit our{" "}
              <button
                onClick={() => navigate("/contact")}
                className="text-primary hover:underline"
              >
                contact page
              </button>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <div style={{ background: "#0d1117" }}>
        <Footer />
      </div>
    </div>
  );
}
