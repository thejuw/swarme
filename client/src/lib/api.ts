/**
 * lib/api.ts — Swarme API client (Phase 5)
 *
 * Typed interfaces mirroring the Cloudflare Worker + D1 contract,
 * plus thin fetch wrappers used by react-query hooks across the dashboard.
 *
 * All wrappers delegate to `apiRequest` from `@/lib/queryClient` for
 * consistent error handling and API_BASE resolution (dev vs deployed).
 */

import { apiRequest } from "@/lib/queryClient";

// ────────────────────────────────────────────
// Interfaces — D1 row shapes
// ────────────────────────────────────────────

/** Agent_Tasks row */
export interface Task {
  id: string;
  project_id: string;
  agent_type:
    | "scraper"
    | "writer"
    | "auditor"
    | "outreach"
    | "cro"
    | "visibility"
    | "orchestrator"
    | "publisher"
    | "researcher";
  action: string;
  status: "Pending" | "Running" | "Completed" | "Failed" | "Awaiting_Approval";
  task_description: string | null;
  result_payload: string | null;
  created_at: string;
  updated_at: string;
}

/** Visibility_Logs row */
export interface VisibilityLog {
  id: string;
  project_id: string;
  keyword: string;
  engine: string;
  cited: number; // 0 or 1
  rank_position: number | null;
  citation_url: string | null;
  checked_at: string;
}

/** KV-stored project settings */
export interface ProjectSettings {
  mode: "copilot" | "autopilot";
  is_active: boolean;
  visibility_check_enabled: boolean;
  trend_detection_enabled: boolean;
  cro_enabled: boolean;
  outreach_enabled: boolean;
  bounce_rate_threshold: number;
  trend_velocity_threshold: number;
  updated_at: string;
}

/** Projects row */
export interface Project {
  id: string;
  name: string;
  domain: string;
  mode: string;
  is_active: number;
  visibility_score: number;
  active_agents: number;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────
// Pipeline sub-types (Durable Object workflow)
// ────────────────────────────────────────────

export interface ResearchResult {
  serpResults: number;
  topCompetitors: string[];
  contentGaps: string[];
  semanticEntities: string[];
  suggestedAngle: string;
  rawCitations: unknown[];
  model: string;
  completedAt: string;
  source: "perplexity" | "mock_fallback";
}

export interface DraftResult {
  title: string;
  htmlContent: string;
  metaDescription: string;
  wordCount: number;
  sections: string[];
  seoScore: number;
  model: string;
  tokensUsed: number;
  completedAt: string;
  source: "openai" | "mock_fallback";
}

export interface MediaGenerationResult {
  totalPlaceholders: number;
  imagesGenerated: number;
  imagesSkipped: number;
  r2Keys: string[];
  completedAt: string;
  source: "dalle3_r2" | "mock_fallback";
}

export interface ImageAuditResult {
  totalImages: number;
  imagesMissingAlt: number;
  imagesEnriched: number;
  imagesSkipped: number;
  warnings: string[];
  completedAt: string;
  source: "workers_ai" | "mock_fallback";
}

export interface AuditResult {
  technicalIssues: string[];
  readabilityScore: number;
  keywordDensity: number;
  schemaValid: boolean;
  completedAt: string;
}

export interface PublishResult {
  mode: string;
  action: "published" | "awaiting_approval";
  publishedUrl: string | null;
  cmsResponseId: string | null;
  contentAssetId: string;
  completedAt: string;
  source: "cms_webhook" | "mock_fallback";
}

export type WorkflowState =
  | "IDLE"
  | "RESEARCHING"
  | "DRAFTING"
  | "MEDIA_GENERATION"
  | "IMAGE_AUDITING"
  | "AUDITING"
  | "AWAITING_APPROVAL"
  | "PUBLISHING"
  | "COMPLETED"
  | "FAILED";

export interface WorkflowStateData {
  state: WorkflowState;
  projectId: string;
  keyword: string;
  initiator: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
  failedAtStep: string | null;
  pipeline: {
    research: ResearchResult | null;
    draft: DraftResult | null;
    mediaGeneration: MediaGenerationResult | null;
    imageAudit: ImageAuditResult | null;
    audit: AuditResult | null;
    publishResult: PublishResult | null;
  };
}

// ────────────────────────────────────────────
// API response envelopes
// ────────────────────────────────────────────

export interface TasksResponse {
  success: boolean;
  project_id: string;
  count: number;
  tasks: Task[];
}

export interface VisibilitySummaryResponse {
  success: boolean;
  project_id: string;
  visibility_score: number;
  keywords_tracked: number;
  keywords_cited: number;
  citation_gaps: number;
  keywords: VisibilityLog[];
}

export interface SettingsResponse {
  success: boolean;
  project_id: string;
  kv_key: string;
  settings: ProjectSettings;
}

export interface ApproveTaskResponse {
  success: boolean;
  task_id: string;
  new_status: string;
}

export interface TriggerWorkflowResponse {
  success: boolean;
  project_id: string;
  state: string;
  keyword: string;
}

export interface WorkflowStatusResponse {
  success: boolean;
  project_id: string;
  workflow: WorkflowStateData;
}

export interface WorkflowApproveResponse {
  success: boolean;
  project_id: string;
  state: string;
  publishedUrl: string;
}

export interface ProjectsResponse {
  success: boolean;
  count: number;
  projects: Project[];
}

// ────────────────────────────────────────────
// Fetch wrappers — thin facades over apiRequest
// ────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/tasks
 * Fetches agent tasks with optional filters.
 */
export async function getTasks(
  projectId: string,
  opts?: { status?: string; agent_type?: string; limit?: number }
): Promise<TasksResponse> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.agent_type) params.set("agent_type", opts.agent_type);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const url = `/api/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`;
  const res = await apiRequest("GET", url);
  return res.json();
}

