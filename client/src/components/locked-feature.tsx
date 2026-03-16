/**
 * locked-feature.tsx — Phase 32: Tier-Gated Feature Empty State
 *
 * Displayed when a user on Starter or Free tier accesses
 * Autopilot-only features (CRO Telemetry, Social Atomization).
 * Includes a visually striking lock state with upgrade CTA.
 */

import { Lock, Sparkles, ArrowRight, BarChart3, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

interface LockedFeatureProps {
  featureName: string;
  featureDescription: string;
  icon?: "cro" | "social";
}

export function LockedFeature({
  featureName,
  featureDescription,
  icon = "cro",
}: LockedFeatureProps) {
  const FeatureIcon = icon === "cro" ? BarChart3 : Share2;

  const handleUpgrade = async () => {
    try {
      const resp = await apiRequest("POST", "/api/billing/portal");
      const data = await resp.json();
      if (data.portal_url) {
        window.open(data.portal_url, "_blank");
      }
    } catch {
      // Fallback: scroll to pricing on landing page
      window.location.hash = "#/";
      setTimeout(() => {
        document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  return (
    <div className="flex items-center justify-center h-full min-h-[60vh] p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-md w-full text-center"
      >
        {/* Glowing background effect */}
        <div
          className="absolute inset-0 -m-8 rounded-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(137,87,229,0.08), transparent)",
          }}
        />

        <div className="relative z-10">
          {/* Lock icon cluster */}
          <div className="relative inline-flex items-center justify-center mb-6">
            <div className="absolute inset-0 w-20 h-20 rounded-full bg-neon-purple/10 animate-pulse" />
            <div className="relative flex items-center justify-center h-20 w-20 rounded-full border border-neon-purple/30 bg-gh-surface/80">
              <Lock className="h-8 w-8 text-neon-purple" />
            </div>
            <div className="absolute -top-1 -right-1 flex items-center justify-center h-7 w-7 rounded-full bg-gh-bg border border-gh-border">
              <FeatureIcon className="h-3.5 w-3.5 text-gh-muted" />
            </div>
          </div>

          {/* Title */}
          <h2
            className="text-xl font-bold text-white mb-2"
            data-testid="text-locked-feature-title"
          >
            {featureName}
          </h2>
          <p className="text-sm text-gh-muted leading-relaxed max-w-sm mx-auto mb-2">
            {featureDescription}
          </p>

          {/* Tier badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neon-purple/30 bg-neon-purple/10 text-xs font-mono text-neon-purple mb-6">
            <Sparkles className="h-3 w-3" />
            Requires Autopilot Plan
          </div>

          {/* Feature preview cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {icon === "cro" ? (
              <>
                <div className="rounded-lg border border-gh-border/50 bg-gh-surface/40 p-3 text-left opacity-50">
                  <p className="text-xs text-gh-muted mb-1">Conversion Rate</p>
                  <p className="text-lg font-bold text-white">—</p>
                </div>
                <div className="rounded-lg border border-gh-border/50 bg-gh-surface/40 p-3 text-left opacity-50">
                  <p className="text-xs text-gh-muted mb-1">Active A/B Tests</p>
                  <p className="text-lg font-bold text-white">—</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-gh-border/50 bg-gh-surface/40 p-3 text-left opacity-50">
                  <p className="text-xs text-gh-muted mb-1">Drafts Queued</p>
                  <p className="text-lg font-bold text-white">—</p>
                </div>
                <div className="rounded-lg border border-gh-border/50 bg-gh-surface/40 p-3 text-left opacity-50">
                  <p className="text-xs text-gh-muted mb-1">Published</p>
                  <p className="text-lg font-bold text-white">—</p>
                </div>
              </>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-neon-emerald text-white font-semibold text-sm hover:bg-neon-emerald/90 transition-colors animate-glow-pulse"
            data-testid="button-upgrade-autopilot"
          >
            Upgrade to Autopilot
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-3 text-xs text-gh-muted">
            $499/mo · CRO Heatmaps · Social Atomization · AI A/B Testing
          </p>
        </div>
      </motion.div>
    </div>
  );
}
