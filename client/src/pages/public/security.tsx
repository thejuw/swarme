/**
 * security.tsx — Public Security & Compliance page
 *
 * Security posture, compliance certifications, and data handling policies.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { ArrowLeft, Shield, Lock, Server, Eye, FileCheck, Globe } from "lucide-react";

export default function SecurityPage() {
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
            data-testid="button-security-back"
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
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-security-title">
          Security & Compliance
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Enterprise-grade security built into every layer of the platform.
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* Compliance badges */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">
              Compliance & Certifications
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { icon: Shield, label: "SOC 2 Type II", desc: "Audit in progress" },
                { icon: FileCheck, label: "GDPR", desc: "Fully compliant" },
                { icon: Globe, label: "CCPA", desc: "Fully compliant" },
                { icon: Lock, label: "ISO 27001", desc: "Roadmap H2 2026" },
                { icon: Server, label: "HIPAA", desc: "Available on Enterprise" },
                { icon: Eye, label: "Penetration Testing", desc: "Annual third-party audits" },
              ].map((item) => (
                <div key={item.label} className="border border-border/60 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 text-foreground">
                    <item.icon className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium text-xs">{item.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Data Handling */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Data Handling
            </h2>
            <ul className="space-y-3">
              <li>
                <span className="text-foreground font-medium">Encryption at rest and in transit.</span>{" "}
                All data is encrypted using AES-256 at rest and TLS 1.3 in transit. API keys and CMS
                credentials are stored in Cloudflare Workers KV with envelope encryption.
              </li>
              <li>
                <span className="text-foreground font-medium">Edge-native processing.</span>{" "}
                Agent workloads run on Cloudflare Workers within the same region as your users.
                Data never traverses unnecessary network hops or centralized data centers.
              </li>
              <li>
                <span className="text-foreground font-medium">Zero-retention logging.</span>{" "}
                We do not store raw request/response payloads beyond the 72-hour operational window.
                Aggregated metrics are retained for 12 months. PII is scrubbed on ingestion.
              </li>
              <li>
                <span className="text-foreground font-medium">Tenant isolation.</span>{" "}
                Every customer operates within a dedicated Durable Object namespace. D1 queries are
                scoped by domain_id to prevent cross-tenant data leakage.
              </li>
            </ul>
          </section>

          {/* Access Control */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Access Control
            </h2>
            <ul className="space-y-3">
              <li>
                <span className="text-foreground font-medium">Role-based access.</span>{" "}
                Four distinct roles (Superadmin, Admin, Editor, Viewer) with granular permission matrices.
                API tokens inherit the issuing user's role permissions.
              </li>
              <li>
                <span className="text-foreground font-medium">Multi-factor authentication.</span>{" "}
                TOTP and WebAuthn supported. Enterprise plans enforce MFA for all team members.
              </li>
              <li>
                <span className="text-foreground font-medium">Audit logging.</span>{" "}
                Every administrative action is recorded with actor, timestamp, and diff.
                Logs are immutable and available for 24 months on Enterprise plans.
              </li>
            </ul>
          </section>

          {/* Reporting */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Vulnerability Reporting
            </h2>
            <p>
              Found a security issue? We operate a responsible disclosure program. Please report
              vulnerabilities to{" "}
              <a href="mailto:security@swarme.io" className="text-primary hover:underline">
                security@swarme.io
              </a>. We acknowledge reports within 24 hours and aim to resolve critical issues
              within 72 hours. We do not pursue legal action against good-faith researchers.
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
