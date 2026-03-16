/**
 * connect-store.tsx — Phase 14: Integration Connection Wizard
 *
 * A 3-step guided wizard for non-technical users to securely
 * connect their e-commerce platform (Shopify, WooCommerce, BigCommerce).
 *
 * Step 1: Platform selection (card grid)
 * Step 2: Guided instructions (accordion with numbered steps)
 * Step 3: Credential input + instant verification
 *
 * Route: /#/connect-store
 * Layout: Standalone (no sidebar — dedicated onboarding flow)
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { verifyIntegration, queryKeys } from "@/lib/api";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingBag,
  Store,
  ShoppingCart,
  Lock,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────

type Platform = "shopify" | "woocommerce" | "bigcommerce";
type WizardStep = 1 | 2 | 3;

interface PlatformConfig {
  id: Platform;
  icon: typeof ShoppingBag;
  color: string;
  borderColor: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "shopify",
    icon: ShoppingBag,
    color: "text-green-500",
    borderColor: "border-green-500/40 hover:border-green-500",
  },
  {
    id: "woocommerce",
    icon: ShoppingCart,
    color: "text-purple-500",
    borderColor: "border-purple-500/40 hover:border-purple-500",
  },
  {
    id: "bigcommerce",
    icon: Store,
    color: "text-blue-500",
    borderColor: "border-blue-500/40 hover:border-blue-500",
  },
];

// Active project ID (using the Sartelle Atelier mock)
const PROJECT_ID = "proj_001";

// ─── Step indicator ──────────────────────────────────────

function StepIndicator({
  currentStep,
  t,
}: {
  currentStep: WizardStep;
  t: (key: string) => string;
}) {
  const steps = [
    { step: 1 as WizardStep, label: t("wizard.step1") },
    { step: 2 as WizardStep, label: t("wizard.step2") },
    { step: 3 as WizardStep, label: t("wizard.step3") },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8" data-testid="wizard-step-indicator">
      {steps.map(({ step, label }, idx) => (
        <div key={step} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                step === currentStep
                  ? "bg-emerald-500 text-white"
                  : step < currentStep
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step < currentStep ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                step
              )}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                step === currentStep
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-12 h-px mx-1 ${
                step < currentStep ? "bg-emerald-500/50" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Platform Selection ──────────────────────────

function PlatformSelection({
  onSelect,
  t,
}: {
  onSelect: (p: Platform) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t("wizard.selectPlatform")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("wizard.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          return (
            <Card
              key={p.id}
              className={`cursor-pointer transition-all border-2 ${p.borderColor} hover:shadow-lg`}
              onClick={() => onSelect(p.id)}
              data-testid={`card-platform-${p.id}`}
            >
              <CardContent className="flex flex-col items-center gap-3 p-6">
                <div
                  className={`p-3 rounded-xl bg-muted/50 ${p.color}`}
                >
                  <Icon className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">
                    {t(`wizard.${p.id}.name`)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(`wizard.${p.id}.desc`)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Guided Instructions ─────────────────────────

function GuidedInstructions({
  platform,
  onContinue,
  onBack,
  t,
}: {
  platform: Platform;
  onContinue: () => void;
  onBack: () => void;
  t: (key: string) => string;
}) {
  const steps = [1, 2, 3, 4, 5];
  const platformConfig = PLATFORMS.find((p) => p.id === platform);
  const Icon = platformConfig?.icon ?? Store;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-step1"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className={`p-2 rounded-lg bg-muted/50 ${platformConfig?.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {t(`wizard.${platform}.instructions.title`)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(`wizard.${platform}.name`)}
          </p>
        </div>
      </div>

      <Accordion type="single" defaultValue="instructions" collapsible>
        <AccordionItem value="instructions">
          <AccordionTrigger className="text-sm font-medium" data-testid="accordion-instructions">
            Step-by-step guide
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pl-1">
              {steps.map((stepNum) => (
                <div key={stepNum} className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center text-xs font-bold">
                    {stepNum}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed pt-0.5">
                    {t(`wizard.${platform}.instructions.step${stepNum}`)}
                  </p>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Security notice */}
      <Alert className="border-emerald-500/30 bg-emerald-500/5">
        <Shield className="h-4 w-4 text-emerald-500" />
        <AlertDescription className="text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
            <span>{t("wizard.securityNotice")}</span>
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          data-testid="button-continue-step3"
        >
          Continue to Credentials
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Password Input with Toggle ──────────────────────────

function SecureInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  t,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  t: (key: string) => string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-16 font-mono text-sm"
          data-testid={`input-${id}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setVisible(!visible)}
          data-testid={`button-toggle-${id}`}
        >
          {visible ? (
            <>
              <EyeOff className="h-3.5 w-3.5 mr-1" />
              {t("wizard.hideToken")}
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 mr-1" />
              {t("wizard.showToken")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Credential Input + Verification ─────────────

function CredentialInput({
  platform,
  onBack,
  onSuccess,
  t,
}: {
  platform: Platform;
  onBack: () => void;
  onSuccess: (storeName: string) => void;
  t: (key: string) => string;
}) {
  // Shopify fields
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyBlogId, setShopifyBlogId] = useState("");

  // WooCommerce fields
  const [wooDomain, setWooDomain] = useState("");
  const [wooConsumerKey, setWooConsumerKey] = useState("");
  const [wooConsumerSecret, setWooConsumerSecret] = useState("");

  // BigCommerce fields
  const [bcStoreHash, setBcStoreHash] = useState("");
  const [bcToken, setBcToken] = useState("");
  const [bcDomain, setBcDomain] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: () => {
      setErrorMessage(null);

      const payload: Parameters<typeof verifyIntegration>[1] = { platform };

      switch (platform) {
        case "shopify":
          payload.domain = shopifyDomain;
          payload.access_token = shopifyToken;
          if (shopifyBlogId) payload.blog_id = shopifyBlogId;
          break;
        case "woocommerce":
          payload.domain = wooDomain;
          payload.consumer_key = wooConsumerKey;
          payload.consumer_secret = wooConsumerSecret;
          break;
        case "bigcommerce":
          payload.store_hash = bcStoreHash;
          payload.access_token = bcToken;
          if (bcDomain) payload.domain = bcDomain;
          break;
      }

      return verifyIntegration(PROJECT_ID, payload);
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.integrationStatus(PROJECT_ID),
        });
        onSuccess(data.store_name);
      } else {
        setErrorMessage(data.error ?? "Verification failed.");
      }
    },
    onError: (err: Error) => {
      // Try to parse the error response body
      try {
        const parsed = JSON.parse(err.message);
        setErrorMessage(parsed.error ?? err.message);
      } catch {
        setErrorMessage(err.message);
      }
    },
  });

  const isDisabled = () => {
    switch (platform) {
      case "shopify":
        return !shopifyDomain.trim() || !shopifyToken.trim();
      case "woocommerce":
        return (
          !wooDomain.trim() ||
          !wooConsumerKey.trim() ||
          !wooConsumerSecret.trim()
        );
      case "bigcommerce":
        return !bcStoreHash.trim() || !bcToken.trim();
    }
  };

  const platformConfig = PLATFORMS.find((p) => p.id === platform);
  const Icon = platformConfig?.icon ?? Store;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          data-testid="button-back-step2"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className={`p-2 rounded-lg bg-muted/50 ${platformConfig?.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {t(`wizard.${platform}.name`)}
          </h2>
          <p className="text-xs text-muted-foreground">
            Enter your API credentials below
          </p>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="space-y-4 pt-6">
          {/* Shopify fields */}
          {platform === "shopify" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="shopify-domain" className="text-sm font-medium">
                  {t("wizard.shopify.domainLabel")}
                </Label>
                <Input
                  id="shopify-domain"
                  type="text"
                  placeholder={t("wizard.shopify.domainPlaceholder")}
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-shopify-domain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shopify-blog-id" className="text-sm font-medium">
                  {t("wizard.shopify.blogIdLabel")}
                </Label>
                <Input
                  id="shopify-blog-id"
                  type="text"
                  placeholder={t("wizard.shopify.blogIdPlaceholder")}
                  value={shopifyBlogId}
                  onChange={(e) => setShopifyBlogId(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-shopify-blog-id"
                />
              </div>
              <SecureInput
                id="shopify-token"
                label={t("wizard.shopify.tokenLabel")}
                placeholder={t("wizard.shopify.tokenPlaceholder")}
                value={shopifyToken}
                onChange={setShopifyToken}
                t={t}
              />
            </>
          )}

          {/* WooCommerce fields */}
          {platform === "woocommerce" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="woo-domain" className="text-sm font-medium">
                  {t("wizard.woocommerce.domainLabel")}
                </Label>
                <Input
                  id="woo-domain"
                  type="text"
                  placeholder={t("wizard.woocommerce.domainPlaceholder")}
                  value={wooDomain}
                  onChange={(e) => setWooDomain(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-woo-domain"
                />
              </div>
              <SecureInput
                id="woo-consumer-key"
                label={t("wizard.woocommerce.consumerKeyLabel")}
                placeholder={t("wizard.woocommerce.consumerKeyPlaceholder")}
                value={wooConsumerKey}
                onChange={setWooConsumerKey}
                t={t}
              />
              <SecureInput
                id="woo-consumer-secret"
                label={t("wizard.woocommerce.consumerSecretLabel")}
                placeholder={t("wizard.woocommerce.consumerSecretPlaceholder")}
                value={wooConsumerSecret}
                onChange={setWooConsumerSecret}
                t={t}
              />
            </>
          )}

          {/* BigCommerce fields */}
          {platform === "bigcommerce" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="bc-store-hash" className="text-sm font-medium">
                  {t("wizard.bigcommerce.storeHashLabel")}
                </Label>
                <Input
                  id="bc-store-hash"
                  type="text"
                  placeholder={t("wizard.bigcommerce.storeHashPlaceholder")}
                  value={bcStoreHash}
                  onChange={(e) => setBcStoreHash(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-bc-store-hash"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bc-domain" className="text-sm font-medium">
                  {t("wizard.bigcommerce.domainLabel")}
                </Label>
                <Input
                  id="bc-domain"
                  type="text"
                  placeholder={t("wizard.bigcommerce.domainPlaceholder")}
                  value={bcDomain}
                  onChange={(e) => setBcDomain(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="input-bc-domain"
                />
              </div>
              <SecureInput
                id="bc-token"
                label={t("wizard.bigcommerce.tokenLabel")}
                placeholder={t("wizard.bigcommerce.tokenPlaceholder")}
                value={bcToken}
                onChange={setBcToken}
                t={t}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Error message */}
      {errorMessage && (
        <Alert variant="destructive" data-testid="alert-connection-error">
          <XCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <p className="font-medium">{t("wizard.connectionFailed")}</p>
            <p className="mt-1">{errorMessage}</p>
            <p className="mt-2 text-xs opacity-75">{t("wizard.needHelp")}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Security reminder */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
        <span>
          Credentials are encrypted and stored securely in the vault. They are
          never logged or exposed.
        </span>
      </div>

      <Button
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
        disabled={isDisabled() || verifyMutation.isPending}
        onClick={() => verifyMutation.mutate()}
        data-testid="button-connect-store"
      >
        {verifyMutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("wizard.connecting")}
          </>
        ) : (
          <>
            <Shield className="mr-2 h-4 w-4" />
            {t("wizard.connect")}
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Success Screen ──────────────────────────────────────

function SuccessScreen({
  storeName,
  t,
}: {
  storeName: string;
  t: (key: string) => string;
}) {
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-8 max-w-md mx-auto">
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-emerald-500/15 flex items-center justify-center animate-in zoom-in duration-500">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
        </div>
        {/* Subtle pulse ring */}
        <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-emerald-500/20 animate-ping" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-emerald-500" data-testid="text-success-title">
          {t("wizard.successTitle")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {(t("wizard.successMessage") as string).replace("{{storeName}}", storeName)}
        </p>
      </div>

      <Badge
        variant="outline"
        className="border-emerald-500/30 text-emerald-500 px-4 py-1.5 text-sm"
      >
        <Lock className="mr-1.5 h-3.5 w-3.5" />
        Credentials securely stored
      </Badge>

      <Separator className="w-48" />

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setLocation("/")}
          data-testid="button-return-dashboard"
        >
          {t("wizard.returnToDashboard")}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setLocation("/settings")}
          data-testid="button-go-settings"
        >
          {t("wizard.goToSettings")}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Wizard Orchestrator ────────────────────────────

export default function ConnectStore() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<WizardStep>(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [connectedStoreName, setConnectedStoreName] = useState<string | null>(
    null
  );

  // If we've successfully connected, show success screen
  if (connectedStoreName) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <WizardHeader t={t} onBack={() => setLocation("/")} />
        <div className="flex-1 flex items-center justify-center px-4">
          <SuccessScreen storeName={connectedStoreName} t={t} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WizardHeader t={t} onBack={() => setLocation("/")} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold" data-testid="text-wizard-title">
              {t("wizard.title")}
            </h1>
          </div>

          <StepIndicator currentStep={step} t={t} />

          {step === 1 && (
            <PlatformSelection
              t={t}
              onSelect={(p) => {
                setPlatform(p);
                setStep(2);
              }}
            />
          )}

          {step === 2 && platform && (
            <GuidedInstructions
              platform={platform}
              t={t}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}

          {step === 3 && platform && (
            <CredentialInput
              platform={platform}
              t={t}
              onBack={() => setStep(2)}
              onSuccess={(name) => setConnectedStoreName(name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard Header ───────────────────────────────────────

function WizardHeader({
  t,
  onBack,
}: {
  t: (key: string) => string;
  onBack: () => void;
}) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 text-muted-foreground"
        data-testid="button-wizard-back"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">{t("wizard.back")}</span>
      </Button>
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">{t("wizard.title")}</span>
      </div>
    </header>
  );
}
