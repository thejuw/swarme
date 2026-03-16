/**
 * developers.tsx — Public Developer Hub page
 *
 * API overview, integration guide, code samples, and developer resources.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Code2, Key, Webhook, Terminal, BookOpen, Zap } from "lucide-react";

const API_ENDPOINTS = [
  { method: "GET", path: "/api/v1/audits", desc: "List site audits with pagination and filters" },
  { method: "POST", path: "/api/v1/audits/run", desc: "Trigger a new audit for a domain" },
  { method: "GET", path: "/api/v1/keywords", desc: "Retrieve tracked keywords and rankings" },
  { method: "GET", path: "/api/v1/content/drafts", desc: "List AI-generated content drafts" },
  { method: "POST", path: "/api/v1/content/approve/:id", desc: "Approve a draft for publishing" },
  { method: "GET", path: "/api/v1/agents/status", desc: "Check health and status of all 12 agents" },
];

export default function DevelopersPage() {
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
            data-testid="button-developers-back"
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
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-developers-title">
          Developer Hub
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Build on Swarme with our REST API, webhooks, and integration guides.
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* Quick start cards */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Key, title: "Authentication", desc: "Bearer token auth. Generate API keys from your Settings dashboard." },
              { icon: Webhook, title: "Webhooks", desc: "Real-time event delivery for audits, content, and agent status changes." },
              { icon: Zap, title: "Rate Limits", desc: "1,000 req/min on Pro. 10,000 req/min on Enterprise. Burst-friendly." },
            ].map((card) => (
              <div key={card.title} className="border border-border/60 rounded-lg p-4 space-y-1.5">
                <card.icon className="h-4 w-4 text-primary mb-1" />
                <h3 className="text-sm font-medium text-foreground">{card.title}</h3>
                <p className="text-xs leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </section>

          {/* API Reference */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">
              API Reference
            </h2>
            <p className="mb-4">
              Base URL: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">https://api.swarme.io/v1</code>
            </p>
            <div className="border border-border/60 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-foreground w-24">Method</th>
                    <th className="text-left px-3 py-2 font-medium text-foreground">Endpoint</th>
                    <th className="text-left px-3 py-2 font-medium text-foreground hidden sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {API_ENDPOINTS.map((ep, i) => (
                    <tr key={i} className="border-b border-border/20 last:border-0">
                      <td className="px-3 py-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-mono ${
                            ep.method === "GET"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          }`}
                        >
                          {ep.method}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">{ep.path}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">{ep.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Code sample */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">
              Quick Start
            </h2>
            <div className="bg-[#0d1117] rounded-lg p-4 overflow-x-auto">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px] text-slate-400 font-mono">cURL</span>
              </div>
              <pre className="text-xs text-slate-300 font-mono leading-relaxed whitespace-pre">
{`curl -X GET "https://api.swarme.io/v1/agents/status" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
              </pre>
            </div>
          </section>

          {/* SDKs */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              SDKs & Libraries
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { lang: "Node.js", pkg: "@swarme/sdk" },
                { lang: "Python", pkg: "swarme-py" },
                { lang: "Go", pkg: "swarme-go" },
                { lang: "Ruby", pkg: "swarme-rb" },
              ].map((sdk) => (
                <div key={sdk.lang} className="border border-border/60 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Code2 className="h-3 w-3 text-primary" />
                    <span className="text-xs font-medium text-foreground">{sdk.lang}</span>
                  </div>
                  <code className="text-[10px] text-muted-foreground font-mono">{sdk.pkg}</code>
                </div>
              ))}
            </div>
          </section>

          {/* Resources */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              Resources
            </h2>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>
                  <a href="https://docs.swarme.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                    Full API Documentation
                  </a>{" "}
                  <span className="text-xs">— Interactive reference with request/response examples</span>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>
                  <a href="https://github.com/swarme" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                    GitHub Examples
                  </a>{" "}
                  <span className="text-xs">— Sample integrations and starter templates</span>
                </span>
              </li>
            </ul>
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
