/**
 * Settings page — Phase 7 + Phase 20
 *
 * Three sections:
 *   1. Billing card: Current plan display + "Upgrade to Growth" button
 *   2. CMS Connection form: Platform dropdown + Shopify config fields
 *   3. Notification Preferences: Email/SMS toggles + phone number input
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Zap,
  Check,
  ExternalLink,
  Store,
  ShieldCheck,
  Loader2,
  Globe,
  Bell,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";

// ── Types ──

interface Workspace {
  id: string;
  name: string;
  owner_email: string;
  plan_tier: string;
  plan_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CMSSettings {
  cms_platform: string;
  shopify_domain?: string;
  shopify_blog_id?: string;
  shopify_access_token_set?: boolean;
}

// ── Billing Card ──

function BillingCard({ workspace }: { workspace: Workspace }) {
  const { toast } = useToast();
  const isGrowth = workspace.plan_tier === "growth";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/checkout", {
        workspace_id: workspace.id,
      });
      return res.json() as Promise<{ success: boolean; checkout_url: string; session_id: string }>;
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
        toast({
          title: "Checkout opened",
          description: "Complete your subscription in the new tab.",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Checkout failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal");
      return res.json() as Promise<{ success: boolean; portal_url: string }>;
    },
    onSuccess: (data) => {
      if (data.portal_url) {
        window.open(data.portal_url, "_blank");
      }
    },
  });

  const growthFeatures = [
    "Unlimited AI visibility checks",
    "Shopify, WordPress & Webflow CMS push",
    "Autopilot mode (autonomous publishing)",
    "Priority Perplexity & OpenAI API routing",
    "Dedicated Durable Object per project",
    "Slack & email notifications",
  ];

  return (
    <Card data-testid="card-billing">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Billing & Plan</CardTitle>
          </div>
          <Badge
            variant={isGrowth ? "default" : "secondary"}
            className={isGrowth ? "bg-emerald-600 text-white" : ""}
            data-testid="badge-plan-tier"
          >
            {isGrowth ? "Growth" : "Free"}
          </Badge>
        </div>
        <CardDescription>
          {workspace.name} &middot; {workspace.owner_email}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isGrowth ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-medium">Growth plan active</span>
            </div>
            <p className="text-xs text-muted-foreground">
              $499/mo &middot; Billed monthly &middot; Status: {workspace.plan_status}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              data-testid="button-manage-billing"
            >
              {portalMutation.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-3 w-3" />
              )}
              Manage subscription
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Upgrade to Growth</span>
                <span className="ml-auto text-lg font-bold">
                  $499<span className="text-xs font-normal text-muted-foreground">/mo</span>
                </span>
              </div>
              <ul className="space-y-1.5 mb-4">
                {growthFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                size="sm"
                onClick={() => checkoutMutation.mutate()}
                disabled={checkoutMutation.isPending}
                data-testid="button-upgrade-pro"
              >
                {checkoutMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Upgrade to Growth
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Powered by Stripe. Cancel anytime.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── CMS Connection Form ──

function CMSConnectionCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();

  const { data: cmsData, isLoading } = useQuery<{
    success: boolean;
    project_id: string;
    cms_settings: CMSSettings;
  }>({
    queryKey: ["/api/projects", projectId, "cms-settings"],
  });

  const [platform, setPlatform] = useState<string>("");
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");

  // Sync form state when data loads
  const settings = cmsData?.cms_settings;
  const hasInitialized = useState(false);
  if (settings && !hasInitialized[0]) {
    if (settings.cms_platform && settings.cms_platform !== "generic") {
      setPlatform(settings.cms_platform);
    }
    if (settings.shopify_domain) setShopifyDomain(settings.shopify_domain);
    if (settings.shopify_blog_id) setShopifyBlogId(settings.shopify_blog_id);
    hasInitialized[1](true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {
        cms_platform: platform || "generic",
      };
      if (platform === "shopify") {
        payload.shopify_domain = shopifyDomain;
        payload.shopify_blog_id = shopifyBlogId;
        if (shopifyToken) payload.shopify_access_token = shopifyToken;
      }
      const res = await apiRequest("PUT", `/api/projects/${projectId}/cms-settings`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cms-settings"] });
      toast({ title: "CMS settings saved", description: "Your publishing connection has been updated." });
      setShopifyToken(""); // clear token from form after save
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const isShopify = platform === "shopify";

  return (
    <Card data-testid="card-cms-connection">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">CMS Connection</CardTitle>
        </div>
        <CardDescription>
          Connect a publishing destination for autopilot content delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="cms-platform" className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="cms-platform" data-testid="select-cms-platform">
                  <SelectValue placeholder="Select CMS platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="webflow">Webflow</SelectItem>
                  <SelectItem value="generic">Generic Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isShopify && (
              <div className="space-y-3 rounded-md border border-border/50 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  Shopify Configuration
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="shopify-domain" className="text-xs">
                    Store domain
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="shopify-domain"
                      placeholder="your-store"
                      value={shopifyDomain}
                      onChange={(e) => setShopifyDomain(e.target.value)}
                      className="text-sm"
                      data-testid="input-shopify-domain"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">.myshopify.com</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="shopify-blog-id" className="text-xs">
                    Blog ID
                  </Label>
                  <Input
                    id="shopify-blog-id"
                    placeholder="e.g. 123456789"
                    value={shopifyBlogId}
                    onChange={(e) => setShopifyBlogId(e.target.value)}
                    className="text-sm"
                    data-testid="input-shopify-blog-id"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Find this in Shopify Admin &rarr; Online Store &rarr; Blog posts &rarr; URL bar
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="shopify-token" className="text-xs">
                    Admin API access token
                  </Label>
                  <Input
                    id="shopify-token"
                    type="password"
                    placeholder={settings?.shopify_access_token_set ? "••••••••••••" : "shpat_..."}
                    value={shopifyToken}
                    onChange={(e) => setShopifyToken(e.target.value)}
                    className="text-sm font-mono"
                    data-testid="input-shopify-token"
                  />
                  {settings?.shopify_access_token_set && (
                    <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Token saved in KV vault. Leave blank to keep current token.
                    </p>
                  )}
                </div>
              </div>
            )}

            {platform === "wordpress" && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  WordPress integration uses a generic webhook. Set your WP REST API
                  endpoint URL and authentication key in the project webhook vault
                  (KV keys: <code className="text-[10px]">vault:project:*:cms_webhook_url</code>).
                </p>
              </div>
            )}

            {platform === "webflow" && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Webflow integration uses the CMS API. Configure your Webflow
                  site token and collection ID in the project webhook vault.
                </p>
              </div>
            )}

            <Separator />

            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !platform}
              data-testid="button-save-cms"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-2 h-3 w-3" />
              )}
              Save CMS settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Phone Number Validator ──

/** Validates E.164 phone format: +1234567890 (10–15 digits after +) */
function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ""));
}

