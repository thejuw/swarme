# Swarme — Production Setup Guide

> Personalized for your current setup. Follow each step in order.

---

## Prerequisites Checklist

- [x] Cloudflare account (have it)
- [x] Stripe account with API keys (have it)
- [x] Perplexity API key (have it)
- [ ] Wrangler CLI installed and authenticated
- [ ] Domain added to Cloudflare
- [ ] Cloudflare resources provisioned
- [ ] Secrets configured
- [ ] First deploy

---

## Step 1: Install Wrangler CLI & Authenticate

Open your terminal (on your local machine, not here) and run:

```bash
# Install Wrangler globally
npm install -g wrangler

# Verify installation
wrangler --version

# Log in to your Cloudflare account (opens browser)
wrangler login
```

This opens a browser tab where you authorize Wrangler to access your Cloudflare account. Once you see "Successfully logged in", you're good.

**Verify it worked:**

```bash
wrangler whoami
```

You should see your account name and account ID. **Copy the Account ID** — you'll need it shortly.

---

## Step 2: Move Your Domain to Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **"Add a site"** → enter your domain (e.g. `swarme.io`)
3. Choose the **Free** plan (sufficient for DNS; Workers billing is separate)
4. Cloudflare will scan existing DNS records — review and confirm them
5. Cloudflare gives you **two nameservers** (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
6. Go to your **domain registrar** (wherever you bought the domain) → find DNS/Nameserver settings → **replace** the current nameservers with Cloudflare's two
7. Back in Cloudflare, click "Check nameservers" — propagation takes 5 minutes to 24 hours (usually under 1 hour)

**While nameservers propagate, continue to Step 3.** You don't need the domain live to provision resources.

---

## Step 3: Clone the Repo & Provision Cloudflare Resources

On your local machine:

```bash
# Clone the repo
git clone https://github.com/thejuw/swarme.git
cd swarme
```

Now run the provisioning commands. **After each command, Wrangler prints an ID — save every one of them.**

### 3a. Create the Production D1 Database

```bash
cd workers
npx wrangler d1 create edge-swarm-db
```

Output will look like:

```
✅ Successfully created DB 'edge-swarm-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Save this `database_id`.**

### 3b. Create the Staging D1 Database

```bash
npx wrangler d1 create edge-swarm-db-staging
```

**Save this `database_id` too.**

### 3c. Create the Production KV Namespace

```bash
npx wrangler kv namespace create CONFIG_KV
```

Output:

```
✅ Successfully created KV namespace "CONFIG_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Save this `id`.**

### 3d. Create the Staging KV Namespace

```bash
npx wrangler kv namespace create CONFIG_KV_STAGING
```

**Save this `id`.**

### 3e. Create the R2 Bucket

```bash
npx wrangler r2 bucket create swarme-media
```

### 3f. Create the Vectorize Index

```bash
npx wrangler vectorize create swarme-semantic-memory \
  --dimensions=768 \
  --metric=cosine
```

---

## Step 4: Update wrangler.toml with Real IDs

Open `workers/wrangler.toml` and replace ALL placeholders with the IDs you saved.

There are **6 placeholders** to replace:

```toml
# Line 109 — Default/local D1 (use production ID)
database_id = "<INSERT_PRODUCTION_D1_ID>"
# → Replace with your production D1 database_id

# Line 114 — Default/local KV (use production ID)
id = "<INSERT_PRODUCTION_KV_ID>"
# → Replace with your production KV namespace id

# Line 155 — Staging D1
database_id = "<INSERT_STAGING_D1_ID>"
# → Replace with your staging D1 database_id

# Line 160 — Staging KV
id = "<INSERT_STAGING_KV_ID>"
# → Replace with your staging KV namespace id

# Line 201 — Production D1
database_id = "<INSERT_PRODUCTION_D1_ID>"
# → Replace with your production D1 database_id

# Line 206 — Production KV
id = "<INSERT_PRODUCTION_KV_ID>"
# → Replace with your production KV namespace id
```

Also uncomment and fill in your account ID (line 28):

```toml
account_id = "<YOUR_ACCOUNT_ID>"
```

And once your domain is active on Cloudflare, uncomment the route (line 189):

```toml
route = { pattern = "api.swarme.io/*", zone_name = "swarme.io" }
```

(Replace `swarme.io` with your actual domain if different.)

---

## Step 5: Apply All 36 D1 Migrations

Still in the `workers/` directory:

```bash
# Apply migrations to production D1
for f in migrations/*.sql; do
  echo "Applying $f..."
  npx wrangler d1 execute edge-swarm-db --remote --file="$f"
done

# Apply migrations to staging D1
for f in migrations/*.sql; do
  echo "Applying $f to staging..."
  npx wrangler d1 execute edge-swarm-db-staging --remote --file="$f"
done
```

**Verify tables were created:**

```bash
npx wrangler d1 execute edge-swarm-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see 30+ tables including `users`, `domains`, `agent_tasks`, `content_drafts`, `swarme_credits`, etc.

---

## Step 6: Set Secrets

Each command prompts you to paste the value interactively (it's never shown or logged).

### Production Secrets (required)

```bash
# Authentication — generate a random 32+ char string
# Example: openssl rand -hex 32
npx wrangler secret put JWT_SECRET --env production

# Perplexity — your Sonar API key (pplx-...)
npx wrangler secret put PERPLEXITY_API_KEY --env production

# Stripe — from Stripe Dashboard → Developers → API Keys
npx wrangler secret put STRIPE_SECRET_KEY --env production

# Stripe — from Stripe Dashboard → Webhooks → Signing secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production

# Resend — sign up at resend.com, get API key (re_...)
# You can do this later, but magic-link login won't work without it
npx wrangler secret put RESEND_API_KEY --env production
```

### Staging Secrets (same keys, can use test-mode Stripe keys)

```bash
npx wrangler secret put JWT_SECRET --env staging
npx wrangler secret put PERPLEXITY_API_KEY --env staging
npx wrangler secret put STRIPE_SECRET_KEY --env staging
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
npx wrangler secret put RESEND_API_KEY --env staging
```

**Tip:** For `JWT_SECRET`, generate it like this:

```bash
openssl rand -hex 32
# Outputs something like: a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
# Paste that when prompted
```

---

## Step 7: First Deploy

```bash
# From the workers/ directory
npx wrangler deploy --env production
```

On success:

```
Published swarme-api (x.xx sec)
  https://swarme-api.<your-subdomain>.workers.dev
```

**Smoke test:**

```bash
curl https://swarme-api.<your-subdomain>.workers.dev/api/public/config
```

Should return a JSON response (not a 500 error).

---

## Step 8: Configure Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Endpoint URL: `https://api.swarme.io/api/stripe/webhook`
   (or `https://swarme-api.<subdomain>.workers.dev/api/stripe/webhook` if domain isn't ready)
4. Select these events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (`whsec_...`) — this is your `STRIPE_WEBHOOK_SECRET`
   (if you haven't set it yet, run the wrangler secret put command from Step 6)

---

## Step 9: Set Up GitHub Actions CI/CD

In your GitHub repo ([github.com/thejuw/swarme](https://github.com/thejuw/swarme)):

1. Go to **Settings → Secrets and variables → Actions**
2. Add these **Repository secrets**:

| Secret Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Create at Cloudflare Dashboard → My Profile → API Tokens → "Create Token" → use "Edit Cloudflare Workers" template, add D1/KV/R2 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from `wrangler whoami` |

After this, every push to `main` automatically:
- Type-checks the dashboard and workers
- Applies any new D1 migrations
- Deploys the Worker to production

---

## Step 10: Custom Domain Route (after nameservers propagate)

Once Cloudflare shows your domain as **"Active"**:

1. In Cloudflare Dashboard → your domain → DNS → Add record:
   - Type: `AAAA`
   - Name: `api`
   - Content: `100::`
   - Proxy status: **Proxied** (orange cloud)

2. Make sure `wrangler.toml` line 189 is uncommented:
   ```toml
   route = { pattern = "api.swarme.io/*", zone_name = "swarme.io" }
   ```

3. Redeploy:
   ```bash
   npx wrangler deploy --env production
   ```

4. Verify:
   ```bash
   curl https://api.swarme.io/api/public/config
   ```

---

## Resend Setup (for email — do this when ready)

1. Go to [resend.com](https://resend.com) → sign up
2. Add your domain → verify DNS records (Cloudflare makes this easy)
3. Go to API Keys → create one → copy it
4. Set it: `npx wrangler secret put RESEND_API_KEY --env production`

Without Resend, the app works fine — you just won't have magic-link login or email notifications. Users can still log in with email/password.

---

## Quick Reference — All Commands in Order

```bash
# 1. Install & auth
npm install -g wrangler
wrangler login

# 2. Clone & enter
git clone https://github.com/thejuw/swarme.git
cd swarme/workers

# 3. Provision (save ALL IDs printed)
npx wrangler d1 create edge-swarm-db
npx wrangler d1 create edge-swarm-db-staging
npx wrangler kv namespace create CONFIG_KV
npx wrangler kv namespace create CONFIG_KV_STAGING
npx wrangler r2 bucket create swarme-media
npx wrangler vectorize create swarme-semantic-memory --dimensions=768 --metric=cosine

# 4. Edit wrangler.toml — paste all 6 IDs + account_id

# 5. Migrations
for f in migrations/*.sql; do npx wrangler d1 execute edge-swarm-db --remote --file="$f"; done

# 6. Secrets
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put PERPLEXITY_API_KEY --env production
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production

# 7. Deploy
npx wrangler deploy --env production

# 8. Smoke test
curl https://swarme-api.<your-subdomain>.workers.dev/api/public/config
```

---

*Generated: March 2026. Covers Phases 1–60.*
