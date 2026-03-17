/**
 * AdminEcosystem — Phase 21: Integration health grid.
 * Shows connected services and their status.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Globe,
  CreditCard,
  MessageSquare,
  BarChart3,
  ShoppingBag,
  Webhook,
  Shield,
  Bug,
  Fingerprint,
  Headset,
  Cookie,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Integration {
  name: string;
  description: string;
  icon: LucideIcon;
  status: "connected" | "disconnected" | "degraded";
  version?: string;
}

const integrations: Integration[] = [
  { name: "Perplexity", description: "Sonar Pro content drafting", icon: Brain, status: "connected", version: "v2" },
  { name: "Perplexity", description: "AI visibility monitoring", icon: Globe, status: "connected", version: "v1" },
  { name: "Anthropic", description: "Claude editorial review", icon: Brain, status: "disconnected" },
  { name: "Stripe", description: "Billing & subscription management", icon: CreditCard, status: "disconnected" },
  { name: "Resend", description: "Transactional email delivery", icon: MessageSquare, status: "connected", version: "v2" },
  { name: "Twilio", description: "SMS notification dispatch", icon: MessageSquare, status: "disconnected" },
  { name: "Shopify", description: "E-commerce CMS publishing", icon: ShoppingBag, status: "connected", version: "2024-01" },
  { name: "PostHog", description: "Product analytics & events", icon: BarChart3, status: "degraded", version: "v1" },
  { name: "Cloudflare Workers", description: "Edge compute runtime", icon: Shield, status: "connected", version: "compat-2024-03-04" },
  { name: "Webhooks", description: "Custom event routing", icon: Webhook, status: "connected" },
  { name: "Sentry", description: "Error tracking & performance monitoring", icon: Bug, status: "disconnected" },
  { name: "Cloudflare Turnstile", description: "Invisible bot protection for forms", icon: Fingerprint, status: "disconnected" },
  { name: "Crisp Chat", description: "Customer support chat widget", icon: Headset, status: "disconnected" },
  { name: "Cookiebot", description: "GDPR cookie consent manager", icon: Cookie, status: "disconnected" },
  { name: "Rewardful", description: "Affiliate & partner referral tracking", icon: Users, status: "disconnected" },
];

function statusColor(s: Integration["status"]) {
  switch (s) {
    case "connected": return "bg-emerald-500";
    case "degraded": return "bg-amber-500";
    case "disconnected": return "bg-zinc-500";
  }
}

function statusBadge(s: Integration["status"]) {
  switch (s) {
    case "connected":
      return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Connected</Badge>;
    case "degraded":
      return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Degraded</Badge>;
    case "disconnected":
      return <Badge variant="outline" className="text-zinc-500 border-zinc-500/30 text-[10px]">Disconnected</Badge>;
  }
}

export default function AdminEcosystem() {
  const connected = integrations.filter((i) => i.status === "connected").length;
  const total = integrations.length;

  return (
    <div className="space-y-6" data-testid="admin-ecosystem-page">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">App Ecosystem</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {connected} of {total} integrations active. Configure API keys in the Infrastructure Vault.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integ) => (
          <Card key={integ.name} className="border-border/50 hover:border-border/80 transition-colors" data-testid={`integration-${integ.name.toLowerCase().replace(/\s/g, "-")}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-md bg-muted/50">
                    <integ.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">{integ.name}</CardTitle>
                  </div>
                </div>
                <div className={`h-2 w-2 rounded-full ${statusColor(integ.status)}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{integ.description}</p>
              <div className="flex items-center justify-between">
                {statusBadge(integ.status)}
                {integ.version && (
                  <span className="text-[10px] font-mono text-muted-foreground">{integ.version}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