/**
 * GET /api/projects/:projectId/visibility/summary
 * Returns the visibility score plus per-keyword citation data.
 */
export async function getVisibility(
  projectId: string
): Promise<VisibilitySummaryResponse> {
  const res = await apiRequest(
    "GET",
    `/api/projects/${projectId}/visibility/summary`
  );
  return res.json();
}

/**
 * PUT /api/projects/:projectId/settings
 * Persists partial settings update (mode, flags, thresholds).
 */
export async function updateSettings(
  projectId: string,
  patch: Partial<ProjectSettings>
): Promise<SettingsResponse> {
  const res = await apiRequest(
    "PUT",
    `/api/projects/${projectId}/settings`,
    patch
  );
  return res.json();
}

/**
 * POST /api/projects/:projectId/tasks/:taskId/approve
 * Approves a task that is in Awaiting_Approval status.
 */
export async function approveTask(
  projectId: string,
  taskId: string
): Promise<ApproveTaskResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/tasks/${taskId}/approve`
  );
  return res.json();
}

/**
 * POST /api/projects/:projectId/trigger-workflow
 * Triggers the AgentWorkflowManager Durable Object pipeline.
 */
export async function triggerWorkflow(
  projectId: string,
  keyword: string,
  initiator: string = "manual"
): Promise<TriggerWorkflowResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/trigger-workflow`,
    { keyword, initiator }
  );
  return res.json();
}

/**
 * GET /api/projects/:projectId/workflow-status
 * Returns the current Durable Object workflow state + pipeline data.
 */
export async function getWorkflowStatus(
  projectId: string
): Promise<WorkflowStatusResponse> {
  const res = await apiRequest(
    "GET",
    `/api/projects/${projectId}/workflow-status`
  );
  return res.json();
}

/**
 * POST /api/projects/:projectId/workflow-approve
 * Approves a DO workflow that is in AWAITING_APPROVAL state → publishes.
 */
export async function approveWorkflow(
  projectId: string
): Promise<WorkflowApproveResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/workflow-approve`
  );
  return res.json();
}

/**
 * POST /api/projects/:projectId/workflow-reset
 * Resets the DO workflow back to IDLE.
 */
export async function resetWorkflow(
  projectId: string
): Promise<{ success: boolean; project_id: string; state: string }> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/workflow-reset`
  );
  return res.json();
}

/**
 * GET /api/projects
 * Lists all projects.
 */
export async function getProjects(): Promise<ProjectsResponse> {
  const res = await apiRequest("GET", "/api/projects");
  return res.json();
}

// ────────────────────────────────────────────
// Phase 11: Site Audit types
// ────────────────────────────────────────────

export interface AuditFinding {
  category: "performance" | "seo" | "accessibility" | "security" | "content";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  selector?: string;
}

