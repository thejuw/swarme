# Swarme — System Architecture

> Edge-native, serverless Generative Engine Optimization (GEO) platform.
> Every component runs at the Cloudflare edge — zero origin servers.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Infrastructure Stack](#infrastructure-stack)
3. [Repository Layout](#repository-layout)
4. [Core Modules & Data Flow](#core-modules--data-flow)
   - [The Edge Interception Layer](#the-edge-interception-layer)
   - [The Brain & Memory](#the-brain--memory)
   - [Off-Domain Syndication](#off-domain-syndication)
   - [The Financial Ledger](#the-financial-ledger)
   - [Autonomous Cron Orchestration](#autonomous-cron-orchestration)
   - [Resilience & Observability](#resilience--observability)
5. [The Global Hive Mind & Governance](#the-global-hive-mind--governance)
6. [Authentication & Multi-Tenancy](#authentication--multi-tenancy)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [D1 Migration Inventory](#d1-migration-inventory)

---

## System Overview

Swarme is an enterprise platform that optimizes websites for citation by AI search engines (ChatGPT, Perplexity, Gemini, Claude). It operates as a coordinated swarm of autonomous AI agents — each specializing in a domain of SEO/GEO strategy — orchestrated by a central AI Manager that acts as a Chief Strategy Officer for the brand.

The platform is fully edge-native: the API worker, cron triggers, durable state machines, vector memory, relational storage, object storage, and the dashboard are all deployed to Cloudflare's global network with zero origin servers.

**Key architectural principles:**

- **Multi-tenant by design.** Every D1 query is scoped to `domain_id`. The AI must never query tables using only `user_id`.
- **Human-in-the-loop.** Social posts, content refreshes, and global network rules are never applied autonomously. All require explicit human approval.
- **Federated intelligence.** Cross-tenant learnings are anonymized, clustered, and surfaced as opt-in recommendations — never injected without consent.

---

## Infrastructure Stack

| Service | Binding | Purpose |
|---|---|---|
| **Cloudflare Workers** | — | Edge compute for the Hono API, cron triggers, and middleware |
| **Cloudflare D1** | `DB` | SQLite at the edge — 42 migrations, relational state for all tenants |
| **Cloudflare KV** | `CONFIG_KV` | Sub-millisecond reads for project settings, feature flags, API key vault |
| **Cloudflare KV** | `HIVE_MIND` | Globally replicated store for verified cross-tenant GEO rules |
| **Cloudflare Vectorize** | `VECTORIZE` | 768-dim vector index (BGE-base-en-v1.5) for semantic memory + hive clustering |
| **Cloudflare R2** | `MEDIA_BUCKET` | Object storage for generated media assets and cold-storage log archives |
| **Cloudflare Durable Objects** | `AGENT_WORKFLOW` | Persistent state machine for the multi-step agent workflow manager |
| **Cloudflare Durable Objects** | `WORKFLOW_CHECKPOINT` | Checkpointing for long-running workflow recovery |
| **Cloudflare Browser Rendering** | `BROWSER` | Headless Chromium for site analysis, screenshots, and visual audits |
| **Cloudflare AI** | `AI` | Workers AI binding for embedding generation |
| **Cloudflare Pages** | — | Static hosting for the Vite + React dashboard at `swarme.io` |

---

## Repository Layout

```
swarme/
├── client/                      # Frontend (Vite + React + Tailwind + shadcn/ui)
│   └── src/
│       ├── components/          # Reusable UI (admin/, landing/, ui/)
│       ├── context/             # AuthContext, ThemeProvider
│       ├── hooks/               # use-toast, use-mobile
│       ├── lib/                 # queryClient, api helpers
│       ├── locales/             # i18n strings
│       └── pages/               # Route pages
│           ├── admin/           # Superadmin panel (overview, users, vault, settings, chaos)
│           ├── onboarding/      # Context setup + provisioning wizard
│           ├── public/          # Marketing pages (about, contact, developers, help, security)
│           └── legal/           # Privacy policy, terms of service
├── workers/                     # Edge worker (Hono + Cloudflare Workers)
│   ├── src/
│   │   ├── auth.ts              # JWT authentication + protectRoute middleware
│   │   ├── index.ts             # Hono app, route mounting, cron dispatcher, Env interface
│   │   ├── durable_object.ts    # AgentWorkflowManager DO (v1)
│   │   ├── durable_objects/     # WorkflowCheckpointDO (v2)
│   │   ├── cron/                # 13 autonomous cron handlers
│   │   ├── middleware/          # abSplit, apiAuth, domainAuth, geoRewriter, ragRewriter, sanitizer
│   │   ├── routes/              # Hono routers (manager, billing, integrations, settings, webhooks)
│   │   ├── utils/               # 30+ utility modules (AI manager, anonymizer, stripe, vectorize...)
│   │   └── tests/               # Chaos engineering (apiFuzzer, llmAttacker)
│   ├── migrations/              # 42 D1 SQL migrations (0001–0042)
│   └── wrangler.toml            # Cloudflare bindings, crons, environments
├── .github/workflows/
│   ├── production.yml           # Push-to-main → Pages + Workers deploy + D1 migrations
│   └── staging.yml              # PR preview → staging environment
├── ARCHITECTURE.md              # This file
├── DEPLOYMENT.md                # Production deployment runbook
├── PRODUCTION_SETUP.md          # First-time infrastructure provisioning
└── README.md                    # Quick-start developer guide
```

---

## Core Modules & Data Flow

### The Edge Interception Layer

The outermost ring of the system. These modules intercept, rewrite, and instrument HTTP traffic before it reaches the application logic.

| Module | File | Function |
|---|---|---|
| **GEO Rewriter** | `middleware/geoRewriter.ts` | `HTMLRewriter`-based middleware that injects structured data, FAQ blocks, and entity-salient markup into HTML responses for AI-engine citation readability |
| **RAG Rewriter** | `middleware/ragRewriter.ts` | Dynamically rewrites page content for optimal Retrieval-Augmented Generation extraction |
| **`/llms.txt` Router** | `routes/llms-txt.ts` | Serves a dynamic `/llms.txt` file per domain — the machine-readable sitemap optimized for LLM crawlers |
| **A/B Split Middleware** | `middleware/abSplit.ts` | Cookie-less edge-side A/B testing with Bayesian significance calculation |
| **Input Sanitizer** | `middleware/sanitizer.ts` | Request-body sanitization for XSS and injection prevention |
| **API Auth** | `middleware/apiAuth.ts` | API key authentication for the external developer REST API (`/api/v1/*`) |
| **Domain Auth** | `middleware/domainAuth.ts` | Per-request domain scoping — extracts and validates `domain_id` from JWT claims |

### The Brain & Memory

The cognitive core. A five-layer memory system feeds the AI Manager on every conversation turn.

```
┌─────────────────────────────────────────────────────────┐
│                   AI Manager (aiManager.ts)              │
│                                                         │
│  System Prompt = f(                                     │
│    Layer 1: Brand Context      (D1 → Brand_Context)     │
│    Layer 2: Chat History       (D1 → Chat_History)      │
│    Layer 3: User Memories      (D1 → User_Memories)     │
│    Layer 4: Strategic Lessons  (Vectorize RAG)          │
│    Layer 5: Global Hive Mind   (KV → governance-gated)  │
│  )                                                      │
└─────────────────────────────────────────────────────────┘
```

| Component | File | Function |
|---|---|---|
| **AI Manager Engine** | `utils/aiManager.ts` | Conversational state machine using Perplexity Sonar Pro. Parses `<<ACTION>>` blocks for tool calls (site analysis, competitor discovery, roadmap proposals, brand context updates). Five memory layers injected into each system prompt. |
| **Manager Router** | `routes/manager.ts` | HTTP endpoint for chat. Receives message history, delegates to `handleManagerChat()`, streams response. |
| **Persistent Chat History** | D1: `Chat_History` | Rolling transcript of the last N messages per domain. Persisted on every turn. |
| **Long-Term Memories** | D1: `User_Memories` | Compressed facts extracted from conversations ("prefers bullet points", "target audience is millennials"). |
| **Memory Compressor** | `cron/memoryCompressor.ts` | Daily cron that compresses verbose chat history into atomic facts in `User_Memories`. |
| **Strategic Lessons** | Vectorize: `swarme-semantic-memory` | 768-dim vectors of outcome-graded lessons. Retrieved via cosine similarity at query time. |
| **Outcome Evaluator** | `cron/outcomeEvaluator.ts` | Weekly cron that grades past agent actions against real GA4/GSC analytics. Produces lessons with signed outcome scores. |
| **Idempotency Guard** | `utils/idempotency.ts` | Prevents duplicate cron execution via `Idempotency_Keys` table with window-based deduplication. |

### Off-Domain Syndication

The platform's reach extends beyond the client's website. These modules distribute content and collect signals from third-party platforms.

| Module | File | Function |
|---|---|---|
| **Social Draft Queue** | `utils/social.ts` | Generates social media drafts. Drafts are saved to D1 and surfaced for human approval — **never posted autonomously**. |
| **Barnacle SEO** | `utils/barnacle.ts` | Algorithmic review dispersal across high-DA platforms (Google Business, Yelp, Trustpilot). |
| **UGC Campaign Ledger** | D1: `UGC_Campaigns` | Tracks user-generated content campaigns, submission rates, and ROI attribution. |
| **Pinterest OAuth** | `routes/integrations/pinterest.ts` | Full OAuth 2.0 flow for Pinterest pin syndication. |
| **Reddit OAuth** | `routes/integrations/reddit.ts` | OAuth for Reddit content distribution and comment monitoring. |
| **GSC Integration** | `routes/integrations/gsc.ts` | Google Search Console OAuth — imports keyword rankings, impressions, CTR data. |
| **GA4 Integration** | `routes/integrations/ga4.ts` | Google Analytics 4 — imports sessions, engagement, conversion data for CRO telemetry. |
| **Dual-Engine Comms** | `utils/notifications.ts` | SMS (Twilio) + Email (Resend) notification dispatch with template rendering. |
| **Digital PR & Outreach** | `utils/outreach.ts` | Email-based outreach campaigns with Hunter.io enrichment and tracking. |

### The Financial Ledger

An ACID-compliant internal credit system that meters all AI operations and maps to Stripe billing.

| Module | File | Function |
|---|---|---|
| **Swarme Credits Wallet** | `utils/wallet.ts` | Internal ledger with debit/credit operations. All AI API calls debit credits before execution. Insufficient balance blocks the operation (not post-hoc). |
| **Stripe Integration** | `utils/stripe.ts` | Checkout Session creation, webhook processing, subscription lifecycle (create, upgrade, cancel, churn prediction). |
| **Billing Router** | `routes/billing.ts` | REST endpoints for subscription management, plan comparison, usage reporting. |
| **Wallet Recharge** | `routes/billing/recharge.ts` | One-time credit top-ups via Stripe Checkout. |
| **Churn Prediction** | `routes/billing/churn.ts` | Engagement-based churn risk scoring and automated retention triggers. |
| **Media Wallet** | D1: `Media_Wallet` | Separate credit pool for media generation (images, videos) with per-operation costing. |

### Autonomous Cron Orchestration

Nine production cron triggers run on a fixed schedule. All are idempotent and respect the `Idempotency_Keys` table.

| Schedule (UTC) | Handler | Purpose |
|---|---|---|
| `0 * * * *` | Hourly dispatcher | Swarm visibility checks, task orchestration |
| `*/15 * * * *` | `dataSynthesizer.ts` | Trend velocity polling and alert generation |
| `0 6 * * *` | Full audit | Daily AI visibility audit across all engines |
| `0 14 * * *` | `retention.ts` | Retention engine — engagement scoring, re-engagement emails |
| `0 0 * * *` | `memoryCompressor.ts` | Daily memory compression — chat history to atomic facts |
| `0 0 * * 7` | Content decay scan | Weekly content freshness audit, decay alerts |
| `0 1 * * 7` | `outcomeEvaluator.ts` | Weekly outcome grading — lessons from real analytics data |
| `30 0 1 * *` | `logArchiver.ts` | Monthly cold storage — archives 90-day-old records to R2 |
| `0 2 */2 * *` | `globalConsensus.ts` | 48-hour global consensus — clusters + promotes cross-tenant rules |

### Resilience & Observability

| Module | File | Function |
|---|---|---|
| **Circuit Breaker** | `utils/circuitBreaker.ts` | Per-service circuit breaker with half-open recovery. Protects against cascading API failures. |
| **Throttle Controller** | `utils/throttle.ts` | Rate-limiting wrapper for all external API calls. KV-backed token bucket. |
| **Execution Cap (Failsafe)** | `utils/executionCap.ts` | Global kill switch — blocks all autonomous operations when triggered. Superadmin-only reset. |
| **Dead Letter Queue** | `cron/deadLetter.ts` | Sweeps failed tasks and retries with exponential backoff. |
| **Link Rot Scanner** | `cron/linkRot.ts` | Detects broken internal/external links across managed domains. |
| **SIEM Webhooks** | `routes/settings/audit.ts` | HMAC-SHA256-signed webhook dispatch to external SIEM endpoints. |
| **Logpush Setup** | `utils/logpushSetup.ts` | Configures Cloudflare Logpush for HTTP Request Logs and Workers Trace Events. |
| **Chaos Engineering** | `tests/chaos/` | `apiFuzzer.ts` (endpoint fuzzing) and `llmAttacker.ts` (prompt injection testing). |

---

## The Global Hive Mind & Governance

The Hive Mind is Swarme's federated learning system. It enables cross-tenant network effects where anonymized strategic insights from one domain can benefit the entire network — but only with explicit human consent.

### Pipeline Overview

```
Tenant Domain                    Global Brain                    Tenant Domain
─────────────                    ────────────                    ─────────────
                                                                
outcomeEvaluator.ts              globalConsensus.ts              aiManager.ts
   │                                │                               ▲
   │ 1. Grade action outcomes       │ 4. Cluster by cosine          │ 7. Inject only
   │    against GA4/GSC data        │    distance (< 0.15)          │    APPROVED rules
   ▼                                │                               │    into system prompt
anonymizer.ts                    5. Check ≥10 unique              governance.ts
   │                                │    domain hashes              │ 
   │ 2. Two-stage sanitization      │                               │ 6. Admin reviews in
   │    (regex + LLM)               │ 5. LLM synthesize             │    NetworkAlert.tsx
   ▼                                │    20-word rule                │    and clicks
Unverified_Insights (D1)            ▼                               │    [Approve] or
   │                          Verified_Global_Rules (D1)            │    [Dismiss]
   │ 3. Embed via Vectorize        │                               │
   │    (768-dim BGE-base)         │ Push to HIVE_MIND KV          │
   └───────────────────────────────┘                               │
                                                                    │
                                Global_Rule_Approvals (D1) ────────┘
                                   rule_id + domain_id → status
                                   (pending | approved | rejected)
```

### Stage 1 — Insight Contribution (per-tenant)

When the weekly `outcomeEvaluator` grades an action and extracts a lesson:
1. The raw lesson passes through `anonymizer.ts` — a two-stage pipeline (deterministic regex redaction + LLM deep sanitization) that strips all brand names, URLs, pricing, and PII.
2. The `source_domain_hash` (SHA-256 of `domain_id` with salt) is attached for anonymous domain counting.
3. The sanitized insight is inserted into the `Unverified_Insights` D1 table with no traceable link to the originating tenant.

### Stage 2 — Consensus Clustering (global, 48-hour cron)

The `globalConsensus.ts` cron runs every 48 hours:
1. **Embed:** Un-embedded insights are vectorized via Cloudflare Vectorize (BGE-base-en-v1.5, 768 dimensions).
2. **Cluster:** Greedy agglomerative clustering using explicit cosine distance calculation. Two vectors with distance < 0.15 (similarity > 0.85) are grouped.
3. **Domain threshold:** A cluster must contain insights from **10+ unique domains** (`source_domain_hash`) to qualify as consensus.
4. **Synthesize:** The cluster is fed to Perplexity Sonar with a strict prompt that produces a single imperative rule of 20 words or fewer.
5. **Promote:** The rule is inserted into `Verified_Global_Rules` with a confidence score (60–100) and supporting count.
6. **KV sync:** Active rules are written to the `HIVE_MIND` KV namespace with a 72-hour TTL for sub-millisecond edge reads.
7. **Seed approvals:** A `pending` row is created in `Global_Rule_Approvals` for every active domain.

### Stage 3 — Governance Gate (CRITICAL)

**Global rules are NOT autonomously applied.** This is the critical governance boundary:

1. When a new rule hits KV, the `NetworkAlert.tsx` component on the admin dashboard renders a high-visibility action card.
2. The card displays: the rule text, confidence score, number of supporting domains, and the category.
3. The domain admin must explicitly choose:
   - **"Approve & Add to Brand Guidelines"** → sets `Global_Rule_Approvals.status = 'approved'`
   - **"Dismiss (Not a fit for our brand)"** → sets `Global_Rule_Approvals.status = 'rejected'`
4. The AI Manager's `fetchApprovedGlobalRules()` function queries the approval ledger before injecting any rule into the system prompt. Only rules with `status = 'approved'` for the specific `domain_id` are included.
5. If no approval rows exist for a domain, zero global rules are injected — the system defaults to **closed**, not open.

### KV Key Structure

```
hive:rules:active        → JSON array of all active verified rules
hive:rules:{category}    → JSON array filtered by category
hive:rules:meta          → { last_synced, total_rules, categories, version }
hive:rules:version       → Monotonically increasing version ID
```

All keys expire after 72 hours. If the consensus engine fails to run, stale rules silently expire rather than serving outdated data.

---

## Authentication & Multi-Tenancy

| Layer | Mechanism | File |
|---|---|---|
| **User authentication** | JWT (HS256) issued at login/signup | `auth.ts` |
| **Route protection** | `protectRoute()` Hono middleware — validates JWT, extracts `userId`, `domainId` | `auth.ts` |
| **Superadmin guard** | `requireSuperadmin()` middleware — checks `user.role === "superadmin"` | `auth.ts` |
| **Domain scoping** | Every protected query includes `domain_id` in the WHERE clause | Convention |
| **API key auth** | Bearer token for `/api/v1/*` external developer API | `middleware/apiAuth.ts` |
| **Turnstile CAPTCHA** | Cloudflare Turnstile challenge on signup/login | `utils/turnstile.ts` |

**Multi-tenancy rule:** The AI must NEVER query tenant tables using only `user_id`. It must always include `domain_id` to ensure strict data compartmentalization.

---

## CI/CD Pipeline

Push to `main` triggers `.github/workflows/production.yml`:

```
main push
  │
  ├─ Job 1: Dashboard
  │    ├─ npm ci
  │    ├─ tsc --noEmit (type check)
  │    ├─ npm run build (Vite)
  │    └─ wrangler pages deploy dist/public
  │
  └─ Job 2: Workers (depends on Job 1)
       ├─ npm ci (workers/)
       ├─ tsc --noEmit (continue-on-error)
       ├─ D1 migrations (all .sql files, idempotent)
       ├─ wrangler deploy --env production
       └─ Smoke test (curl https://api.swarme.io/api/public/config)
```

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` — Workers + D1 + KV + Pages + R2 permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account identifier

---

## D1 Migration Inventory

42 migrations from `0001_init.sql` through `0042_global_governance.sql`:

| Range | Domain |
|---|---|
| 0001–0004 | Core schema: projects, tasks, visibility logs, content assets, workspaces, billing |
| 0005–0009 | Site audits, attributed revenue, page telemetry, social drafts, content decay |
| 0010–0012 | Authentication: users, notification preferences, RBAC superadmin |
| 0013–0016 | AI manager context, retention engine, legal consent, CMS control |
| 0017–0020 | Subscription tiers, Stripe user link, GSC integration, A/B tests |
| 0021–0024 | Action history, outreach campaigns, internal links, GA4 integration |
| 0025–0028 | Business model, digest preferences, competitor/north star, API keys |
| 0029–0032 | Multi-domain, UGC campaigns, media wallet, credit system refactor |
| 0033–0036 | Proprietary reports, chaos logs, domain members, agent failsafe |
| 0037–0039 | Chat memory, idempotency keys, strategic lessons |
| 0040 | Audit webhooks + archive manifests |
| 0041 | Global Brain: Unverified_Insights + Verified_Global_Rules |
| 0042 | Global Governance: Global_Rule_Approvals + source_domain_hash |
