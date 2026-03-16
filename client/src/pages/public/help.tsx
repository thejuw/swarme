/**
 * help.tsx — Public Help Center page
 *
 * FAQ accordion + support channels + getting started guide.
 */

import { useLocation } from "wouter";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, BookOpen, Headphones, MessageSquare } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "How does Swarme work?",
    a: "Swarme deploys 12 specialized AI agents on Cloudflare Workers. Each agent handles a distinct SEO function — crawling, auditing, content optimization, link monitoring, conversion rate optimization, and more. They coordinate through a Durable Object orchestrator and report results to your dashboard in real time.",
  },
  {
    q: "Do I need technical knowledge to use the platform?",
    a: "No. The dashboard is designed for marketing teams and business owners. Technical setup (CMS integration, DNS verification) is guided step-by-step. Developers can access our REST API and webhook system for deeper integrations.",
  },
  {
    q: "Will Swarme publish content without my approval?",
    a: "Never. All agents operate in a draft-first mode. Content suggestions, meta tag changes, and social posts are saved as drafts and require explicit human approval before going live. You maintain full editorial control.",
  },
  {
    q: "Which CMS platforms are supported?",
    a: "We support 15+ CMS platforms including WordPress, Shopify, Webflow, Ghost, Contentful, Strapi, Sanity, Prismic, Directus, Payload, BigCommerce, Wix, Squarespace, HubSpot CMS, and custom headless setups via our API.",
  },
  {
    q: "How is my data protected?",
    a: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). CMS credentials are stored with envelope encryption in Cloudflare KV. We're SOC 2 Type II audit-ready and fully GDPR/CCPA compliant. See our Security page for details.",
  },
  {
    q: "Can I use Swarme for multiple websites?",
    a: "Yes. Enterprise plans support unlimited domains with strict tenant isolation. Each domain has its own agent configuration, brand context, and CMS connection. Data is compartmentalized — agents for one domain cannot access another domain's data.",
  },
  {
    q: "What happens if I cancel my subscription?",
    a: "Your agents stop running immediately. All data (reports, drafts, audit history) remains accessible for 30 days. After that, data is permanently deleted. You can export everything at any time from the Settings page.",
  },
  {
    q: "Do you offer an API?",
    a: "Yes. Our REST API provides programmatic access to audits, content drafts, keyword tracking, and agent orchestration. API documentation is available on the Developers page. Rate limits vary by plan tier.",
  },
];

export default function HelpPage() {
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
            data-testid="button-help-back"
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
        <h1 className="text-2xl font-bold tracking-tight mb-2" data-testid="text-help-title">
          Help Center
        </h1>
        <p className="text-sm text-muted-foreground mb-10">
          Find answers and get support.
        </p>

        <div className="space-y-10">
          {/* Quick links */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: BookOpen,
                title: "Documentation",
                desc: "API references, integration guides, and tutorials.",
                action: () => navigate("/developers"),
                testId: "link-help-docs",
              },
              {
                icon: MessageSquare,
                title: "Discord Community",
                desc: "Get real-time help from the team and other users.",
                action: () => window.open("https://discord.gg/swarme", "_blank"),
                testId: "link-help-discord",
              },
              {
                icon: Headphones,
                title: "Contact Support",
                desc: "Reach our support team directly via email.",
                action: () => navigate("/contact"),
                testId: "link-help-contact",
              },
            ].map((card) => (
              <button
                key={card.title}
                onClick={card.action}
                className="border border-border/60 rounded-lg p-4 text-left hover:border-primary/40 hover:bg-primary/[0.02] transition-colors"
                data-testid={card.testId}
              >
                <card.icon className="h-5 w-5 text-primary mb-2" />
                <h3 className="text-sm font-medium text-foreground mb-1">{card.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </button>
            ))}
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-sm text-left font-medium" data-testid={`faq-trigger-${i}`}>
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
