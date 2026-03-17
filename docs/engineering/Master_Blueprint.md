# Swarme — Master Architectural Blueprint

> Engineering reference document. Revision: March 2026.

---

## 1. System Overview

Swarme is a multi-tenant, edge-native SEO automation platform. Twelve specialized AI agents operate on Cloudflare's global network, executing audits, content optimizations, link monitoring, and conversion experiments without requiring a centralized origin server.

### Design Principles

| Principle | Implementation |
|---|---|
| **Edge-first** | Every agent runs on Cloudflare Workers. Cold starts < 5 ms. |
| **Human-in-the-loop** | No agent publishes, modifies, or deletes content autonomously. All mutations are saved as drafts requiring explicit operator approval. |
| **Tenant isolation** | All D1 queries are scoped by `domain_id`. Cross-tenant reads are architecturally impossible at the query layer. |
| **Fail-safe by default** | Doomsday Protocol provides three escalation tiers — agent pause, full swarm halt, and credential revocation — triggered from the admin panel only. |

### High-Level Topology

```
┌───────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE GLOBAL EDGE                     │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │  Workers   │  │  Durable   │  │    Supporting Services  │  │
│  │  (Agents)  │──│  Objects   │──│  D1 · KV · Vectorize   │  │
│  │  12 specs  │  │  (Orch.)   │  │  R2 · Queues · AI Gtwy │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
│         │                │                    │               │
│         ▼                ▼                    ▼               │
│  ┌──────────────────────────────────────────────────┐        │
│  │           API Gateway / Hono Router               │        │
│  └──────────────────────────────────────────────────┘        │
└──────────────────────┬────────────────────────────────────────┘
                       │ HTTPS / WebSocket
          ┌────────────┴──────────────┐
          │     Client Application     │
          │  Vite + React + wouter     │
          │  Tailwind + shadcn/ui      │
          └────────────────────────────┘
```

---

## 2. Edge Layer — Cloudflare Workers

### 2.1 Agent Registry

| # | Agent | Worker | Responsibility |
|---|---|---|---|
| 1 | Crawler Agent | `swarme-crawler` | Full-site crawl, sitemap parsing, robots.txt compliance |
| 2 | Audit Agent | `swarme-audit` | Technical SEO scoring (Core Web Vitals, schema, meta, canonical) |
| 3 | Content Agent | `swarme-content` | Draft generation, keyword targeting, content refresh candidates |
| 4 | Link Monitor | `swarme-links` | Backlink discovery, toxic link detection, internal link graph |
| 5 | CRO Agent | `swarme-cro` | Conversion rate telemetry, funnel bottleneck identification |
| 6 | Social Agent | `swarme-social` | Draft social posts for human review. Never posts autonomously. |
| 7 | Trend Radar | `swarme-trends` | Real-time keyword trend detection, SERP volatility alerts |
| 8 | Decay Manager | `swarme-decay` | Content freshness scoring, decay alerts, refresh queue |
| 9 | Digital PR | `swarme-pr` | Outreach draft generation, journalist database, pitch scoring |
| 10 | Off-Domain | `swarme-offdom` | Third-party profile audits, citation consistency |
| 11 | A/B Test Agent | `swarme-ab` | Experiment orchestration, statistical significance calculation |
| 12 | GEO Agent | `swarme-geo` | Generative Engine Optimization, llms.txt protocol, RAG-bait |

### 2.2 Worker Configuration

- **Runtime:** Cloudflare Workers (V8 isolates)
- **Max execution time:** 30 seconds (standard), 15 minutes (Cron Triggers)
- **Memory:** 128 MB per isolate
- **Bindings:** D1, KV (CONFIG_KV), Durable Objects, Vectorize, Queues, AI Gateway
- **Framework:** Hono (lightweight, edge-native HTTP router)

### 2.3 Durable Objects — Orchestrator

The `SwarmOrchestrator` Durable Object coordinates multi-agent workflows:

```
SwarmOrchestrator
├── scheduleAgent(agentId, taskPayload)
├── getAgentState(agentId) → { status, lastRun, nextRun }
├── pauseAgent(agentId) → sets status = "paused"
├── pauseAll() → Doomsday Protocol Tier 1
├── haltAll() → Doomsday Protocol Tier 2
└── revokeCredentials() → Doomsday Protocol Tier 3
```

- State is stored in Durable Object transactional storage (strongly consistent).
- Each tenant gets a unique Durable Object instance keyed by `domain_id`.
- Agent heartbeats are written every 60 seconds; missed heartbeats trigger alerts.

---

## 3. Data Layer

### 3.1 D1 (Relational)

Primary relational store for all structured data. 37 migrations to date.

**Key tables:**

| Table | Purpose | Isolation Key |
|---|---|---|
| `users` | Account records, roles, plan tier | `id` (global) |
| `domains` | Tenant domains, DNS verification status | `user_id` → `id` |
| `agent_tasks` | Task queue per agent per domain | `domain_id` |
| `content_drafts` | AI-generated drafts awaiting approval | `domain_id` |
| `audit_results` | Technical SEO audit snapshots | `domain_id` |
| `social_drafts` | Social post drafts (never auto-published) | `domain_id` |
| `ab_experiments` | A/B test configurations and results | `domain_id` |
| `credentials_vault` | Encrypted CMS/platform credentials | `domain_id` |
| `swarme_credits` | Credit wallet balances and transactions | `domain_id` |
| `decay_scores` | Content freshness telemetry | `domain_id` |
| `keyword_tracking` | Rank tracking snapshots | `domain_id` |
| `webhook_events` | Inbound/outbound webhook log | `domain_id` |

**Security invariant:** All D1 queries use parameterized inputs. No raw string interpolation. Every query that touches tenant data must include `WHERE domain_id = ?` — never `WHERE user_id = ?` alone.

### 3.2 KV (CONFIG_KV)

Single KV namespace for configuration data:

| Key Pattern | Purpose | TTL |
|---|---|---|
| `settings:global` | Feature flags, maintenance mode | None |
| `settings:domain:{id}` | Per-domain agent configuration | None |
| `rate-limit:{ip}` | IP-based rate limiting counters | 60s |
| `cache:audit:{domain_id}` | Cached audit results | 300s |
| `onboarding:{user_id}` | PLO context-setup state | 24h |

### 3.3 Vectorize (Semantic Memory)

Vector index for semantic search across content and audit history:

- **Dimensions:** 1536 (OpenAI `text-embedding-3-small`)
- **Distance metric:** Cosine similarity
- **Use cases:** Content similarity detection, duplicate content alerts, RAG-bait candidate selection, AI Manager context retrieval
- **Namespace isolation:** Vectors are prefixed with `domain_id` for tenant separation

### 3.4 R2 (Object Storage)

- Audit report PDFs
- Exported CSV/data files
- Media assets for social draft previews
- Backup snapshots

---

## 4. Core Brain — AI Pipeline

### 4.1 AI Manager (Chat Interface)

The AI Manager is the primary operator interface for natural-language control:

```
User Input
    ↓
Intent Classification (Perplexity Sonar)
    ↓
Task Decomposition
    ↓
Agent Dispatch (via Durable Object)
    ↓
Draft Generation
    ↓
Human Approval Gate ← MANDATORY
    ↓
Execution (if approved)
```

- **Model:** Perplexity `sonar` via AI Gateway
- **Context window:** Augmented with Vectorize semantic retrieval (RAG)
- **Guardrails:** No autonomous execution. Every action surfaces as an approval card.
- **Rollback:** 1-click undo on any approved action (stores pre-state snapshots)

### 4.2 Content Pipeline

```
Keyword Research (Trend Radar)
    ↓
Content Gap Analysis (Audit Agent)
    ↓
Draft Generation (Content Agent + Sonar)
    ↓
SEO Scoring (meta, readability, keyword density)
    ↓
Draft Queue (content_drafts table)
    ↓
Human Review & Edit ← MANDATORY
    ↓
CMS Push (via credentials_vault)
```

