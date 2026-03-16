# Swarme — Deployment Guide (V1 Release Candidate)

Production deployment for the Swarme edge-native SEO swarm platform.

**Architecture:**
- **Backend:** Cloudflare Workers (Hono.js) + D1 + KV + Durable Objects
- **Frontend:** Next.js dashboard deployed on Vercel
- **Edge AI:** Cloudflare Workers AI + Vectorize

---

## Prerequisites

```bash
# Install Wrangler CLI (if not already installed)
npm install -g wrangler

# Authenticate with your Cloudflare account
wrangler login
```

Ensure you have:
- A Cloudflare account with Workers Paid plan (required for Durable Objects)
- A Vercel account for frontend deployment
- API keys for OpenAI and Perplexity

---

## Step 1: Create the KV Namespace

```bash
cd workers

npx wrangler kv namespace create CONFIG_KV
```

This outputs a namespace ID. Copy it and replace the placeholder in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "<paste the ID here>"
```

> **Optional** — Create a preview namespace for staging:
> ```bash
> npx wrangler kv namespace create CONFIG_KV --preview
> ```

---

## Step 2: Create the D1 Database

```bash
npx wrangler d1 create edge-swarm-db
```

This outputs a database ID. Copy it and replace the placeholder in `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "edge-swarm-db"
database_id = "<paste the ID here>"
```

---

## Step 3: Apply D1 Migrations

Run both migration files against the remote D1 database in order:

```bash
# Phase 2 schema: Projects, Project_Keywords, Agent_Tasks, Visibility_Logs + seed data
npx wrangler d1 execute edge-swarm-db --remote --file=migrations/0001_init.sql

# Phase 4 schema: Content_Assets table + Agent_Tasks CHECK constraint update
npx wrangler d1 execute edge-swarm-db --remote --file=migrations/0002_content_assets.sql
```

Verify the tables were created:

```bash
npx wrangler d1 execute edge-swarm-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected output: `Projects`, `Project_Keywords`, `Agent_Tasks`, `Visibility_Logs`, `Content_Assets`.

---

## Step 4: Create the Vectorize Index

```bash
npx wrangler vectorize create swarme-semantic-memory \
  --dimensions=768 \
  --metric=cosine
```

This provisions the semantic memory index used for brand guidelines and internal link graph embeddings.

---

## Step 5: Set Secrets

Store API keys securely in Cloudflare's encrypted vault. Each command prompts for the value interactively — your keys are never written to disk or version control.

```bash
# Required — Core pipeline
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PERPLEXITY_API_KEY

# Optional — Future phases (add when ready)
# npx wrangler secret put ANTHROPIC_API_KEY
# npx wrangler secret put HUNTER_API_KEY
# npx wrangler secret put RESEND_API_KEY
# npx wrangler secret put POSTHOG_API_KEY
```

---

## Step 6: Deploy the Worker

```bash
npx wrangler deploy
```

On success, Wrangler prints the live Worker URL:

```
Published swarme-api (x.xx sec)
  https://swarme-api.<your-subdomain>.workers.dev
```

Save this URL — you will need it for the frontend configuration.

### Verify the deployment

```bash
# Health check — should return project list from D1
curl https://swarme-api.<your-subdomain>.workers.dev/api/projects

# Trigger a test workflow
curl -X POST https://swarme-api.<your-subdomain>.workers.dev/api/projects/<project_id>/trigger-workflow \
  -H "Content-Type: application/json" \
  -d '{"keyword": "edge computing saas", "initiator": "manual"}'
```

---

## Step 7: (Optional) Custom Domain

To route the Worker to `api.swarme.io`:

1. Add a DNS record in Cloudflare pointing `api.swarme.io` to your Worker
2. Uncomment and update the route in `wrangler.toml`:

```toml
route = { pattern = "api.swarme.io/*", zone_name = "swarme.io" }
```

3. Redeploy: `npx wrangler deploy`

---

## Step 8: Deploy the Frontend to Vercel

### 8a. Environment Variables

In the Vercel project settings, set the following environment variable:

| Variable               | Value                                                  |
|------------------------|--------------------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | `https://swarme-api.<your-subdomain>.workers.dev`      |

If using a custom domain, use `https://api.swarme.io` instead.

### 8b. Deploy

From the project root (not the `workers/` directory):

```bash
# Install Vercel CLI if needed
npm install -g vercel

# Deploy
vercel --prod
```

Or connect the repository to Vercel for automatic deployments on push.

### 8c. Verify

1. Open the Vercel deployment URL
2. Confirm the dashboard loads with live data from the Worker
3. Verify the Agent Activity Log shows real-time polling
4. Test the Copilot/Autopilot toggle and Approval Sheet

---

## Post-Deployment Checklist

- [ ] `wrangler.toml` has real KV namespace ID (not placeholder)
- [ ] `wrangler.toml` has real D1 database ID (not placeholder)
- [ ] D1 migrations `0001_init.sql` and `0002_content_assets.sql` applied
- [ ] Vectorize index `swarme-semantic-memory` created
- [ ] `OPENAI_API_KEY` secret set via Wrangler
- [ ] `PERPLEXITY_API_KEY` secret set via Wrangler
- [ ] Worker deployed and responding at `/api/projects`
- [ ] Cron triggers active (hourly, daily, every 15 min)
- [ ] Frontend deployed to Vercel with `NEXT_PUBLIC_API_URL` set
- [ ] Dashboard loads live data from the deployed Worker
- [ ] Copilot Approval Sheet opens on "Awaiting Approval" tasks
- [ ] Autopilot toggle shows confirmation dialog before engaging

---

## Troubleshooting

### "D1_ERROR: no such table"
Migrations were not applied. Re-run Step 3.

### "NetworkError" in dashboard
`NEXT_PUBLIC_API_URL` is not set or points to the wrong Worker URL. Check Vercel env vars.

### "Secrets not found" in Worker logs
Run `npx wrangler secret list` to verify secrets are set. Re-run Step 5 if missing.

### Durable Object errors
Ensure `[[migrations]]` tag matches and the Worker was deployed at least once after adding the DO config. The first deploy registers the DO class.

### CORS errors
The Worker's Hono CORS middleware allows `*` by default. For production, restrict `origin` in `src/index.ts` to your Vercel domain.

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                  │
│  Next.js Dashboard  ←→  NEXT_PUBLIC_API_URL          │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────┐
│              Cloudflare Workers (Backend)             │
│                                                      │
│  Hono.js API ─── D1 (relational)                     │
│       │                                              │
│       ├──── KV (config cache, vault)                 │
│       │                                              │
│       ├──── Durable Objects (AgentWorkflowManager)   │
│       │         └── Research → Draft → Audit         │
│       │              → Approve/Publish               │
│       │                                              │
│       ├──── Workers AI (LLM + embeddings)            │
│       │                                              │
│       ├──── Vectorize (semantic memory)              │
│       │                                              │
│       └──── Cron Triggers (scheduled orchestration)  │
│                                                      │
│  External APIs:                                      │
│    Perplexity Sonar (research)                       │
│    OpenAI GPT-4o (drafting)                          │
│    CMS Webhook (publishing)                          │
└──────────────────────────────────────────────────────┘
```
