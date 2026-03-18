/**
 * context-setup.tsx — Phase 59: Multi-step onboarding context collection
 *
 * 3-step flow:
 *   Step 1: CMS platform selection (Shopify, WooCommerce, BigCommerce, WordPress, Custom)
 *   Step 2: Competitor URLs (up to 5)
 *   Step 3: North star URL (the brand/site they aspire to be like)
 *
 * Route: /#/onboarding/context-setup
 * Layout: Standalone (no sidebar — dedicated onboarding flow)
 */

import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { saveOnboardingContext, type OnboardingContextPayload } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectId } from "@/hooks/use-project-id";
import {
  ShoppingBag,
  Store,
  ShoppingCart,
  Globe,
  Code2,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Loader2,
  Target,
  Users,
  Compass,
  Check,
} from "lucide-react";

// ── CMS Options ──────────────────────────────────────────
const CMS_OPTIONS = [
  { id: "shopify", label: "Shopify", icon: ShoppingBag, color: "text-green-400" },
  { id: "woocommerce", label: "WooCommerce", icon: ShoppingCart, color: "text-purple-400" },
  { id: "bigcommerce", label: "BigCommerce", icon: Store, color: "text-blue-400" },
  { id: "wordpress", label: "WordPress", icon: Globe, color: "text-cyan-400" },
  { id: "custom", label: "Custom / Other", icon: Code2, color: "text-gh-muted" },
];

