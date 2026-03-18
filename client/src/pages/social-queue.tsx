import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { LockedFeature } from "@/components/locked-feature";
import {
  getSocialDrafts,
  updateSocialDraft,
  queryKeys,
  type SocialDraft,
  type SocialDraftStatus,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Share2,
  Twitter,
  Linkedin,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  FileText,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectId } from "@/hooks/use-project-id";


/* ─── Helpers ───────────────────────────────────────── */

function platformIcon(platform: string) {
  if (platform === "twitter")
    return <Twitter className="h-3.5 w-3.5" />;
  return <Linkedin className="h-3.5 w-3.5" />;
}

function platformLabel(platform: string) {
  return platform === "twitter" ? "Twitter/X" : "LinkedIn";
}

function statusBadge(
  status: SocialDraftStatus,
  t: (k: string) => string
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "AWAITING_APPROVAL":
      return { label: t("social.statusPending"), variant: "outline" };
    case "APPROVED":
      return { label: t("social.statusApproved"), variant: "default" };
    case "PUBLISHED":
      return { label: t("social.statusPublished"), variant: "secondary" };
    case "REJECTED":
      return { label: t("social.statusRejected"), variant: "destructive" };
    default:
      return { label: status, variant: "outline" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Parse draft_content: Twitter threads are JSON arrays, LinkedIn is plain text.
 */
function parseDraftContent(
  draft: SocialDraft
): { isThread: boolean; parts: string[] } {
  if (draft.platform === "twitter") {
    try {
      const arr = JSON.parse(draft.draft_content);
      if (Array.isArray(arr)) return { isThread: true, parts: arr };
    } catch {
      /* fall through */
    }
  }
  return { isThread: false, parts: [draft.draft_content] };
}

/* ─── KPI Row ──────────────────────────────────────── */

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
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
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Draft Card ───────────────────────────────────── */

function DraftCard({
  draft,
  onApprove,
  onReject,
  isPending,
}: {
  draft: SocialDraft;
  onApprove: (id: string, content: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const { isThread, parts } = parseDraftContent(draft);
  const [editedParts, setEditedParts] = useState<string[]>(parts);
  const isEditable = draft.status === "AWAITING_APPROVAL";

  const handlePartChange = (index: number, value: string) => {
    const next = [...editedParts];
    next[index] = value;
    setEditedParts(next);
  };

  const serialized = isThread
    ? JSON.stringify(editedParts)
    : editedParts[0];

  const badge = statusBadge(draft.status, t);

  return (
    <Card
      className="overflow-hidden"
      data-testid={`card-social-draft-${draft.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="gap-1 shrink-0 text-xs"
                data-testid={`badge-platform-${draft.id}`}
              >
                {platformIcon(draft.platform)}
                {platformLabel(draft.platform)}
              </Badge>
              {isThread && (
                <Badge variant="secondary" className="text-xs">
                  {t("social.thread", { count: parts.length })}
                </Badge>
              )}
            </div>
            <CardTitle className="text-sm font-medium leading-snug">
              <FileText className="inline h-3.5 w-3.5 mr-1 opacity-50" />
              {draft.article_title}
            </CardTitle>
          </div>
          <Badge variant={badge.variant} className="shrink-0 text-xs">
            {badge.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(draft.created_at)}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {editedParts.map((part, i) => (
          <div key={i} className="relative">
            {isThread && (
              <span className="absolute -left-0 top-2 text-[10px] font-mono text-muted-foreground select-none">
                {i + 1}/{editedParts.length}
              </span>
            )}
            <Textarea
              value={part}
              onChange={(e) => handlePartChange(i, e.target.value)}
              readOnly={!isEditable}
              className={`resize-none text-sm leading-relaxed ${
                isThread ? "pl-8" : ""
              } ${!isEditable ? "opacity-70 cursor-default" : ""}`}
              rows={Math.min(Math.max(part.split("\n").length + 1, 3), 8)}
              data-testid={`textarea-draft-${draft.id}-${i}`}
            />
          </div>
        ))}

        {isEditable && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onApprove(draft.id, serialized)}
              disabled={isPending}
              className="gap-1.5"
              data-testid={`button-approve-${draft.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("social.approvePost")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(draft.id)}
              disabled={isPending}
              className="gap-1.5"
              data-testid={`button-reject-${draft.id}`}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("social.reject")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Loading Skeleton ─────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[260px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────── */

export default function SocialQueue() {
  const PROJECT_ID = useProjectId();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Phase 32: Tier gate — Social requires autopilot+
  const userTier = user?.plan_tier || user?.plan || "free";
  const hasAccess = ["autopilot", "enterprise"].includes(userTier);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.socialDrafts(PROJECT_ID),
    queryFn: () => getSocialDrafts(PROJECT_ID),
    enabled: hasAccess,
  });

  const mutation = useMutation({
    mutationFn: ({
      draftId,
      body,
    }: {
      draftId: string;
      body: { status?: SocialDraftStatus; draft_content?: string };
    }) => updateSocialDraft(PROJECT_ID, draftId, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.socialDrafts(PROJECT_ID) });
      const action =
        variables.body.status === "APPROVED"
          ? t("social.statusApproved")
          : t("social.statusRejected");
      toast({ title: action, description: t("social.updateSuccess") });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("social.updateFailed"),
        variant: "destructive",
      });
    },
  });

  const handleApprove = (draftId: string, content: string) => {
    mutation.mutate({
      draftId,
      body: { status: "APPROVED", draft_content: content },
    });
  };

  const handleReject = (draftId: string) => {
    mutation.mutate({ draftId, body: { status: "REJECTED" } });
  };

  // Phase 32: Show locked state for non-autopilot users
  if (!hasAccess) {
    return (
      <LockedFeature
        featureName="Social Content Atomization"
        featureDescription="Transform articles into platform-native drafts for X and LinkedIn with one click. Approve, edit, and publish — all from your dashboard."
        icon="social"
      />
    );
  }

  const drafts = data?.drafts ?? [];
  const filtered =
    filterStatus === "all"
      ? drafts
      : drafts.filter((d) => d.status === filterStatus);

  const pendingCount = drafts.filter(
    (d) => d.status === "AWAITING_APPROVAL"
  ).length;
  const approvedCount = drafts.filter((d) => d.status === "APPROVED").length;
  const rejectedCount = drafts.filter((d) => d.status === "REJECTED").length;

  return (
    <div
      className="h-full overflow-y-auto"
      data-testid="page-social-queue"
    >
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Share2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1
                className="text-lg font-semibold tracking-tight"
                data-testid="text-social-title"
              >
                {t("social.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("social.subtitle")}
              </p>
            </div>
          </div>

          {/* Filter */}
          <Select
            value={filterStatus}
            onValueChange={setFilterStatus}
            data-testid="select-status-filter"
          >
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-status-trigger">
              <Filter className="h-3 w-3 mr-1.5 opacity-60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("social.filterAll")}</SelectItem>
              <SelectItem value="AWAITING_APPROVAL">
                {t("social.statusPending")}
              </SelectItem>
              <SelectItem value="APPROVED">
                {t("social.statusApproved")}
              </SelectItem>
              <SelectItem value="REJECTED">
                {t("social.statusRejected")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label={t("social.pendingReview")}
              value={pendingCount}
              icon={Clock}
            />
            <KpiCard
              label={t("social.statusApproved")}
              value={approvedCount}
              icon={Send}
            />
            <KpiCard
              label={t("social.statusRejected")}
              value={rejectedCount}
              icon={XCircle}
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

        {!isLoading && !error && filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <Share2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {t("social.emptyState")}
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onApprove={handleApprove}
                onReject={handleReject}
                isPending={mutation.isPending}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