Content refresh flow follows the same pipeline but is triggered by decay scores exceeding threshold. Refreshed content never overwrites live content without explicit human approval.

### 4.3 GEO Pipeline (Generative Engine Optimization)

```
llms.txt Protocol Compliance Check
    ↓
RAG-Bait Content Generation
    ↓
Citation Anchor Optimization
    ↓
AI Visibility Scoring
    ↓
Monitoring Dashboard (AI Visibility page)
```

---

## 5. Failsafes & Security

### 5.1 Doomsday Protocol (Admin Panel Only)

Three escalation tiers, accessible exclusively from the superadmin panel:

| Tier | Action | Reversible |
|---|---|---|
| **Tier 1: Agent Pause** | Pauses individual agent execution | Yes — resume from admin panel |
| **Tier 2: Full Halt** | Stops all agents across all tenants | Yes — requires admin re-enable |
| **Tier 3: Credential Revoke** | Revokes all stored CMS credentials | Partial — credentials must be re-entered |

### 5.2 Authentication & Authorization

- **Auth flow:** Email/password → JWT (stored in React state, not localStorage)
- **Magic link:** Passwordless login via Resend email
- **Roles:** `user`, `admin`, `superadmin`
- **Impersonation:** Superadmin can impersonate any user (banner displayed, logged)
- **Session:** Token in module-level ref; no cookies, no localStorage, no sessionStorage

### 5.3 Encryption

| Layer | Method |
|---|---|
| Transit | TLS 1.3 (Cloudflare edge termination) |
| At rest (D1) | AES-256 (Cloudflare-managed) |
| Credentials Vault | Envelope encryption in KV with per-tenant keys |

### 5.4 Tenant Isolation

- **Database:** All queries scoped by `domain_id` parameter
- **Durable Objects:** One instance per domain — no shared state
- **Vectorize:** Namespace-prefixed vectors prevent cross-tenant similarity results
- **KV:** Domain-scoped keys with `domain_id` in key pattern
- **API:** Middleware validates `domain_id` ownership before any data access

---

## 6. External Pipelines

### 6.1 CMS Integrations

15+ supported platforms via the Credentials Vault:

| Platform | Method | Capabilities |
|---|---|---|
| WordPress | REST API + Application Passwords | Read/write posts, pages, meta |
| Shopify | Admin API (GraphQL) | Products, collections, blog posts |
| Webflow | CMS API v2 | Collections, items, publish |
| Ghost | Admin API | Posts, pages, tags |
| Contentful | Management API | Entries, assets, content types |
| Strapi | REST/GraphQL | Content types, media |
| Sanity | GROQ + Mutations API | Documents, assets |
| Prismic | Repository API | Custom types, documents |
| Directus | REST API | Collections, items, files |
| Payload | REST API | Collections, globals |
| BigCommerce | REST API | Products, categories, pages |
| Wix | REST API | Posts, pages |
| Squarespace | Commerce/Blog API | Posts, pages, products |
| HubSpot CMS | Content API | Blog posts, landing pages |
| Custom Headless | Swarme REST API | Webhook-based push/pull |

### 6.2 Payment Pipeline

- **Provider:** Stripe
- **Billing model:** Credit-based (Swarme Credits)
- **Webhook:** `STRIPE_WEBHOOK_SECRET` validates inbound events
- **Features:** Auto-recharge thresholds, media wallet, UGC campaign funding
- **Environment:** `STRIPE_SECRET_KEY` in Worker environment bindings

### 6.3 Email Pipeline

- **Provider:** Resend
- **Use cases:** Magic link auth, digest reports, decay alerts, approval notifications
- **Environment:** `RESEND_API_KEY` in Worker environment bindings
- **Rate limits:** Per-domain throttling via CONFIG_KV

### 6.4 Webhook System

- **Inbound:** CMS change events, Stripe payment events, third-party notifications
- **Outbound:** Agent completion events, approval requests, audit complete signals
- **Logging:** All webhook events stored in `webhook_events` table with `domain_id` scope
- **Retry:** Exponential backoff with 3 max retries for outbound failures

---

