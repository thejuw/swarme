/**
 * free-analyzer.tsx — Phase 13: Public Free Site Analyzer
 *
 * A standalone, public-facing PLG lead-magnet page.
 * Users enter any URL and get a free SEO + accessibility
 * + performance + security audit — no sign-up required.
 *
 * Route: /#/free-analyzer
 * Layout: Standalone (no sidebar — dedicated public tool)
 */

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  runPublicAnalysis,
  type AnalyzerResult,
  type AnalyzerFinding,
} from "@/lib/api";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

/** Site key — set via VITE_TURNSTILE_SITE_KEY env or use Cloudflare's always-pass test key */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Search,
  Loader2,
  Globe,
  Shield,
  Eye,
  Gauge,
  Lock,
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight,
  Zap,
  RotateCcw,
  ExternalLink,
} from "lucide-react";

// ── Severity config ──────────────────────────────────────

const severityConfig = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertCircle,
    label: "Critical",
  },
  high: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: AlertTriangle,
    label: "High",
  },
  medium: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: Info,
    label: "Medium",
  },
  low: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Info,
    label: "Low",
  },
};

// ── Category config ──────────────────────────────────────

const categoryConfig = {
  seo: {
    icon: Search,
    color: "text-emerald-500",
    ringColor: "stroke-emerald-500",
    bgGlow: "bg-emerald-500/10",
  },
  accessibility: {
    icon: Eye,
    color: "text-violet-500",
    ringColor: "stroke-violet-500",
    bgGlow: "bg-violet-500/10",
  },
  performance: {
    icon: Gauge,
    color: "text-amber-500",
    ringColor: "stroke-amber-500",
    bgGlow: "bg-amber-500/10",
  },
  security: {
    icon: Lock,
    color: "text-sky-500",
    ringColor: "stroke-sky-500",
    bgGlow: "bg-sky-500/10",
  },
  content: {
    icon: FileText,
    color: "text-pink-500",
    ringColor: "stroke-pink-500",
    bgGlow: "bg-pink-500/10",
  },
};

// ── Score Ring SVG component ─────────────────────────────

function ScoreRing({
  score,
  size = 100,
  strokeWidth = 8,
  className = "",
  ringColorClass = "stroke-emerald-500",
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  ringColorClass?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const scoreColor =
    score >= 80
      ? "text-emerald-500"
      : score >= 60
        ? "text-yellow-500"
        : score >= 40
          ? "text-orange-500"
          : "text-red-500";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${ringColorClass} transition-all duration-1000 ease-out`}
        />
      </svg>
      <span
        className={`absolute text-lg font-bold ${scoreColor}`}
        data-testid="text-score-value"
      >
        {score}
      </span>
    </div>
  );
}

// ── Category Score Card ──────────────────────────────────

function CategoryScoreCard({
  label,
  score,
  icon: Icon,
  ringColor,
  bgGlow,
  findingsCount,
}: {
  label: string;
  score: number;
  icon: typeof Search;
  ringColor: string;
  bgGlow: string;
  findingsCount: number;
}) {
  return (
    <Card
      className="bg-card/50 border-border/50 hover:border-border transition-colors"
      data-testid={`card-category-${label.toLowerCase()}`}
    >
      <CardContent className="pt-5 pb-4 flex flex-col items-center gap-3">
        <div className={`p-2 rounded-lg ${bgGlow}`}>
          <Icon className={`h-5 w-5 ${ringColor.replace("stroke-", "text-")}`} />
        </div>
        <ScoreRing score={score} size={80} strokeWidth={6} ringColorClass={ringColor} />
        <div className="text-center">
          <p className="text-sm font-medium">{label}</p>
          {findingsCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {findingsCount} issue{findingsCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Finding Item ─────────────────────────────────────────

function FindingItem({ finding }: { finding: AnalyzerFinding }) {
  const config = severityConfig[finding.severity];
  const SeverityIcon = config.icon;

  return (
    <div
      className={`flex gap-3 p-3 rounded-lg ${config.bg} border ${config.border}`}
      data-testid={`finding-${finding.category}-${finding.severity}`}
    >
      <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{finding.title}</span>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${config.border} ${config.color}`}
          >
            {config.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {finding.detail}
        </p>
      </div>
    </div>
  );
}