// ── Notification Preferences Card (Phase 20) ──

interface NotificationPrefs {
  phone_number: string;
  notify_email: boolean;
  notify_sms: boolean;
}

function NotificationPreferencesCard() {
  const { toast } = useToast();

  const { data: prefsData, isLoading } = useQuery<{
    success: boolean;
    preferences: NotificationPrefs;
  }>({
    queryKey: ["/api/user/preferences"],
  });

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);

  // Hydrate local state from server data once
  useEffect(() => {
    if (prefsData?.preferences && !hasHydrated) {
      setNotifyEmail(prefsData.preferences.notify_email);
      setNotifySms(prefsData.preferences.notify_sms);
      setPhoneNumber(prefsData.preferences.phone_number || "");
      setHasHydrated(true);
    }
  }, [prefsData, hasHydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate phone if SMS is enabled
      if (notifySms && phoneNumber && !isValidPhone(phoneNumber)) {
        throw new Error("Invalid phone number. Use E.164 format: +1234567890");
      }

      const res = await apiRequest("POST", "/api/user/preferences", {
        phone_number: phoneNumber,
        notify_email: notifyEmail,
        notify_sms: notifySms,
      });
      return res.json() as Promise<{ success: boolean; preferences: NotificationPrefs }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      toast({
        title: "Preferences saved",
        description: "Your notification settings have been updated.",
      });
      // Sync state with response
      if (data.preferences) {
        setNotifyEmail(data.preferences.notify_email);
        setNotifySms(data.preferences.notify_sms);
        setPhoneNumber(data.preferences.phone_number || "");
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Validate phone on change
  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);
    if (value && !isValidPhone(value)) {
      setPhoneError("Use E.164 format: +1 followed by 10 digits");
    } else {
      setPhoneError("");
    }
  };

  // Determine if Save should be enabled
  const hasChanges = prefsData?.preferences
    ? notifyEmail !== prefsData.preferences.notify_email ||
      notifySms !== prefsData.preferences.notify_sms ||
      phoneNumber !== (prefsData.preferences.phone_number || "")
    : false;

  const canSave = hasChanges && !saveMutation.isPending && (!notifySms || !phoneNumber || isValidPhone(phoneNumber));

  return (
    <Card data-testid="card-notification-preferences">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Notification Preferences</CardTitle>
        </div>
        <CardDescription>
          Control how the swarm notifies you about published content, audit alerts, and system updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Email Toggle */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label htmlFor="toggle-email" className="text-sm font-medium cursor-pointer">
                    Email Notifications
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Receive weekly ROI reports and critical audit alerts.
                  </p>
                </div>
              </div>
              <Switch
                id="toggle-email"
                checked={notifyEmail}
                onCheckedChange={setNotifyEmail}
                data-testid="switch-notify-email"
              />
            </div>

            {/* SMS Toggle */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label htmlFor="toggle-sms" className="text-sm font-medium cursor-pointer">
                    SMS Text Alerts
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Get instant pings when the Swarm publishes new content or finds critical errors.
                  </p>
                </div>
              </div>
              <Switch
                id="toggle-sms"
                checked={notifySms}
                onCheckedChange={setNotifySms}
                data-testid="switch-notify-sms"
              />
            </div>

            {/* Phone Number Input (conditional on SMS toggle) */}
            {notifySms && (
              <div className="space-y-2 pl-7">
                <Label htmlFor="phone-number" className="text-xs flex items-center gap-1.5">
                  <Phone className="h-3 w-3" />
                  Phone Number
                </Label>
                <Input
                  id="phone-number"
                  type="tel"
                  placeholder="+1 555 123 4567"
                  value={phoneNumber}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`text-sm font-mono max-w-xs ${phoneError ? "border-destructive" : ""}`}
                  data-testid="input-phone-number"
                />
                {phoneError ? (
                  <p className="text-[10px] text-destructive">{phoneError}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    E.164 format with country code (e.g., +15551234567)
                  </p>
                )}
              </div>
            )}

            <Separator />

            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
              data-testid="button-save-notifications"
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-2 h-3 w-3" />
              )}
              Save preferences
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Settings Page ──

export default function Settings() {
  const { data: workspaceData, isLoading: wsLoading } = useQuery<{
    success: boolean;
    workspace: Workspace;
  }>({
    queryKey: ["/api/workspace"],
  });

  const defaultProjectId = "proj_001";

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage billing, notifications, and CMS publishing connections.
          </p>
        </div>

        {wsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workspaceData?.workspace ? (
          <>
            <BillingCard workspace={workspaceData.workspace} />
            <NotificationPreferencesCard />
            <CMSConnectionCard projectId={defaultProjectId} />
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Unable to load workspace data.
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