export interface RoadmapItem {
  priority: number;
  title: string;
  description: string;
  category: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface SiteAudit {
  id: string;
  project_id: string;
  health_score: number;
  findings: AuditFinding[];
  roadmap: RoadmapItem[];
  status: "running" | "completed" | "failed";
  error_message: string | null;
  audited_url: string;
  pages_crawled: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLatestResponse {
  success: boolean;
  project_id: string;
  audit: SiteAudit | null;
  message?: string;
}

export interface AuditRunResponse {
  success: boolean;
  audit_id: string;
  project_id: string;
  status: string;
  audited_url: string;
}

/** Phase 12: Dispatch audit fix response */
export interface DispatchTaskResponse {
  success: boolean;
  task_id: string;
  status: string;
  agent_type: string;
  mode: string;
}

// ────────────────────────────────────────────
// Phase 12: Dispatch audit fix
// ────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/tasks/dispatch
 * Dispatches an audit roadmap item to the swarm for remediation.
 */
export async function dispatchAuditTask(
  projectId: string,
  item: {
    title: string;
    description: string;
    category: string;
    priority: number;
    effort: string;
    impact: string;
  }
): Promise<DispatchTaskResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/tasks/dispatch`,
    item
  );
  return res.json();
}

// ────────────────────────────────────────────
// Site Audit fetch wrappers
// ────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/audit/run
 * Triggers a deep site audit.
 */
export async function runSiteAudit(
  projectId: string
): Promise<AuditRunResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/audit/run`
  );
  return res.json();
}

/**
 * GET /api/projects/:projectId/audit/latest
 * Returns the most recent audit.
 */
export async function getLatestAudit(
  projectId: string
): Promise<AuditLatestResponse> {
  const res = await apiRequest(
    "GET",
    `/api/projects/${projectId}/audit/latest`
  );
  return res.json();
}

// ────────────────────────────────────────────
// Phase 19: Authentication types + wrappers
// ────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role?: "user" | "superadmin";
  plan?: string;
  plan_tier?: string;
  tasks_used_this_month?: number;
  task_limit?: number;
  is_impersonating?: boolean;
}

// ── Phase 21: Admin API types ─────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  created_at: string;
}

export interface InfrastructureKeys {
  ai_models: Record<string, string>;
  communications: Record<string, string>;
  billing: Record<string, string>;
  security: Record<string, string>;
  support: Record<string, string>;
  compliance: Record<string, string>;
  affiliates: Record<string, string>;
  google: Record<string, string>;
}

// ── Phase 23: Public Config types ─────────────────────────

export interface PublicConfig {
  supportAppId: string;
  cookieConsentId: string;
  rewardfulId: string;
}

export async function fetchPublicConfig(): Promise<{ success: boolean; config?: PublicConfig }> {
  const res = await apiRequest("GET", "/api/public/config");
  return res.json();
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
}

export interface AuthMeResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export async function authRegister(
  email: string,
  password: string,
  turnstileToken?: string,
  referralId?: string,
  acceptedTerms?: boolean
): Promise<AuthResponse> {
  const res = await apiRequest("POST", "/api/auth/register", { email, password, turnstileToken, referralId, accepted_terms: acceptedTerms });
  return res.json();
}

export async function authLogin(
  email: string,
  password: string,
  turnstileToken?: string
): Promise<AuthResponse> {
  const res = await apiRequest("POST", "/api/auth/login", { email, password, turnstileToken });
  return res.json();
}

export async function authMe(): Promise<AuthMeResponse> {
  const res = await apiRequest("GET", "/api/auth/me");
  return res.json();
}

// ────────────────────────────────────────────
// Phase 14: Integration Connection types
// ────────────────────────────────────────────

export interface IntegrationVerifyResponse {
  success: boolean;
  platform: string;
  store_name: string;
  project_id: string;
  message: string;
  error?: string;
}

export interface IntegrationStatusResponse {
  success: boolean;
  project_id: string;
  platform: string | null;
  connected: boolean;
  shopify_domain: string | null;
  woocommerce_domain: string | null;
  bigcommerce_store_hash: string | null;
}

// ────────────────────────────────────────────
// Phase 14: Integration fetch wrappers
// ────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/integrations/verify
 * Validates credentials and persists to KV vault if successful.
 */
export async function verifyIntegration(
  projectId: string,
  payload: {
    platform: string;
    domain?: string;
    access_token?: string;
    consumer_key?: string;
    consumer_secret?: string;
    store_hash?: string;
    blog_id?: string;
  }
): Promise<IntegrationVerifyResponse> {
  const res = await apiRequest(
    "POST",
    `/api/projects/${projectId}/integrations/verify`,
    payload
  );
  return res.json();
}

/**
 * GET /api/projects/:projectId/integrations/status
 * Returns the current integration connection status.
 */
export async function getIntegrationStatus(
  projectId: string
): Promise<IntegrationStatusResponse> {
  const res = await apiRequest(
    "GET",
    `/api/projects/${projectId}/integrations/status`
  );
  return res.json();
}

// ────────────────────────────────────────────
// Phase 13: Public Analyzer types + wrapper
// ────────────────────────────────────────────