// ── Hero / URL Input Section ─────────────────────────────

function HeroSection({
  onAnalyze,
  isPending,
  turnstileToken,
  setTurnstileToken,
  turnstileRef,
}: {
  onAnalyze: (url: string) => void;
  isPending: boolean;
  turnstileToken: string | undefined;
  setTurnstileToken: (t: string | undefined) => void;
  turnstileRef: React.RefObject<TurnstileInstance | null>;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url.trim());
    }
  };

  return (
    <div className="text-center space-y-6 py-12 px-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <Zap className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-500">
          {t("analyzer.poweredBy")}
        </span>
      </div>

      <div className="space-y-3">
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          data-testid="text-hero-title"
        >
          {t("analyzer.heroTitle")}
        </h1>
        <p
          className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed"
          data-testid="text-hero-subtitle"
        >
          {t("analyzer.heroSubtitle")}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto"
        data-testid="form-url-input"
      >
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("analyzer.urlPlaceholder")}
            className="pl-9 h-11 bg-background border-border/60"
            disabled={isPending}
            data-testid="input-url"
          />
        </div>
        <Button
          type="submit"
          disabled={isPending || !url.trim()}
          className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white"
          data-testid="button-analyze"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("analyzer.analyzing")}
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              {t("analyzer.analyzeButton")}
            </>
          )}
        </Button>
      </form>

      {/* Invisible Turnstile widget */}
      <Turnstile
        ref={turnstileRef}
        siteKey={TURNSTILE_SITE_KEY}
        options={{ size: "invisible", theme: "dark" }}
        onSuccess={(token) => setTurnstileToken(token)}
        onError={() => setTurnstileToken(undefined)}
        onExpire={() => setTurnstileToken(undefined)}
      />
    </div>
  );
}

// ── Results Section ──────────────────────────────────────