// ── Step indicator ───────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isComplete = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                isActive
                  ? "bg-neon-emerald text-white"
                  : isComplete
                    ? "bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/40"
                    : "bg-gh-surface border border-gh-border text-gh-muted"
              }`}
            >
              {isComplete ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < total && (
              <div
                className={`h-px w-8 transition-colors ${
                  isComplete ? "bg-neon-emerald/40" : "bg-gh-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step components ──────────────────────────────────────

function StepCMS({
  selected,
  siteUrl,
  onSelect,
  onSiteUrlChange,
}: {
  selected: string;
  siteUrl: string;
  onSelect: (id: string) => void;
  onSiteUrlChange: (url: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-5 w-5 text-neon-emerald" />
          <h2 className="text-lg font-semibold text-white">Connect Your Platform</h2>
        </div>
        <p className="text-sm text-gh-muted">
          Select your CMS or e-commerce platform so we can tailor the swarm to your stack.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CMS_OPTIONS.map((cms) => {
          const isSelected = selected === cms.id;
          return (
            <button
              key={cms.id}
              onClick={() => onSelect(cms.id)}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                isSelected
                  ? "border-neon-emerald/60 bg-neon-emerald/5"
                  : "border-gh-border bg-gh-surface/40 hover:border-gh-muted/60 hover:bg-gh-surface/60"
              }`}
              data-testid={`button-cms-${cms.id}`}
            >
              <cms.icon className={`h-5 w-5 ${isSelected ? "text-neon-emerald" : cms.color}`} />
              <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-gh-text"}`}>
                {cms.label}
              </span>
              {isSelected && (
                <Check className="h-4 w-4 text-neon-emerald ml-auto" />
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gh-text">
          Primary Site URL
        </label>
        <Input
          placeholder="https://yourstore.com"
          value={siteUrl}
          onChange={(e) => onSiteUrlChange(e.target.value)}
          className="bg-gh-surface/60 border-gh-border text-gh-text font-mono text-sm placeholder:text-gh-muted/50"
          data-testid="input-site-url"
        />
      </div>
    </div>
  );
}

function StepCompetitors({
  urls,
  onAdd,
  onRemove,
  onChange,
}: {
  urls: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-5 w-5 text-neon-cyan" />
          <h2 className="text-lg font-semibold text-white">Map Your Competitors</h2>
        </div>
        <p className="text-sm text-gh-muted">
          Add up to 5 competitor URLs. The swarm will benchmark your site against
          these and track their changes over time.
        </p>
      </div>

      <div className="space-y-3">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs font-mono text-gh-muted w-5 text-right shrink-0">
              {i + 1}.
            </span>
            <Input
              placeholder="https://competitor.com"
              value={url}
              onChange={(e) => onChange(i, e.target.value)}
              className="bg-gh-surface/60 border-gh-border text-gh-text font-mono text-sm placeholder:text-gh-muted/50 flex-1"
              data-testid={`input-competitor-${i}`}
            />
            {urls.length > 1 && (
              <button
                onClick={() => onRemove(i)}
                className="p-1.5 rounded-md text-gh-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                data-testid={`button-remove-competitor-${i}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {urls.length < 5 && (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 text-sm text-neon-cyan hover:text-neon-cyan/80 transition-colors"
          data-testid="button-add-competitor"
        >
          <Plus className="h-4 w-4" />
          Add another competitor
        </button>
      )}
    </div>
  );
}

function StepNorthStar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Compass className="h-5 w-5 text-neon-purple" />
          <h2 className="text-lg font-semibold text-white">Set Your North Star</h2>
        </div>
        <p className="text-sm text-gh-muted">
          Which brand or website do you admire most? The swarm will study their
          strategy and use it as a reference point for your growth plan.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gh-text">
          North Star URL
        </label>
        <Input
          placeholder="https://brand-you-admire.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-gh-surface/60 border-gh-border text-gh-text font-mono text-sm placeholder:text-gh-muted/50"
          data-testid="input-north-star"
        />
        <p className="text-xs text-gh-muted">
          This can be a direct competitor or an aspirational brand from any industry.
        </p>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────
export default function ContextSetup() {
  const PROJECT_ID = useProjectId();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Form state
  const [cmsProvider, setCmsProvider] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>([""]);
  const [northStarUrl, setNorthStarUrl] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: OnboardingContextPayload = {
        projectId: PROJECT_ID,
        cmsProvider,
        siteUrl: siteUrl.trim(),
        competitorUrls: competitorUrls.filter((u) => u.trim()),
        northStarUrl: northStarUrl.trim(),
      };
      return saveOnboardingContext(payload);
    },
    onSuccess: () => {
      navigate("/onboarding/provisioning");
    },
  });

  const handleCompetitorAdd = useCallback(() => {
    if (competitorUrls.length < 5) {
      setCompetitorUrls((prev) => [...prev, ""]);
    }
  }, [competitorUrls.length]);

  const handleCompetitorRemove = useCallback((index: number) => {
    setCompetitorUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCompetitorChange = useCallback((index: number, value: string) => {
    setCompetitorUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }, []);

  const canAdvance = () => {
    if (step === 1) return cmsProvider !== "" && siteUrl.trim() !== "";
    if (step === 2) return true; // competitors are optional
    if (step === 3) return true; // north star is optional
    return false;
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      saveMutation.mutate();
    }
  };

  const slideVariants = {
    enter: { opacity: 0, x: 30 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  };

  return (
    <div className="min-h-screen" style={{ background: "#0d1117" }}>
      {/* Radial gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88,166,255,0.06), transparent)",
        }}
      />

      {/* Header */}
      <header className="relative border-b border-gh-border/60 bg-gh-surface/20 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SwarmeLogo className="h-6 w-6 text-white" />
            <span className="text-sm font-semibold text-white">Swarme</span>
            <span className="text-xs text-gh-muted font-mono ml-2">Setup</span>
          </div>
          <StepIndicator current={step} total={3} />
        </div>
      </header>

      {/* Content */}
      <div className="relative max-w-2xl mx-auto px-4 py-10">
        <div
          className="rounded-xl border border-gh-border p-6 sm:p-8"
          style={{ background: "rgba(13,17,23,0.9)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 1 && (
                <StepCMS
                  selected={cmsProvider}
                  siteUrl={siteUrl}
                  onSelect={setCmsProvider}
                  onSiteUrlChange={setSiteUrl}
                />
              )}
              {step === 2 && (
                <StepCompetitors
                  urls={competitorUrls}
                  onAdd={handleCompetitorAdd}
                  onRemove={handleCompetitorRemove}
                  onChange={handleCompetitorChange}
                />
              )}
              {step === 3 && (
                <StepNorthStar value={northStarUrl} onChange={setNorthStarUrl} />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gh-border/60">
            {step > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setStep(step - 1)}
                className="text-gh-muted hover:text-gh-text"
                data-testid="button-onboarding-back"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || saveMutation.isPending}
              className="bg-neon-emerald hover:bg-neon-emerald/90 text-white"
              data-testid="button-onboarding-next"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {step === 3 ? "Launch Provisioning" : "Continue"}
              {step < 3 && <ArrowRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate("/onboarding/provisioning")}
            className="text-xs text-gh-muted hover:text-gh-text transition-colors"
            data-testid="link-skip-context"
          >
            Skip for now — I'll configure this later
          </button>
        </div>
      </div>
    </div>
  );
}