## 7. Client Application

### 7.1 Stack

| Layer | Technology |
|---|---|
| Build tool | Vite |
| Framework | React 18 (SPA) |
| Router | wouter + `useHashLocation` |
| Styling | Tailwind CSS v3 + shadcn/ui |
| State | TanStack Query v5 (server state), React state (local) |
| Language | TypeScript (strict mode) |
| i18n | react-i18next |

### 7.2 Route Architecture

```
Public (no auth):
  /            Landing page (redirects to /dashboard if authenticated)
  /login       Email/password auth
  /signup      Registration
  /docs        Platform documentation (sidebar nav)
  /docs/:slug  Individual doc pages
  /help        Help center / FAQ
  /about       Company info
  /contact     Support contact
  /security    Security & compliance
  /terms       Terms of service
  /privacy     Privacy policy
  /developers  Developer hub / API docs
  /free-analyzer  Free SEO preview tool
  /scanner/:url?  Live site scanner

Protected (sidebar shell):
  /dashboard        Main dashboard
  /ai-manager       AI chat interface
  /activity         Agent activity log
  /visibility       AI visibility metrics
  /roi              ROI dashboard
  /comms            Communications
  /audit            Technical site audit
  /trends           Trend radar
  /pr               Digital PR
  /cro              CRO telemetry
  /ab-tests         A/B experiment manager
  /social-queue     Social draft queue
  /decay-manager    Content decay monitor
  /off-domain       Off-domain profile audit
  /mission-control  System health overview
  /workers          Edge worker status
  /domains          Domain management
  /wallet           Swarme Credits wallet
  /settings         User/account settings

Superadmin (admin layout):
  /admin             Admin overview
  /admin/users       User management + impersonation
  /admin/vault       Credentials vault audit
  /admin/ecosystem   Platform ecosystem metrics
  /admin/settings    Global feature flags
  /admin/chaos       Doomsday Protocol controls (hidden)

Onboarding (protected, no sidebar):
  /onboarding/context-setup   Brand context wizard
  /onboarding/provisioning    Agent provisioning progress
```

### 7.3 Design System

- **Theme:** Dark-first, GitHub-inspired palette
- **Background:** `#0d1117`
- **Custom colors:** `gh-text`, `gh-muted`, `gh-border`, `gh-surface`, `neon-emerald`, `neon-cyan`, `neon-purple`
- **Typography:** System font stack with monospace accents
- **Prose:** `prose prose-invert` (Tailwind Typography) for documentation pages

---

## 8. Infrastructure Summary

```
┌─────────────────────────────────────────────┐
│              Cloudflare Platform             │
├─────────────────────────────────────────────┤
│  Workers (12 agents + API gateway)          │
│  Durable Objects (SwarmOrchestrator)        │
│  D1 (37 migrations, relational data)        │
│  KV (CONFIG_KV — config, rate limits)       │
│  Vectorize (semantic memory, 1536-dim)      │
│  R2 (object storage, reports, media)        │
│  Queues (async task processing)             │
│  AI Gateway (Perplexity Sonar proxy)        │
├─────────────────────────────────────────────┤
│  External Services                          │
│  ├── Stripe (payments, credit system)       │
│  ├── Resend (transactional email)           │
│  └── 15+ CMS platforms (via cred vault)     │
├─────────────────────────────────────────────┤
│  Client (static SPA, deployed to edge)      │
│  └── Vite + React + Tailwind + shadcn/ui    │
└─────────────────────────────────────────────┘
```

---

## 9. Deployment Pipeline

| Stage | Tooling | Trigger |
|---|---|---|
| Lint + Type Check | ESLint + TypeScript | Pre-commit |
| Unit Tests | Vitest | PR merge |
| Integration Tests | Playwright | PR merge |
| Staging Deploy | Wrangler (staging env) | Merge to `staging` branch |
| Production Deploy | Wrangler (production env) | Merge to `main` branch |
| Rollback | Wrangler rollback + D1 migration revert | Manual trigger |

---

*This document is maintained by the Swarme engineering team and updated with each major phase release.*
