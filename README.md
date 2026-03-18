# Swarme

**Enterprise Generative Engine Optimization (GEO) Platform**

Autonomous AI agents that optimize your website for citation by ChatGPT, Perplexity, Gemini, and Claude. Edge-native, serverless, running entirely on Cloudflare.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![D1](https://img.shields.io/badge/Cloudflare_D1-F38020?logo=cloudflare&logoColor=white)

---

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full system map including the five-layer AI memory system, federated Hive Mind pipeline, and governance model.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | >= 20.x | Runtime for build tooling and local dev |
| **npm** | >= 10.x | Package management |
| **Wrangler CLI** | >= 3.x | Cloudflare Workers deployment and local dev |

**Required accounts:**

- [Cloudflare](https://dash.cloudflare.com/sign-up) — Workers, D1, KV, Vectorize, R2, Pages
- [Perplexity](https://docs.perplexity.ai/) — Sonar API for AI research and content generation
- [Stripe](https://dashboard.stripe.com/) — Billing, subscriptions, credit recharges
- [Resend](https://resend.com/) — Transactional email delivery

**Optional accounts (for full feature set):**

- [Google Cloud Console](https://console.cloud.google.com/) — OAuth for GSC + GA4 integrations
- [Twilio](https://www.twilio.com/) — SMS notifications
- [Hunter.io](https://hunter.io/) — Email enrichment for outreach campaigns
- [PostHog](https://posthog.com/) — Product analytics and CRO telemetry

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/thejuw/swarme.git
cd swarme
npm install
cd workers && npm install && cd ..
```

### 2. Authenticate Wrangler

```bash
npx wrangler login
```

### 3. Provision Cloudflare resources

```bash
# Create D1 database
npx wrangler d1 create edge-swarm-db

# Create KV namespaces
npx wrangler kv namespace create CONFIG_KV
npx wrangler kv namespace create SWARME_HIVE_MIND

# Create R2 bucket
npx wrangler r2 bucket create swarme-media

# Create Vectorize index (768 dimensions for BGE-base-en-v1.5)
npx wrangler vectorize create swarme-semantic-memory \
  --dimensions=768 \
  --metric=cosine
```

Update the binding IDs in `workers/wrangler.toml` with the values returned by each command.

### 4. Apply D1 migrations

```bash
cd workers
for migration in migrations/*.sql; do
  echo "Applying $migration..."
  npx wrangler d1 execute edge-swarm-db --local --file="$migration"
done
```

### 5. Set secrets

```bash
cd workers
npx wrangler secret put JWT_SECRET
npx wrangler secret put PERPLEXITY_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put RESEND_API_KEY
```

### 6. Run locally

```bash
# Terminal 1 — Worker (API)
cd workers
npx wrangler dev --local --persist-to=.wrangler/state

# Terminal 2 — Dashboard (Vite dev server)
npm run dev
```

The dashboard runs on `http://localhost:5000`. The worker runs on `http://localhost:8787`.

---

## Environment Variables

Create `workers/.dev.vars` for local development:

```ini
# ─── Core (Required) ──────────────────────────────────────
PERPLEXITY_API_KEY=pplx-...
JWT_SECRET=your-random-256-bit-secret
ENVIRONMENT=development
SWARM_MODE=copilot

# ─── Stripe Billing ───────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ─── Email & Notifications ────────────────────────────────
RESEND_API_KEY=re_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# ─── Google OAuth (GSC + GA4) ─────────────────────────────
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# ─── Security ─────────────────────────────────────────────
TURNSTILE_SECRET_KEY=...

# ─── Optional AI Providers ────────────────────────────────
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

# ─── Optional Integrations ────────────────────────────────
HUNTER_API_KEY=...
POSTHOG_API_KEY=phc_...
PINTEREST_APP_ID=...
PINTEREST_APP_SECRET=...
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
SHOPIFY_WEBHOOK_SECRET=...

# ─── R2 Public URL ────────────────────────────────────────
R2_PUBLIC_BASE=https://media.swarme.io
```

---

## Deployment

### Production (CI/CD)

Push to `main` triggers the GitHub Actions pipeline (`.github/workflows/production.yml`):

1. **Dashboard** — Type-checks, builds Vite, deploys to Cloudflare Pages
2. **Workers** — Applies all D1 migrations, deploys worker to production

```bash
git push origin main
# CI handles everything — dashboard + worker + migrations
```

**Required GitHub Secrets:**

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with Workers, D1, KV, Pages, R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### Manual deployment

```bash
# Dashboard
npm run build
npx wrangler pages deploy dist/public --project-name=swarme --branch=main

# Worker
cd workers
npx wrangler deploy --env production
```

---

## Project Structure

```
client/src/pages/           → Frontend routes (Vite + wouter hash routing)
workers/src/index.ts        → Hono entry point, route mounting, cron dispatch
workers/src/utils/          → Business logic (AI manager, billing, SEO analysis)
workers/src/cron/           → 13 autonomous cron handlers
workers/src/routes/         → REST API routers
workers/src/middleware/      → Edge middleware (auth, A/B split, GEO rewriting)
workers/migrations/         → 42 D1 SQL migrations
```

Key files:

| File | Purpose |
|---|---|
| `workers/src/utils/aiManager.ts` | AI Manager engine — five-layer memory, tool parsing, Perplexity Sonar |
| `workers/src/cron/globalConsensus.ts` | Hive Mind consensus — vector clustering, LLM synthesis |
| `workers/src/utils/anonymizer.ts` | Two-stage anonymization pipeline (regex + LLM) |
| `workers/src/routes/settings/governance.ts` | Governance API — rule approval/rejection per domain |
| `workers/src/utils/wallet.ts` | Swarme Credits ledger — debit-before-execution model |
| `workers/wrangler.toml` | All Cloudflare bindings, environments, cron schedules |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS v3, shadcn/ui, wouter (hash routing), TanStack Query v5, Recharts |
| **Backend** | Hono.js on Cloudflare Workers |
| **Database** | Cloudflare D1 (SQLite at the edge) |
| **Cache** | Cloudflare KV (sub-millisecond global reads) |
| **Vector Store** | Cloudflare Vectorize (768-dim, BGE-base-en-v1.5) |
| **Object Storage** | Cloudflare R2 (S3-compatible, zero egress) |
| **State Machines** | Cloudflare Durable Objects |
| **AI** | Perplexity Sonar Pro (primary), Cloudflare Workers AI (embeddings) |
| **Billing** | Stripe (subscriptions + one-time charges) |
| **Email** | Resend (transactional), SMTP (outreach) |
| **SMS** | Twilio |
| **CI/CD** | GitHub Actions → Cloudflare Pages + Workers |

---

## License

Proprietary. All rights reserved.