function ResultsSection({
  result,
  onReset,
}: {
  result: AnalyzerResult;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const categories = [
    { key: "seo" as const, label: t("analyzer.seo"), score: result.seoScore },
    {
      key: "accessibility" as const,
      label: t("analyzer.accessibility"),
      score: result.accessibilityScore,
    },
    {
      key: "performance" as const,
      label: t("analyzer.performance"),
      score: result.performanceScore,
    },
    {
      key: "security" as const,
      label: t("analyzer.security"),
      score: result.securityScore,
    },
  ];

  const loadSpeedLabel =
    result.loadTimeIndicator === "fast"
      ? t("analyzer.fast")
      : result.loadTimeIndicator === "slow"
        ? t("analyzer.slow")
        : t("analyzer.medium_speed");

  const loadSpeedColor =
    result.loadTimeIndicator === "fast"
      ? "text-emerald-500"
      : result.loadTimeIndicator === "slow"
        ? "text-red-500"
        : "text-yellow-500";

  // Group findings by category
  const findingsByCategory = result.findings.reduce(
    (acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    },
    {} as Record<string, AnalyzerFinding[]>
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Top bar: analyzed URL + reset button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <span
            className="text-sm font-mono text-muted-foreground truncate"
            data-testid="text-analyzed-url"
          >
            {result.analyzedUrl}
          </span>
          {result.pageTitle && result.pageTitle !== "Unknown" && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {result.pageTitle}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          data-testid="button-analyze-another"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {t("analyzer.analyzeAnother")}
        </Button>
      </div>

      {/* Overall score */}
      <div className="text-center space-y-4">
        <ScoreRing
          score={result.overallScore}
          size={140}
          strokeWidth={10}
          ringColorClass="stroke-emerald-500"
          className="mx-auto"
        />
        <div>
          <p className="text-lg font-semibold">{t("analyzer.overall")}</p>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {t("analyzer.wordCount")}: {result.wordCount.toLocaleString()}
            </span>
            <span className={`flex items-center gap-1.5 ${loadSpeedColor}`}>
              <Gauge className="h-3.5 w-3.5" />
              {t("analyzer.loadTime")}: {loadSpeedLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Category scores grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        data-testid="grid-category-scores"
      >
        {categories.map((cat) => {
          const config = categoryConfig[cat.key];
          const count = (findingsByCategory[cat.key] ?? []).length;
          return (
            <CategoryScoreCard
              key={cat.key}
              label={cat.label}
              score={cat.score}
              icon={config.icon}
              ringColor={config.ringColor}
              bgGlow={config.bgGlow}
              findingsCount={count}
            />
          );
        })}
      </div>

      {/* Findings list */}
      {result.findings.length > 0 && (
        <div className="space-y-4">
          <h2
            className="text-lg font-semibold flex items-center gap-2"
            data-testid="text-findings-heading"
          >
            <Shield className="h-5 w-5 text-emerald-500" />
            {t("analyzer.findings")}
            <Badge variant="secondary" className="ml-1">
              {result.findings.length}
            </Badge>
          </h2>

          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2 pr-2">
              {result.findings
                .sort((a, b) => {
                  const order = { critical: 0, high: 1, medium: 2, low: 3 };
                  return order[a.severity] - order[b.severity];
                })
                .map((finding, idx) => (
                  <FindingItem key={idx} finding={finding} />
                ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {result.findings.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("analyzer.noFindings")}
          </p>
        </div>
      )}

      <Separator />

      {/* CTA upsell */}
      <Card
        className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20"
        data-testid="card-cta-upsell"
      >
        <CardContent className="py-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10">
            <Zap className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{t("analyzer.ctaTitle")}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {t("analyzer.ctaSubtitle")}
            </p>
          </div>
          <Button
            onClick={() => navigate("/")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
            data-testid="button-cta-get-started"
          >
            {t("analyzer.ctaButton")}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────

export default function FreeAnalyzer() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: (url: string) => runPublicAnalysis(url, turnstileToken),
    onSuccess: (data) => {
      if (data.success && data.result) {
        setResult(data.result);
        setError(null);
      } else {
        setError(data.error ?? "Analysis failed.");
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      // Reset Turnstile widget on error so user can retry
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    },
  });

  const handleAnalyze = (url: string) => {
    setResult(null);
    setError(null);
    analyzeMutation.mutate(url);
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    // Reset Turnstile for next analysis
    turnstileRef.current?.reset();
    setTurnstileToken(undefined);
  };

  return (
    <div className="min-h-screen bg-background" data-testid="page-free-analyzer">
      {/* Minimal standalone header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("analyzer.back")}
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Shield className="h-3 w-3 text-emerald-500" />
          </div>
          <span className="text-sm font-semibold">
            {t("analyzer.pageTitle")}
          </span>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-3xl mx-auto px-4">
        {!result && (
          <>
            <HeroSection
              onAnalyze={handleAnalyze}
              isPending={analyzeMutation.isPending}
              turnstileToken={turnstileToken}
              setTurnstileToken={setTurnstileToken}
              turnstileRef={turnstileRef}
            />

            {error && (
              <Alert
                variant="destructive"
                className="max-w-lg mx-auto mt-2"
                data-testid="alert-error"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {result && (
          <div className="pt-6">
            <ResultsSection result={result} onReset={handleReset} />
          </div>
        )}
      </main>

      {/* Footer attribution */}
      <footer className="text-center py-6 text-xs text-muted-foreground">
        <a
          href="https://www.perplexity.ai/computer"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Created with Perplexity Computer
        </a>
      </footer>
    </div>
  );
}
