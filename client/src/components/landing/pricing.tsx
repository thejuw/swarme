/**
 * pricing.tsx — Phase 32: High-Converting Pricing Table
 *
 * 3-column Shadcn Card layout: Starter / Autopilot / Enterprise
 * Autopilot highlighted with glowing border + "Most Popular" badge.
 * Features visibly grayed out on lower tiers.
 */

import { motion } from "framer-motion";
import { Check, X, Sparkles, ArrowRight } from "lucide-react";

interface PricingFeature {
  label: string;
  starter: boolean;
  autopilot: boolean;
  enterprise: boolean;
}

const FEATURES: PricingFeature[] = [
  { label: "Technical SEO Audits", starter: true, autopilot: true, enterprise: true },
  { label: "Content Generation (AI Writer)", starter: true, autopilot: true, enterprise: true },
  { label: "SERP & Visibility Tracking", starter: true, autopilot: true, enterprise: true },
  { label: "Content Decay Detection", starter: true, autopilot: true, enterprise: true },
  { label: "Self-Healing ADA Compliance", starter: true, autopilot: true, enterprise: true },
  { label: "CRO Heatmap Telemetry", starter: false, autopilot: true, enterprise: true },
  { label: "Social Content Atomization", starter: false, autopilot: true, enterprise: true },
  { label: "Algorithmic A/B Testing", starter: false, autopilot: true, enterprise: true },
  { label: "AI Manager Chat Interface", starter: false, autopilot: true, enterprise: true },
  { label: "Custom Agent Workflows", starter: false, autopilot: false, enterprise: true },
  { label: "Dedicated Account Manager", starter: false, autopilot: false, enterprise: true },
  { label: "White-Label Reports", starter: false, autopilot: false, enterprise: true },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$199",
    period: "/mo",
    description: "Core SEO automation for growing brands.",
    taskLimit: "100 tasks/mo",
    highlight: false,
    stripePriceId: "price_starter_monthly",
    ctaLabel: "Get Started",
  },
  {
    id: "autopilot",
    name: "Autopilot",
    price: "$499",
    period: "/mo",
    description: "Full swarm intelligence with CRO & social.",
    taskLimit: "500 tasks/mo",
    highlight: true,
    stripePriceId: "price_autopilot_monthly",
    ctaLabel: "Start Free Trial",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$999",
    period: "/mo",
    description: "Unlimited scale with custom agents & SLA.",
    taskLimit: "Unlimited",
    highlight: false,
    stripePriceId: "price_enterprise_monthly",
    ctaLabel: "Contact Sales",
  },
];

function FeatureRow({ feature, tierKey }: { feature: PricingFeature; tierKey: "starter" | "autopilot" | "enterprise" }) {
  const included = feature[tierKey];
  return (
    <li className="flex items-center gap-2.5 text-sm py-1.5">
      {included ? (
        <Check className="h-4 w-4 text-neon-emerald shrink-0" />
      ) : (
        <X className="h-4 w-4 text-gh-muted/40 shrink-0" />
      )}
      <span className={included ? "text-gh-text" : "text-gh-muted/40 line-through decoration-gh-muted/20"}>
        {feature.label}
      </span>
    </li>
  );
}

export function Pricing() {
  return (
    <section className="py-20" data-testid="pricing-section" id="pricing">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-3 py-1 rounded-full border border-gh-border bg-gh-surface/40 text-xs font-mono text-neon-emerald mb-4">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Simple, transparent pricing.
          </h2>
          <p className="mt-3 text-gh-muted max-w-xl mx-auto">
            Every plan includes a 14-day free trial. No credit card required to start.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative rounded-xl border overflow-hidden ${
                plan.highlight
                  ? "border-neon-emerald/50 shadow-[0_0_40px_rgba(46,160,67,0.12)]"
                  : "border-gh-border"
              }`}
              style={{ background: plan.highlight ? "#0f1a14" : "#0d1117" }}
              data-testid={`card-pricing-${plan.id}`}
            >
              {/* Most Popular badge */}
              {plan.highlight && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-neon-emerald/20 via-neon-emerald/10 to-neon-emerald/20 border-b border-neon-emerald/30 px-4 py-2 flex items-center justify-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-neon-emerald" />
                  <span className="text-xs font-semibold text-neon-emerald tracking-wide uppercase">
                    Most Popular
                  </span>
                </div>
              )}

              <div className={`p-6 ${plan.highlight ? "pt-14" : ""}`}>
                {/* Plan name */}
                <h3 className="text-lg font-semibold text-white" data-testid={`text-plan-name-${plan.id}`}>
                  {plan.name}
                </h3>
                <p className="text-sm text-gh-muted mt-1">{plan.description}</p>

                {/* Price */}
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white tracking-tight" data-testid={`text-plan-price-${plan.id}`}>
                    {plan.price}
                  </span>
                  <span className="text-gh-muted text-sm">{plan.period}</span>
                </div>
                <p className="text-xs text-gh-muted mt-1">{plan.taskLimit}</p>

                {/* CTA */}
                <a
                  href={`https://checkout.stripe.com/c/pay/${plan.stripePriceId}`}
                  className={`mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-neon-emerald text-white hover:bg-neon-emerald/90 animate-glow-pulse"
                      : "bg-gh-surface border border-gh-border text-white hover:bg-gh-border/50"
                  }`}
                  data-testid={`button-checkout-${plan.id}`}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </a>

                {/* Feature list */}
                <ul className="mt-7 space-y-0.5">
                  {FEATURES.map((f) => (
                    <FeatureRow
                      key={f.label}
                      feature={f}
                      tierKey={plan.id as "starter" | "autopilot" | "enterprise"}
                    />
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
