/**
 * AdminVault — Phase 21: Infrastructure Vault with Tabs.
 * Tabs: "AI Models", "Communications", "Billing"
 * Each tab shows masked key inputs with reveal toggle.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeOff, Save, Brain, MessageSquare, CreditCard, Shield, Headset, Scale, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { InfrastructureKeys } from "@/lib/api";

interface KeyFieldProps {
  category: string;
  keyName: string;
  label: string;
  value: string;
  onSave: (category: string, keyName: string, value: string) => void;
  saving: boolean;
}

function KeyField({ category, keyName, label, value, onSave, saving }: KeyFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [localVal, setLocalVal] = useState(value);
  const hasChanged = localVal !== value;

  /** Mask all but last 4 chars */
  function masked(v: string) {
    if (!v) return "";
    if (v.length <= 4) return "••••";
    return "•".repeat(v.length - 4) + v.slice(-4);
  }

  return (
    <div className="space-y-1.5" data-testid={`key-field-${keyName}`}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center border rounded-md focus-within:ring-1 focus-within:ring-ring bg-background">
          <Input
            type={revealed ? "text" : "password"}
            value={revealed ? localVal : (localVal ? masked(localVal) : "")}
            placeholder="Not configured"
            onChange={(e) => {
              setRevealed(true);
              setLocalVal(e.target.value);
            }}
            onFocus={() => setRevealed(true)}
            className="font-mono text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            data-testid={`input-${keyName}`}
          />
          <button
            type="button"
            className="px-2.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => setRevealed(!revealed)}
            data-testid={`toggle-${keyName}`}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasChanged || saving}
          onClick={() => onSave(category, keyName, localVal)}
          className="shrink-0 text-xs"
          data-testid={`save-${keyName}`}
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
}

const tabConfig = [
  {
    id: "ai_models",
    label: "AI Models",
    icon: Brain,
    description: "API keys for AI model providers.",
    fields: [
      { key: "GEMINI_API_KEY", label: "Gemini API Key" },
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
      { key: "PERPLEXITY_API_KEY", label: "Perplexity API Key" },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    icon: MessageSquare,
    description: "Email and SMS service credentials.",
    fields: [
      { key: "RESEND_API_KEY", label: "Resend API Key" },
      { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID" },
      { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token" },
      { key: "TWILIO_FROM_NUMBER", label: "Twilio From Number" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    description: "Payment processor credentials.",
    fields: [
      { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key" },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret" },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    description: "Bot protection and error tracking credentials.",
    fields: [
      { key: "TURNSTILE_SECRET_KEY", label: "Cloudflare Turnstile Secret Key" },
      { key: "SENTRY_DSN", label: "Sentry DSN" },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: Headset,
    description: "Customer support chat widget credentials.",
    fields: [
      { key: "SUPPORT_APP_ID", label: "Support Widget App ID (Crisp / Intercom)" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: Scale,
    description: "GDPR cookie consent and privacy management.",
    fields: [
      { key: "COOKIE_CONSENT_ID", label: "Cookie Consent Manager ID (Cookiebot / Termly)" },
    ],
  },
  {
    id: "affiliates",
    label: "Affiliates",
    icon: Users,
    description: "Affiliate and partner referral program credentials.",
    fields: [
      { key: "REWARDFUL_API_KEY", label: "Rewardful API Key" },
    ],
  },
];

export default function AdminVault() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/infrastructure/keys"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/infrastructure/keys");
      return res.json() as Promise<{ success: boolean; keys: InfrastructureKeys }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ category, key_name, value }: { category: string; key_name: string; value: string }) => {
      const res = await apiRequest("POST", "/api/admin/infrastructure/keys", { category, key_name, value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/infrastructure/keys"] });
      toast({ title: "Key saved", description: "Infrastructure key updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save key.", variant: "destructive" });
    },
  });

  const keys = data?.keys || { ai_models: {}, communications: {}, billing: {}, security: {}, support: {}, compliance: {}, affiliates: {} };

  const handleSave = (category: string, keyName: string, value: string) => {
    saveMutation.mutate({ category, key_name: keyName, value });
  };

  return (
    <div className="space-y-6" data-testid="admin-vault-page">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Infrastructure Vault</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Global API keys and service credentials. All values are encrypted at rest.
        </p>
      </div>

      <Tabs defaultValue="ai_models" className="w-full">
        <TabsList className="bg-muted/30">
          {tabConfig.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-xs gap-1.5"
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold">{tab.label}</CardTitle>
                <CardDescription className="text-xs">{tab.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  Array.from({ length: tab.fields.length }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))
                ) : (
                  tab.fields.map((field) => (
                    <KeyField
                      key={field.key}
                      category={tab.id}
                      keyName={field.key}
                      label={field.label}
                      value={(keys as any)[tab.id]?.[field.key] || ""}
                      onSave={handleSave}
                      saving={saveMutation.isPending}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
