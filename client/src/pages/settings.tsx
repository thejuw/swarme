/**
 * Settings page — Phase 7 + Phase 20 + Phase 44
 *
 * Three sections:
 *   1. Billing card: Current plan display + "Upgrade to Growth" button
 *   2. CMS Connection form: Platform dropdown + Shopify config fields
 *   3. Notification Preferences: Alert frequency RadioGroup, email/SMS toggles,
 *      receive_sms, receive_marketing toggles + phone number input
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Megaphone,
  Clock,
  Key,
  Copy,
  AlertTriangle,
  Terminal,
  RefreshCw,
} from "lucide-react";
import {
  generateApiKey,
  getEmailIntegration,
  connectEmailProvider,
  disconnectEmailProvider,
  getDomainVerifications,
  addDomainVerification,
  checkDomainVerification,
  type EmailIntegrationResponse,
  type DomainVerificationResponse,
  type DomainVerification,
  type DnsRecord,
} from "@/lib/api";

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
    "Priority Perplexity API routing",
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

// ── Notification Preferences Card (Phase 20 + Phase 44) ──

type AlertFrequency = "realtime" | "daily" | "weekly" | "muted";

interface NotificationPrefs {
  phone_number: string;
  notify_email: boolean;
  notify_sms: boolean;
  alert_frequency: AlertFrequency;
  receive_sms: boolean;
  receive_marketing: boolean;
}

const ALERT_FREQUENCY_OPTIONS: { value: AlertFrequency; label: string; desc: string }[] = [
  { value: "realtime", label: "Real-time", desc: "Get notified immediately when events occur" },
  { value: "daily", label: "Daily digest", desc: "One summary email each day at 5 PM UTC" },
  { value: "weekly", label: "Weekly digest", desc: "One summary email each Friday at 5 PM UTC" },
  { value: "muted", label: "Muted", desc: "No automated notifications — check the dashboard manually" },
];

function NotificationPreferencesCard() {
  const { toast } = useToast();

  const { data: prefsData, isLoading } = useQuery<{
    success: boolean;
    preferences: NotificationPrefs;
  }>({
    queryKey: ["/api/user/preferences"],
  });

  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>("realtime");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [receiveSms, setReceiveSms] = useState(true);
  const [receiveMarketing, setReceiveMarketing] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);

  // Hydrate local state from server data once
  useEffect(() => {
    if (prefsData?.preferences && !hasHydrated) {
      setAlertFrequency(prefsData.preferences.alert_frequency || "realtime");
      setNotifyEmail(prefsData.preferences.notify_email);
      setNotifySms(prefsData.preferences.notify_sms);
      setReceiveSms(prefsData.preferences.receive_sms ?? true);
      setReceiveMarketing(prefsData.preferences.receive_marketing ?? true);
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

      // Save core notification prefs via existing POST route
      const res = await apiRequest("POST", "/api/user/preferences", {
        phone_number: phoneNumber,
        notify_email: notifyEmail,
        notify_sms: notifySms,
      });
      const result = await res.json() as { success: boolean; preferences: NotificationPrefs };

      // Save Phase 44 fields via PATCH /api/user/settings
      await apiRequest("PATCH", "/api/user/settings", {
        alert_frequency: alertFrequency,
        receive_sms: receiveSms,
        receive_marketing: receiveMarketing,
      });

      return result;
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
  const prefs = prefsData?.preferences;
  const hasChanges = prefs
    ? alertFrequency !== (prefs.alert_frequency || "realtime") ||
      notifyEmail !== prefs.notify_email ||
      notifySms !== prefs.notify_sms ||
      receiveSms !== (prefs.receive_sms ?? true) ||
      receiveMarketing !== (prefs.receive_marketing ?? true) ||
      phoneNumber !== (prefs.phone_number || "")
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
            {/* Alert Frequency RadioGroup (Phase 44) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Alert Frequency</Label>
              </div>
              <RadioGroup
                value={alertFrequency}
                onValueChange={(val) => setAlertFrequency(val as AlertFrequency)}
                className="space-y-2"
                data-testid="radio-alert-frequency"
              >
                {ALERT_FREQUENCY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`freq-${opt.value}`}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      alertFrequency === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-muted/30 hover:border-border"
                    }`}
                  >
                    <RadioGroupItem
                      value={opt.value}
                      id={`freq-${opt.value}`}
                      className="mt-0.5"
                      data-testid={`radio-freq-${opt.value}`}
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Email Toggle */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label htmlFor="toggle-email" className="text-sm font-medium cursor-pointer">
                    Email Notifications
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Receive ROI reports and critical audit alerts via email.
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

            {/* SMS Text Alerts Toggle */}
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

            {/* Receive SMS Digest Toggle (Phase 44) */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label htmlFor="toggle-receive-sms" className="text-sm font-medium cursor-pointer">
                    SMS Digests
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Receive a brief summary of your daily/weekly digest via SMS.
                  </p>
                </div>
              </div>
              <Switch
                id="toggle-receive-sms"
                checked={receiveSms}
                onCheckedChange={setReceiveSms}
                data-testid="switch-receive-sms"
              />
            </div>

            {/* Marketing Emails Toggle (Phase 44) */}
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Megaphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <Label htmlFor="toggle-receive-marketing" className="text-sm font-medium cursor-pointer">
                    Marketing Emails
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Product updates, tips, and feature announcements from Swarme.
                  </p>
                </div>
              </div>
              <Switch
                id="toggle-receive-marketing"
                checked={receiveMarketing}
                onCheckedChange={setReceiveMarketing}
                data-testid="switch-receive-marketing"
              />
            </div>

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

// ── Email & Domain Authentication Card (Phase 58) ──

function EmailDomainCard({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");

  const { data: emailData, isLoading: emailLoading } = useQuery<EmailIntegrationResponse>({
    queryKey: ["/api/projects", projectId, "email-integration"],
    queryFn: () => getEmailIntegration(projectId),
  });

  const { data: domainData, isLoading: domainLoading } = useQuery<DomainVerificationResponse>({
    queryKey: ["/api/projects", projectId, "domain-verification"],
    queryFn: () => getDomainVerifications(projectId),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: "google" | "microsoft") =>
      connectEmailProvider(projectId, provider),
    onSuccess: (data) => {
      if (data.auth_url) {
        window.open(data.auth_url, "_blank");
        toast({
          title: "Authorization started",
          description: `Complete ${data.provider === "google" ? "Google" : "Microsoft"} login in the new window.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectEmailProvider(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "email-integration"] });
      toast({ title: "Disconnected", description: "Email integration has been removed." });
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: () => addDomainVerification(projectId, newDomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "domain-verification"] });
      toast({ title: "Domain added", description: "Configure the DNS records below, then verify." });
      setNewDomain("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add domain", description: err.message, variant: "destructive" });
    },
  });

  const checkMutation = useMutation({
    mutationFn: (verificationId: string) =>
      checkDomainVerification(projectId, verificationId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "domain-verification"] });
      toast({
        title: data.verification.status === "verified" ? "Domain verified" : "Verification pending",
        description: data.verification.status === "verified"
          ? "All DNS records are correctly configured."
          : "DNS records not yet propagated. Try again in a few minutes.",
      });
    },
  });

  const integration = emailData?.integration;
  const isLoading = emailLoading || domainLoading;

  const statusBadge = (status: string) => {
    switch (status) {
      case "connected":
      case "verified":
        return <Badge variant="default" className="bg-emerald-600 text-white text-[10px]">{status}</Badge>;
      case "pending":
        return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
      case "failed":
      case "expired":
      case "disconnected":
        return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <Card data-testid="card-email-domain">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Email & Domain Authentication</CardTitle>
        </div>
        <CardDescription>
          Connect your email provider for outbound communications and verify sending domains via DNS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Email Provider Section */}
            <div className="space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email Provider
              </Label>

              {integration && integration.status === "connected" ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">
                        {integration.provider === "google" ? "Google Workspace" : "Microsoft 365"}
                      </span>
                      {statusBadge(integration.status)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-destructive hover:text-destructive"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect-email"
                    >
                      Disconnect
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {integration.email} &middot; Connected {new Date(integration.connected_at).toLocaleDateString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Scopes: {integration.scopes.join(", ")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="flex flex-col items-center gap-2 rounded-md border border-border/50 bg-muted/30 hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 cursor-pointer"
                    onClick={() => connectMutation.mutate("google")}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect-google"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-xs font-medium">Google Workspace</span>
                  </button>
                  <button
                    className="flex flex-col items-center gap-2 rounded-md border border-border/50 bg-muted/30 hover:border-primary/50 hover:bg-primary/5 transition-colors p-4 cursor-pointer"
                    onClick={() => connectMutation.mutate("microsoft")}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect-microsoft"
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                    </svg>
                    <span className="text-xs font-medium">Microsoft 365</span>
                  </button>
                </div>
              )}
            </div>

            <Separator />

            {/* Domain Verification Section */}
            <div className="space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Sending Domain Verification
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Verify your domain's DNS records (DKIM, SPF, DMARC, MX) to ensure outbound emails are delivered reliably.
              </p>

              {/* Existing verifications */}
              {domainData?.verifications?.map((v: DomainVerification) => (
                <div
                  key={v.id}
                  className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-3"
                  data-testid={`domain-verification-${v.domain}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium font-mono">{v.domain}</span>
                      {statusBadge(v.status)}
                    </div>
                    {v.status !== "verified" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => checkMutation.mutate(v.id)}
                        disabled={checkMutation.isPending}
                        data-testid={`button-verify-${v.domain}`}
                      >
                        {checkMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3 w-3" />
                        )}
                        Verify
                      </Button>
                    )}
                  </div>

                  {/* DNS Records Table */}
                  <div className="rounded border border-border/30 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Name</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Value</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">TTL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.dns_records.map((r: DnsRecord, i: number) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="p-2 font-mono">{r.type}</td>
                            <td className="p-2 font-mono text-[10px] break-all">{r.name}</td>
                            <td className="p-2 font-mono text-[10px] break-all max-w-[200px] truncate" title={r.value}>
                              {r.value}
                            </td>
                            <td className="p-2 font-mono">{r.ttl}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {v.verified_at && (
                    <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Verified {new Date(v.verified_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}

              {/* Add new domain */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="yourdomain.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="text-sm font-mono max-w-xs"
                  data-testid="input-new-domain"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addDomainMutation.mutate()}
                  disabled={addDomainMutation.isPending || !newDomain.includes(".")}
                  data-testid="button-add-domain"
                >
                  {addDomainMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Globe className="mr-1.5 h-3 w-3" />
                  )}
                  Add Domain
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Developer API Card (Enterprise only) ──

function DeveloperApiCard({ workspace }: { workspace: Workspace }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isEnterprise = workspace.plan_tier === "enterprise";

  const generateMutation = useMutation({
    mutationFn: generateApiKey,
    onSuccess: (data) => {
      if (data.success && data.api_key) {
        setApiKey(data.api_key);
        toast({
          title: "API key generated",
          description: "Copy and store it securely — it won't be shown again.",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to generate key",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCopy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const curlSnippet = apiKey
    ? `curl -H "Authorization: Bearer ${apiKey}" \\
  https://api.swarme.io/v1/metrics`
    : `curl -H "Authorization: Bearer es_live_..." \\
  https://api.swarme.io/v1/metrics`;

  return (
    <Card data-testid="card-developer-api">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">API & Webhooks</CardTitle>
          </div>
          <Badge variant={isEnterprise ? "default" : "secondary"}>
            {isEnterprise ? "Enterprise" : "Upgrade Required"}
          </Badge>
        </div>
        <CardDescription>
          Programmatic access to your Swarme project via REST API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEnterprise ? (
          <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              API keys are available exclusively on the Enterprise plan.
              Upgrade your workspace to unlock programmatic access.
            </p>
          </div>
        ) : (
          <>
            {/* Warning banner */}
            <div className="flex items-start gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Generating a new key will invalidate any existing key.
                The raw key is shown exactly once — store it securely.
              </p>
            </div>

            {/* Generate / Key display */}
            {apiKey ? (
              <div className="space-y-3">
                <Label className="text-xs font-medium">Your API Key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={apiKey}
                    className="font-mono text-xs"
                    data-testid="input-api-key"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    data-testid="button-copy-api-key"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-api-key"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Key className="mr-2 h-3 w-3" />
                )}
                Generate API Key
              </Button>
            )}

            <Separator />

            {/* cURL snippet */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-3 w-3 text-muted-foreground" />
                <Label className="text-xs font-medium">Quick Start</Label>
              </div>
              <div className="bg-zinc-950 text-zinc-200 rounded-md p-3 text-xs font-mono overflow-x-auto" data-testid="code-curl-snippet">
                <pre className="whitespace-pre-wrap break-all">{curlSnippet}</pre>
              </div>
            </div>

            {/* Endpoints reference */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Available Endpoints</Label>
              <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground font-mono">
                <span>GET &nbsp;/v1/metrics</span>
                <span>GET &nbsp;/v1/tasks?page=1&limit=20</span>
                <span>POST /v1/analyze</span>
                <span>GET &nbsp;/v1/analyze/:job_id</span>
              </div>
            </div>

            {/* Rate limit info */}
            <p className="text-xs text-muted-foreground">
              Rate limit: 100 requests per minute. Keys use SHA-256 hashing
              and are never stored in plaintext.
            </p>
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
            Manage billing, notifications, CMS connections, and API access.
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
            <EmailDomainCard projectId={defaultProjectId} />
            <DeveloperApiCard workspace={workspaceData.workspace} />
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
