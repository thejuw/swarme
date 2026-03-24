import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getDecayCandidates,
  approveDecayRefresh,
  discardDecayRefresh,
  queryKeys,
  type DecayCandidate,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Eye,
  CalendarDays,
  FileText,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectId } from "@/hooks/use-project-id";


/* ─── Helpers ───────────────────────────────────────── */

function ageBadge(
  days: number,
  t: (k: string) => string
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (days >= 365)
    return { label: t("decay.critical"), variant: "destructive" };
  if (days >= 270)
    return { label: t("decay.stale"), variant: "secondary" };
  if (days >= 180)
    return { label: t("decay.aging"), variant: "outline" };
  return { label: t("decay.fresh"), variant: "default" };
}

function statusBadge(
  status: string | null,
  t: (k: string) => string
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "AWAITING_APPROVAL":
      return { label: t("decay.draftReady"), variant: "outline" };
    case "APPROVED":
      return { label: t("decay.refreshed"), variant: "default" };
    case "DISCARDED":
      return { label: t("decay.discarded"), variant: "secondary" };
    case "PENDING":
      return { label: t("decay.generating"), variant: "outline" };
    default:
      return { label: t("decay.noDraft"), variant: "secondary" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ─── KPI Card ──────────────────────────────────────── */

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          {sub && (
            <p className="text-[10px] text-muted-foreground">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Article Row ──────────────────────────────────── */

function ArticleRow({
  candidate,
  onReview,
  t,
}: {
  candidate: DecayCandidate;
  onReview: (c: DecayCandidate) => void;
  t: (k: string) => string;
}) {
  const age = ageBadge(candidate.age_days, t);
  const status = statusBadge(candidate.refresh_status, t);
  const hasRefreshDraft = !!candidate.refresh_draft_payload;

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:border-primary/40 transition-colors"
      onClick={() => onReview(candidate)}
      data-testid={`card-decay-${candidate.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={age.variant} className="text-xs shrink-0">
                <Clock className="h-3 w-3 mr-1" />
                {candidate.age_days}d
              </Badge>
              <Badge variant={status.variant} className="text-xs shrink-0">
                {status.label}
              </Badge>
              {hasRefreshDraft && (
                <Badge variant="outline" className="text-xs shrink-0 gap-1 border-primary/40 text-primary">
                  <Zap className="h-3 w-3" />
                  {t("decay.draftReady")}
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-medium leading-snug">
              {candidate.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDate(candidate.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {candidate.word_count} words
              </span>
              <span>SEO: {candidate.seo_score}/100</span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1 text-xs"
            data-testid={`button-review-${candidate.id}`}
          >
            <Eye className="h-3 w-3" />
            {t("decay.review")}
          </Button>
        </div>
        {/* Decay progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t("decay.decayLevel")}</span>
            <span>{Math.min(Math.round((candidate.age_days / 365) * 100), 100)}%</span>
          </div>
          <Progress
            value={Math.min((candidate.age_days / 365) * 100, 100)}
            className="h-1.5"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Diff Dialog ──────────────────────────────────── */

function DiffDialog({
  candidate,
  open,
  onClose,
  onApprove,
  onDiscard,
  isPending,
}: {
  candidate: DecayCandidate | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDiscard: (id: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  if (!candidate) return null;

  const hasRefreshDraft = !!candidate.refresh_draft_payload;
  const isActionable = candidate.refresh_status === "AWAITING_APPROVAL" && hasRefreshDraft;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            {candidate.title}
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Badge variant="outline" className="text-xs">
              {candidate.keyword}
            </Badge>
            <span>{candidate.age_days} {t("decay.daysOld")}</span>
            {candidate.published_url && (
              <a
                href={candidate.published_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                {t("decay.viewLive")}
              </a>
            )}
          </div>
        </DialogHeader>

        {hasRefreshDraft ? (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {/* Current version */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {t("decay.currentVersion")}
                </Badge>
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-lg border bg-muted/30 overflow-y-auto max-h-[55vh] text-xs leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: candidate.html_content || "<p>No content</p>",
                }}
                data-testid="diff-current"
              />
            </div>

            {/* Proposed refresh */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="text-xs gap-1">
                  <Zap className="h-3 w-3" />
                  {t("decay.proposedRefresh")}
                </Badge>
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-lg border border-primary/30 bg-primary/5 overflow-y-auto max-h-[55vh] text-xs leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: candidate.refresh_draft_payload || "",
                }}
                data-testid="diff-proposed"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto mt-2">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">
                {t("decay.noDraftYet")}
              </span>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-lg border bg-muted/30 overflow-y-auto max-h-[55vh] text-xs leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: candidate.html_content || "<p>No content</p>",
              }}
            />
          </div>
        )}

        {isActionable && (
          <DialogFooter className="gap-2 sm:gap-2 pt-3 border-t">
            <Button
              onClick={() => onApprove(candidate.id)}
              disabled={isPending}
              className="gap-1.5"
              data-testid={`button-approve-decay-${candidate.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("decay.approveOverwrite")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => onDiscard(candidate.id)}
              disabled={isPending}
              className="gap-1.5"
              data-testid={`button-discard-decay-${candidate.id}`}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("decay.discardUpdate")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Loading Skeleton ─────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[120px] rounded-lg" />
      ))}
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────── */

export default function DecayManager() {
  const PROJECT_ID = useProjectId();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<DecayCandidate | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.decayCandidates(PROJECT_ID),
    queryFn: () => getDecayCandidates(PROJECT_ID),
  enabled: !!PROJECT_ID,
  });

  const approveMutation = useMutation({
    mutationFn: (assetId: string) =>
      approveDecayRefresh(PROJECT_ID, assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.decayCandidates(PROJECT_ID) });
      toast({
        title: t("decay.approved"),
        description: t("decay.approvedDesc"),
      });
      setSelected(null);
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("decay.actionFailed"),
        variant: "destructive",
      });
    },
  });

  const discardMutation = useMutation({
    mutationFn: (assetId: string) =>
      discardDecayRefresh(PROJECT_ID, assetId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.decayCandidates(PROJECT_ID) });
      toast({
        title: t("decay.discardedTitle"),
        description: t("decay.discardedDesc"),
      });
      setSelected(null);
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("decay.actionFailed"),
        variant: "destructive",
      });
    },
  });

  const candidates = data?.candidates ?? [];
  const awaitingCount = candidates.filter(
    (c) => c.refresh_status === "AWAITING_APPROVAL"
  ).length;
  const staleCount = candidates.filter(
    (c) => !c.refresh_status && c.age_days >= 180
  ).length;
  const refreshedCount = candidates.filter(
    (c) => c.refresh_status === "APPROVED"
  ).length;
  const avgAge =
    candidates.length > 0
      ? Math.round(
          candidates.reduce((s, c) => s + c.age_days, 0) / candidates.length
        )
      : 0;

  return (
    <div
      className="h-full overflow-y-auto"
      data-testid="page-decay-manager"
    >
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1
              className="text-lg font-semibold tracking-tight"
              data-testid="text-decay-title"
            >
              {t("decay.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("decay.subtitle")}
            </p>
          </div>
        </div>

        {/* KPIs */}
        {!isLoading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label={t("decay.draftsReady")}
              value={awaitingCount}
              icon={Zap}
            />
            <KpiCard
              label={t("decay.staleArticles")}
              value={staleCount}
              icon={AlertTriangle}
            />
            <KpiCard
              label={t("decay.refreshedLabel")}
              value={refreshedCount}
              icon={CheckCircle2}
            />
            <KpiCard
              label={t("decay.avgAge")}
              value={`${avgAge}d`}
              icon={CalendarDays}
            />
          </div>
        )}

        {/* Content */}
        {isLoading && <LoadingSkeleton />}

        {error && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-destructive">{t("common.error")}</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && candidates.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {t("decay.emptyState")}
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && candidates.length > 0 && (
          <div className="space-y-3">
            {candidates.map((candidate) => (
              <ArticleRow
                key={candidate.id}
                candidate={candidate}
                onReview={setSelected}
                t={t}
              />
            ))}
          </div>
        )}

        {/* Diff Dialog */}
        <DiffDialog
          candidate={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onApprove={(id) => approveMutation.mutate(id)}
          onDiscard={(id) => discardMutation.mutate(id)}
          isPending={approveMutation.isPending || discardMutation.isPending}
        />

      </div>
    </div>
  );
}
