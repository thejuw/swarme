/**
 * DomainManagementCard — Phase 47: Integration Settings UI
 *
 * Full domain CRUD with platform-specific credential fields.
 * Supports all 13+ CMS platforms from the Domains table.
 *
 * Features:
 *   - List all connected domains with platform badges
 *   - Add new domain form with dynamic credential fields
 *   - Platform dropdown (13 platforms)
 *   - Edit/Delete existing domains
 *   - Credentials stored in KV linked to credentials_vault_id
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  getDomains,
  createDomain,
  deleteDomain,
  queryKeys,
} from "@/lib/api";
import type { Domain, PlatformType, CreateDomainPayload } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Platform definitions
// ─────────────────────────────────────────────────────────────

interface PlatformConfig {
  label: string;
  emoji: string;
  credentialFields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type: "text" | "password" | "url";
  }>;
}

const PLATFORM_CONFIGS: Record<PlatformType, PlatformConfig> = {
  wordpress: {
    label: "WordPress",
    emoji: "📝",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://example.com", type: "url" },
      { key: "username", label: "Username", placeholder: "wp_admin", type: "text" },
      { key: "app_password", label: "Application Password", placeholder: "xxxx xxxx xxxx xxxx", type: "password" },
    ],
  },
  shopify: {
    label: "Shopify",
    emoji: "🛍️",
    credentialFields: [
      { key: "store_domain", label: "Store Domain", placeholder: "your-store.myshopify.com", type: "text" },
      { key: "access_token", label: "Admin API Token", placeholder: "shpat_...", type: "password" },
      { key: "blog_id", label: "Blog ID", placeholder: "123456789", type: "text" },
    ],
  },
  woocommerce: {
    label: "WooCommerce",
    emoji: "🛒",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://shop.example.com", type: "url" },
      { key: "consumer_key", label: "Consumer Key", placeholder: "ck_...", type: "text" },
      { key: "consumer_secret", label: "Consumer Secret", placeholder: "cs_...", type: "password" },
    ],
  },
  ghost: {
    label: "Ghost",
    emoji: "👻",
    credentialFields: [
      { key: "api_url", label: "API URL", placeholder: "https://blog.example.com", type: "url" },
      { key: "admin_api_key", label: "Admin API Key", placeholder: "abc123:def456...", type: "password" },
    ],
  },
  magento: {
    label: "Magento",
    emoji: "🔶",
    credentialFields: [
      { key: "base_url", label: "Base URL", placeholder: "https://store.example.com", type: "url" },
      { key: "access_token", label: "Integration Token", placeholder: "Bearer token", type: "password" },
    ],
  },
  wix: {
    label: "Wix",
    emoji: "🌐",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://yoursite.wix.com", type: "url" },
    ],
  },
  squarespace: {
    label: "Squarespace",
    emoji: "◼️",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://yoursite.squarespace.com", type: "url" },
    ],
  },
  joomla: {
    label: "Joomla",
    emoji: "🔧",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://example.com", type: "url" },
      { key: "api_token", label: "API Token", placeholder: "Bearer token", type: "password" },
    ],
  },
  drupal: {
    label: "Drupal",
    emoji: "💧",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://example.com", type: "url" },
      { key: "username", label: "Username", placeholder: "admin", type: "text" },
      { key: "password", label: "Password", placeholder: "••••••••", type: "password" },
    ],
  },
  prestashop: {
    label: "PrestaShop",
    emoji: "🏪",
    credentialFields: [
      { key: "site_url", label: "Shop URL", placeholder: "https://shop.example.com", type: "url" },
      { key: "api_key", label: "Webservice Key", placeholder: "API key", type: "password" },
    ],
  },
  opencart: {
    label: "OpenCart",
    emoji: "🛍️",
    credentialFields: [
      { key: "site_url", label: "Store URL", placeholder: "https://store.example.com", type: "url" },
      { key: "api_key", label: "API Key", placeholder: "API key", type: "password" },
    ],
  },
  easywp: {
    label: "EasyWP",
    emoji: "📝",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://example.com", type: "url" },
      { key: "username", label: "Username", placeholder: "wp_admin", type: "text" },
      { key: "app_password", label: "Application Password", placeholder: "xxxx xxxx xxxx xxxx", type: "password" },
    ],
  },
  weebly: {
    label: "Weebly",
    emoji: "🌐",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://yoursite.weebly.com", type: "url" },
    ],
  },
  godaddy: {
    label: "GoDaddy",
    emoji: "🌐",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://yoursite.godaddysites.com", type: "url" },
    ],
  },
  custom: {
    label: "Custom / Other",
    emoji: "⚙️",
    credentialFields: [
      { key: "site_url", label: "Site URL", placeholder: "https://example.com", type: "url" },
      { key: "api_endpoint", label: "API Endpoint", placeholder: "https://api.example.com/publish", type: "url" },
      { key: "api_key", label: "API Key", placeholder: "Your API key", type: "password" },
    ],
  },
};

const WALLED_GARDENS: PlatformType[] = ["wix", "squarespace", "weebly", "godaddy"];

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function DomainManagementCard() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newPlatform, setNewPlatform] = useState<PlatformType>("shopify");
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.domains(),
    queryFn: () => getDomains(),
    staleTime: 60_000,
  });

  const domains = data?.domains ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: CreateDomainPayload) => createDomain(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domains() });
      toast({
        title: "Domain added",
        description: "Your new domain has been connected.",
      });
      resetForm();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add domain",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (domainId: string) => deleteDomain(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domains() });
      toast({ title: "Domain removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove domain",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setShowForm(false);
    setNewLabel("");
    setNewUrl("");
    setNewPlatform("shopify");
    setCredentials({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    createMutation.mutate({
      domain_url: newUrl.trim(),
      platform_type: newPlatform,
      label: newLabel.trim(),
      credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
    });
  }

  const platformConfig = PLATFORM_CONFIGS[newPlatform];
  const isWalledGarden = WALLED_GARDENS.includes(newPlatform);

  return (
    <Card data-testid="card-domain-management">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Connected Domains</CardTitle>
          </div>
          {!showForm && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(true)}
              data-testid="button-add-domain"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Domain
            </Button>
          )}
        </div>
        <CardDescription>
          Manage your connected domains and CMS integrations. Each domain is
          fully isolated — data never bleeds between domains.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Domain list */}
            {domains.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No domains connected yet. Add your first domain to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {domains.map((domain: Domain) => {
                  const config =
                    PLATFORM_CONFIGS[domain.platform_type as PlatformType] ??
                    PLATFORM_CONFIGS.custom;
                  return (
                    <div
                      key={domain.id}
                      className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 px-3 py-2.5"
                      data-testid={`domain-row-${domain.id}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm shrink-0">{config.emoji}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {domain.label || domain.domain_url}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {domain.domain_url}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">
                          {config.label}
                        </Badge>
                        {domain.credentials_vault_id && (
                          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => deleteMutation.mutate(domain.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-domain-${domain.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add domain form */}
            {showForm && (
              <>
                <Separator />
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">New Domain</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={resetForm}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="domain-label" className="text-xs">
                      Label
                    </Label>
                    <Input
                      id="domain-label"
                      placeholder="My Store"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      className="text-sm"
                      data-testid="input-domain-label"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="domain-url" className="text-xs">
                      Domain URL
                    </Label>
                    <Input
                      id="domain-url"
                      placeholder="https://example.com"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="text-sm"
                      required
                      data-testid="input-domain-url"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="domain-platform" className="text-xs">
                      Platform
                    </Label>
                    <Select
                      value={newPlatform}
                      onValueChange={(v) => {
                        setNewPlatform(v as PlatformType);
                        setCredentials({});
                      }}
                    >
                      <SelectTrigger
                        id="domain-platform"
                        data-testid="select-domain-platform"
                      >
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(PLATFORM_CONFIGS) as Array<
                            [PlatformType, PlatformConfig]
                          >
                        ).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            {cfg.emoji} {cfg.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Walled garden notice */}
                  {isWalledGarden && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                      {platformConfig.label} is a walled garden. Publishing will
                      use Cloudflare edge proxy injection instead of direct API.
                    </div>
                  )}

                  {/* Dynamic credential fields */}
                  {platformConfig.credentialFields.length > 0 && (
                    <div className="space-y-2 rounded-md border border-border/50 bg-muted/30 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        {platformConfig.label} Credentials
                      </div>
                      {platformConfig.credentialFields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label
                            htmlFor={`cred-${field.key}`}
                            className="text-xs"
                          >
                            {field.label}
                          </Label>
                          <Input
                            id={`cred-${field.key}`}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={credentials[field.key] ?? ""}
                            onChange={(e) =>
                              setCredentials((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className="text-sm"
                            data-testid={`input-cred-${field.key}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="sm"
                    disabled={createMutation.isPending || !newUrl.trim()}
                    data-testid="button-submit-domain"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1" />
                    )}
                    Add Domain
                  </Button>
                </form>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