export interface AnalyzerFinding {
  category: "seo" | "accessibility" | "performance" | "security" | "content";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface AnalyzerResult {
  overallScore: number;
  seoScore: number;
  accessibilityScore: number;
  performanceScore: number;
  securityScore: number;
  findings: AnalyzerFinding[];
  pageTitle: string;
  analyzedUrl: string;
  wordCount: number;
  loadTimeIndicator: "fast" | "medium" | "slow";
}

export interface PublicAnalyzeResponse {
  success: boolean;
  result?: AnalyzerResult;
  error?: string;
}

export async function runPublicAnalysis(
  url: string,
  turnstileToken?: string
): Promise<PublicAnalyzeResponse> {
  const res = await apiRequest("POST", "/api/public/analyze", { url, turnstileToken });
  return res.json();
}

// ────────────────────────────────────────────
// Phase 15 — Revenue Attribution / ROI types
// ────────────────────────────────────────────

export interface ROIMonthlyDataPoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface ROITopAsset {
  asset_id: string;
  title: string;
  slug: string;
  published_url: string;
  total_revenue: number;
  order_count: number;
}

export interface ROIAnalyticsResponse {
  success: boolean;
  project_id: string;
  total_revenue: number;
  total_orders: number;
  currency: string;
  monthly_revenue: ROIMonthlyDataPoint[];
  top_assets: ROITopAsset[];
}

export async function getROIAnalytics(
  projectId: string
): Promise<ROIAnalyticsResponse> {
  const res = await fetch(`/api/projects/${projectId}/analytics/roi`);
  if (!res.ok) throw new Error("Failed to fetch ROI analytics");
  return res.json();
}

// ────────────────────────────────────────────
// Phase 16 — CRO Telemetry types
// ────────────────────────────────────────────

export interface TelemetryAsset {
  asset_id: string;
  title: string;
  slug: string;
  published_url: string;
  total_views: number;
  avg_scroll_depth: number;
  avg_dwell_time_seconds: number;
  cta_clicks: number;
  last_optimized_at: string | null;
  updated_at: string;
}

export interface TelemetrySummary {
  total_tracked_assets: number;
  total_views: number;
  total_cta_clicks: number;
  avg_scroll_depth: number;
  avg_dwell_time_seconds: number;
  underperforming_count: number;
}

export interface TelemetryResponse {
  success: boolean;
  project_id: string;
  summary: TelemetrySummary;
  assets: TelemetryAsset[];
  underperforming: TelemetryAsset[];
}

export async function getTelemetrySummary(
  projectId: string
): Promise<TelemetryResponse> {
  const res = await apiRequest("GET", `/api/projects/${projectId}/telemetry/summary`);
  return res.json();
}

// ────────────────────────────────────────────
// Phase 17: Social Drafts (Content Atomization)
// ────────────────────────────────────────────

export type SocialDraftStatus =
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED";

export type SocialPlatform = "twitter" | "linkedin";

export interface SocialDraft {
  id: string;
  project_id: string;
  asset_id: string;
  article_title: string;
  platform: SocialPlatform;
  /** Twitter: JSON-stringified string[] (thread). LinkedIn: plain string. */
  draft_content: string;
  status: SocialDraftStatus;
  created_at: string;
  updated_at: string;
}

export interface SocialDraftsResponse {
  success: boolean;
  project_id: string;
  drafts: SocialDraft[];
  total: number;
}

export async function getSocialDrafts(
  projectId: string,
  status?: SocialDraftStatus
): Promise<SocialDraftsResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = `/api/projects/${projectId}/social/drafts${qs ? `?${qs}` : ""}`;
  const res = await apiRequest("GET", url);
  return res.json();
}

export async function updateSocialDraft(
  projectId: string,
  draftId: string,
  body: { status?: SocialDraftStatus; draft_content?: string }
): Promise<{ success: boolean; draft: SocialDraft }> {
  const res = await apiRequest("PATCH", `/api/projects/${projectId}/social/drafts/${draftId}`, body);
  return res.json();
}

// ────────────────────────────────────────────
// Phase 18: Content Decay Manager
// ────────────────────────────────────────────

export type DecayRefreshStatus =
  | "PENDING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "DISCARDED";

export interface DecayCandidate {
  id: string;
  project_id: string;
  keyword: string;
  title: string;
  slug: string;
  html_content: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
  refresh_draft_payload: string | null;
  refresh_status: DecayRefreshStatus | null;
  word_count: number;
  seo_score: number;
  age_days: number;
}

export interface DecayCandidatesResponse {
  success: boolean;
  project_id: string;
  candidates: DecayCandidate[];
  total: number;
}

export async function getDecayCandidates(
  projectId: string,
  status?: DecayRefreshStatus
): Promise<DecayCandidatesResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = `/api/projects/${projectId}/decay/candidates${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch decay candidates");
  return res.json();
}

export async function approveDecayRefresh(
  projectId: string,
  assetId: string
): Promise<{ success: boolean; asset_id: string; status: string }> {
  const res = await fetch(
    `/api/projects/${projectId}/decay/${assetId}/approve`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to approve refresh");
  return res.json();
}

export async function discardDecayRefresh(
  projectId: string,
  assetId: string
): Promise<{ success: boolean; asset_id: string; status: string }> {
  const res = await fetch(
    `/api/projects/${projectId}/decay/${assetId}/discard`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to discard refresh");
  return res.json();
}

// ────────────────────────────────────────────
// Phase 26: AI Manager types
// ────────────────────────────────────────────

export interface ManagerChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ManagerChatResponse {
  success: boolean;
  reply: string;
  brand_context_updated: boolean;
  roadmap_items_added: number;
  error?: string;
}

export interface AIRoadmapItem {
  id: string;
  project_id: string;
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  status: "Suggested" | "Approved" | "In_Progress" | "Completed";
  action_payload: string;
  created_at: string;
  updated_at: string;
}

export interface AIRoadmapResponse {
  success: boolean;
  project_id: string;
  items: AIRoadmapItem[];
  total: number;
}

export type BusinessModel = "e-commerce" | "lead_gen" | "affiliate" | "publisher";

export interface DiscoveredCompetitor {
  domain: string;
  reason: string;
  estimated_traffic?: string;
}

export interface BrandContextData {
  project_id: string;
  target_audience: string;
  core_goals: string;
  tone_of_voice: string;
  competitors: string;
  business_model: BusinessModel | "";
  auto_discovered_competitors: string; // JSON stringified DiscoveredCompetitor[]
  north_star_url: string;
  last_updated: string;
}

export interface ConversionConfig {
  label: string;
  events: string[];
  primaryKpi: string;
  secondaryKpis: string[];
  description: string;
}

export async function sendManagerChat(
  projectId: string,
  messages: ManagerChatMessage[]
): Promise<ManagerChatResponse> {
  const res = await apiRequest("POST", "/api/manager/chat", {
    project_id: projectId,
    messages,
  });
  return res.json();
}

export async function getManagerRoadmap(
  projectId: string
): Promise<AIRoadmapResponse> {
  const res = await apiRequest("GET", `/api/manager/roadmap?project_id=${projectId}`);
  return res.json();
}

export async function updateRoadmapStatus(
  taskId: string,
  status: string
): Promise<{ success: boolean; task_id: string; new_status: string }> {
  const res = await apiRequest("PATCH", `/api/manager/roadmap/${taskId}`, {
    status,
  });
  return res.json();
}

export async function deployRoadmapItem(
  taskId: string
): Promise<{ success: boolean; task_id: string; status: string; dispatch: string }> {
  const res = await apiRequest("POST", `/api/manager/roadmap/${taskId}/deploy`);
  return res.json();
}

export async function getBrandContext(
  projectId: string
): Promise<{ success: boolean; project_id: string; context: BrandContextData | null }> {
  const res = await apiRequest("GET", `/api/manager/brand-context?project_id=${projectId}`);
  return res.json();
}

// ────────────────────────────────────────────
// React-query key factories (for consistent invalidation)
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// Phase 34: GSC Integration types + wrappers
// ────────────────────────────────────────────

export interface GscMetricRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscMetricsResponse {
  success: boolean;
  project_id: string;
  metrics: GscMetricRow[];
  count: number;
}

export interface GscStatusResponse {
  success: boolean;
  connected: boolean;
  property_url: string | null;
}

export async function getGscMetrics(
  projectId: string
): Promise<GscMetricsResponse> {
  const res = await apiRequest("GET", `/api/projects/${projectId}/gsc-metrics`);
  return res.json();
}

export async function getGscStatus(): Promise<GscStatusResponse> {
  const res = await apiRequest("GET", "/api/gsc/status");
  return res.json();
}

export async function disconnectGsc(): Promise<{ success: boolean }> {
  const res = await apiRequest("DELETE", "/api/gsc/disconnect");
  return res.json();
}

// ────────────────────────────────────────────
// Phase 42: GA4 Integration types + wrappers
// ────────────────────────────────────────────

export interface Ga4MetricRow {
  page_path: string;
  device_category: string;
  date: string;
  sessions: number;
  bounce_rate: number;
  avg_session_duration: number;
  conversions: number;
  conversion_rate: number;
  country: string;
}

export interface Ga4MetricsResponse {
  success: boolean;
  metrics: Ga4MetricRow[];
}

export interface Ga4StatusResponse {
  success: boolean;
  connected: boolean;
  property_id: string | null;
}

export async function getGa4Status(): Promise<Ga4StatusResponse> {
  const res = await apiRequest("GET", "/api/ga4/status");
  return res.json();
}

export async function disconnectGa4(): Promise<{ success: boolean }> {
  const res = await apiRequest("DELETE", "/api/ga4/disconnect");
  return res.json();
}

export async function getGa4Metrics(
  projectId: string
): Promise<Ga4MetricsResponse> {
  const res = await apiRequest("GET", `/api/ga4/metrics?project_id=${projectId}`);
  return res.json();
}

// ────────────────────────────────────────────
// Phase 37: Action History, Rollback, Mission Control
// ────────────────────────────────────────────

export interface ActionHistoryEntry {
  id: string;
  project_id: string;
  agent_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  snapshot_before: string | null;
  snapshot_after: string | null;
  preview_url: string | null;
  rolled_back: number;
  rolled_back_at: string | null;
  created_at: string;
}

export interface ActionHistoryResponse {
  success: boolean;
  project_id: string;
  actions: ActionHistoryEntry[];
  total: number;
}

export interface RollbackResponse {
  success: boolean;
  action_id: string;
  rolled_back: boolean;
  restored_snapshot: Record<string, unknown>;
}

export interface IntegrationHealth {
  id: string;
  name: string;
  platform: string;
  status: "connected" | "degraded" | "disconnected";
  last_sync: string;
  sync_errors: number;
}

export interface AgentHealthPulse {
  agent_type: string;
  status: "healthy" | "degraded" | "idle" | "error";
  tasks_last_hour: number;
  errors_last_hour: number;
  avg_latency_ms: number;
}

export interface CronJobStatus {
  name: string;
  cron: string;
  last_run: string;
  next_run: string;
  status: "success" | "failed" | "running";
  duration_ms: number;
}

export interface MissionControlSummary {
  total_actions_24h: number;
  rollbacks_24h: number;
  agents_active: number;
  agents_degraded: number;
  agents_idle: number;
  integrations_connected: number;
  integrations_degraded: number;
  crons_healthy: number;
  crons_total: number;
}

export interface MissionControlResponse {
  success: boolean;
  project_id: string;
  summary: MissionControlSummary;
  integrations: IntegrationHealth[];
  agent_health: AgentHealthPulse[];
  cron_jobs: CronJobStatus[];
  recent_actions: ActionHistoryEntry[];
}

export async function getActionHistory(
  projectId: string,
  opts?: { agent_type?: string; entity_type?: string; rolled_back?: number; limit?: number }
): Promise<ActionHistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.agent_type) params.set("agent_type", opts.agent_type);
  if (opts?.entity_type) params.set("entity_type", opts.entity_type);
  if (opts?.rolled_back !== undefined) params.set("rolled_back", String(opts.rolled_back));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const url = `/api/projects/${projectId}/action-history${qs ? `?${qs}` : ""}`;
  const res = await apiRequest("GET", url);
  return res.json();
}

export async function rollbackAction(
  projectId: string,
  actionId: string
): Promise<RollbackResponse> {
  const res = await apiRequest("POST", `/api/projects/${projectId}/action-history/${actionId}/rollback`);
  return res.json();
}

export async function getMissionControl(
  projectId: string
): Promise<MissionControlResponse> {
  const res = await apiRequest("GET", `/api/projects/${projectId}/mission-control`);
  return res.json();
}

export const queryKeys = {
  projects: () => ["/api/projects"] as const,
  tasks: (projectId: string) =>
    ["/api/projects", projectId, "tasks"] as const,
  visibility: (projectId: string) =>
    ["/api/projects", projectId, "visibility", "summary"] as const,
  workflowStatus: (projectId: string) =>
    ["/api/projects", projectId, "workflow-status"] as const,
  auditLatest: (projectId: string) =>
    ["/api/projects", projectId, "audit", "latest"] as const,
  integrationStatus: (projectId: string) =>
    ["/api/projects", projectId, "integrations", "status"] as const,
  roiAnalytics: (projectId: string) =>
    ["/api/projects", projectId, "analytics", "roi"] as const,
  telemetrySummary: (projectId: string) =>
    ["/api/projects", projectId, "telemetry", "summary"] as const,
  socialDrafts: (projectId: string) =>
    ["/api/projects", projectId, "social", "drafts"] as const,
  decayCandidates: (projectId: string) =>
    ["/api/projects", projectId, "decay", "candidates"] as const,
  managerRoadmap: (projectId: string) =>
    ["/api/manager", "roadmap", projectId] as const,
  brandContext: (projectId: string) =>
    ["/api/manager", "brand-context", projectId] as const,
  gscMetrics: (projectId: string) =>
    ["/api/projects", projectId, "gsc-metrics"] as const,
  gscStatus: () => ["/api/gsc", "status"] as const,
  ga4Status: () => ["/api/ga4", "status"] as const,
  ga4Metrics: (projectId: string) =>
    ["/api/ga4", "metrics", projectId] as const,
  abTests: (projectId: string) =>
    ["/api/projects", projectId, "ab-tests"] as const,
  adminUsers: () => ["/api/admin/users"] as const,
  adminUserDetail: (userId: string) =>
    ["/api/admin/users", userId] as const,
  actionHistory: (projectId: string) =>
    ["/api/projects", projectId, "action-history"] as const,
  missionControl: (projectId: string) =>
    ["/api/projects", projectId, "mission-control"] as const,
  outreachCampaigns: (projectId: string) =>
    ["/api/projects", projectId, "outreach-campaigns"] as const,
  internalLinks: (projectId: string) =>
    ["/api/projects", projectId, "internal-links"] as const,
} as const;

// ────────────────────────────────────────────
// Phase 35: A/B Testing types + wrappers
// ────────────────────────────────────────────

export interface AbTestSignificance {
  rateA: number;
  rateB: number;
  pooledRate: number;
  zScore: number;
  pValue: number;
  confidence: number;
  isSignificant: boolean;
  winner: "A" | "B" | null;
  meetsMinViews: boolean;
}

export interface AbTest {
  id: string;
  project_id: string;
  asset_id: string;
  test_name: string;
  target_selector: string;
  variant_a_html: string;
  variant_b_html: string;
  views_a: number;
  views_b: number;
  conversions_a: number;
  conversions_b: number;
  status: "Running" | "Concluded";
  winner: "A" | "B" | null;
  min_views: number;
  created_at: string;
  updated_at: string;
  significance: AbTestSignificance;
}

export interface AbTestsResponse {
  success: boolean;
  project_id: string;
  tests: AbTest[];
  total: number;
}

export async function getAbTests(
  projectId: string,
  status?: "Running" | "Concluded"
): Promise<AbTestsResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = `/api/projects/${projectId}/ab-tests${qs ? `?${qs}` : ""}`;
  const res = await apiRequest("GET", url);
  return res.json();
}

// ────────────────────────────────────────────
// Phase 36: Admin User Override types + wrappers
// ────────────────────────────────────────────

export interface AdminUserGscSummary {
  total_clicks: number;
  total_impressions: number;
  avg_ctr: number;
  avg_position: number;
  mini_series: { date: string; clicks: number }[];
}

export interface AdminUserBrandContext {
  target_audience: string;
  core_goals: string;
  tone_of_voice: string;
  competitors: string;
  business_model: string;
  auto_discovered_competitors: string;
  north_star_url: string;
}

export interface AdminUserTask {
  id: string;
  agent_type: string;
  action: string;
  status: string;
  task_description: string;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  plan_tier: string;
  tasks_used_this_month: number;
  task_limit: number;
  total_revenue: number;
  recent_tasks: AdminUserTask[];
  gsc_summary: AdminUserGscSummary;
  brand_context: AdminUserBrandContext | null;
  name?: string;
}

export interface AdminUserDetailResponse {
  success: boolean;
  user: AdminUserDetail;
}

export interface AdminProvisionResponse {
  success: boolean;
  user_id: string;
  temporary_password: string;
}

export interface AdminPlanOverrideResponse {
  success: boolean;
  plan_tier: string;
  task_limit: number;
}

export interface AdminImpersonateResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  expires_in: number;
}

export async function getAdminUserDetail(
  userId: string
): Promise<AdminUserDetailResponse> {
  const res = await apiRequest("GET", `/api/admin/users/${userId}`);
  return res.json();
}

export async function provisionUser(
  email: string,
  name: string,
  plan_tier: string
): Promise<AdminProvisionResponse> {
  const res = await apiRequest("POST", "/api/admin/users", { email, name, plan_tier });
  return res.json();
}

export async function overrideUserPlan(
  userId: string,
  plan_tier: string
): Promise<AdminPlanOverrideResponse> {
  const res = await apiRequest("PATCH", `/api/admin/users/${userId}/plan`, { plan_tier });
  return res.json();
}

export async function updateUserStatus(
  userId: string,
  status: string
): Promise<{ success: boolean; status: string }> {
  const res = await apiRequest("PATCH", `/api/admin/users/${userId}/status`, { status });
  return res.json();
}

export async function impersonateUser(
  userId: string
): Promise<AdminImpersonateResponse> {
  const res = await apiRequest("POST", `/api/admin/users/${userId}/impersonate`);
  return res.json();
}

// ────────────────────────────────────────────
// Phase 38: Outreach Campaign types + wrappers
// ────────────────────────────────────────────

export interface OutreachDraftContent {
  subject: string;
  body: string;
}

export interface OutreachCampaign {
  id: string;
  project_id: string;
  keyword: string;
  target_url: string;
  target_email: string | null;
  contact_name: string | null;
  outreach_draft: string | null; // JSON-encoded OutreachDraftContent
  status: "Draft" | "Approved" | "Sent" | "Replied" | "Bounced" | "Declined";
  domain_authority: number | null;
  relevance_score: number | null;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachSummary {
  total: number;
  drafts: number;
  sent: number;
  replied: number;
  approved: number;
}

export interface OutreachCampaignsResponse {
  success: boolean;
  campaigns: OutreachCampaign[];
  summary: OutreachSummary;
}

export interface OutreachProspectResponse {
  success: boolean;
  keyword: string;
  prospects_found: number;
  drafts_created: number;
  message: string;
}

export interface OutreachSendResponse {
  success: boolean;
  campaign?: OutreachCampaign;
  message_id?: string;
  error?: string;
}

export async function getOutreachCampaigns(
  projectId: string,
  status?: string
): Promise<OutreachCampaignsResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiRequest("GET", `/api/projects/${projectId}/outreach-campaigns${qs}`);
  return res.json();
}

export async function updateOutreachCampaign(
  projectId: string,
  campaignId: string,
  data: { outreach_draft?: string; status?: string }
): Promise<{ success: boolean; campaign: OutreachCampaign }> {
  const res = await apiRequest("PATCH", `/api/projects/${projectId}/outreach-campaigns/${campaignId}`, data);
  return res.json();
}

export async function sendOutreachCampaign(
  projectId: string,
  campaignId: string
): Promise<OutreachSendResponse> {
  const res = await apiRequest("POST", `/api/projects/${projectId}/outreach-campaigns/${campaignId}/send`);
  return res.json();
}

export async function runOutreachProspecting(
  projectId: string,
  keyword: string
): Promise<OutreachProspectResponse> {
  const res = await apiRequest("POST", `/api/projects/${projectId}/outreach-campaigns/prospect`, { keyword });
  return res.json();
}

// ── Phase 39: Internal Link Graph ──

export interface InternalLink {
  id: string;
  project_id: string;
  source_asset_id: string;
  source_title: string;
  source_slug: string;
  target_asset_id: string;
  target_title: string;
  target_slug: string;
  target_url: string;
  anchor_text: string;
  similarity_score: number;
  status: "active" | "removed" | "broken";
  injected_at: string;
  created_at: string;
}

export interface LinkGraphNode {
  id: string;
  title: string;
  slug: string;
  inbound: number;
  outbound: number;
}

export interface LinkGraphEdge {
  source: string;
  target: string;
  anchor_text: string;
  similarity_score: number;
}

export interface LinkGraphSummary {
  total_links: number;
  active_links: number;
  removed_links: number;
  articles_connected: number;
  avg_similarity: number;
}

export interface InternalLinksResponse {
  links: InternalLink[];
  graph: {
    nodes: LinkGraphNode[];
    edges: LinkGraphEdge[];
  };
  summary: LinkGraphSummary;
}

export async function getInternalLinks(
  projectId: string,
  status?: string
): Promise<InternalLinksResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiRequest("GET", `/api/projects/${projectId}/internal-links${qs}`);
  return res.json();
}

export async function removeInternalLink(
  projectId: string,
  linkId: string
): Promise<{ success: boolean; link: InternalLink }> {
  const res = await apiRequest("DELETE", `/api/projects/${projectId}/internal-links/${linkId}`);
  return res.json();
}

export async function restoreInternalLink(
  projectId: string,
  linkId: string
): Promise<{ success: boolean; link: InternalLink }> {
  const res = await apiRequest("POST", `/api/projects/${projectId}/internal-links/${linkId}/restore`);
  return res.json();
}

// ── Phase 44: Alert frequency & digest preferences ─────────

export type AlertFrequency = "realtime" | "daily" | "weekly" | "muted";

export interface UserDigestSettings {
  alert_frequency: AlertFrequency;
  receive_sms: boolean;
  receive_marketing: boolean;
}

export async function patchUserSettings(
  settings: Partial<UserDigestSettings>
): Promise<{ success: boolean; settings: UserDigestSettings }> {
  const res = await apiRequest("PATCH", "/api/user/settings", settings);
  return res.json();
}
