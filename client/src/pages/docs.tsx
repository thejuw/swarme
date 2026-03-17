/**
 * docs.tsx — Public Platform Documentation page
 *
 * Renders 4 MDX doc files with Tailwind Typography (prose prose-invert),
 * sidebar nav with section links, and scroll-to-section behavior.
 * Route: /docs and /docs/:slug
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";

import { SwarmeLogo } from "@/components/swarme-logo";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/footer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Rocket,
  BrainCircuit,
  Coins,
  Globe,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Inline Markdown Content ─────────────────────────────────
// Content is inlined to avoid MDX compilation at runtime.
// Source files live in client/src/content/docs/*.mdx

const GETTING_STARTED_MD = `# Getting Started with Swarme

Welcome to Swarme — the autonomous growth engineering platform that deploys 12 AI agents on the edge to manage your SEO, content, and digital presence around the clock.

This guide walks you through onboarding, connecting your first domain, and verifying DNS so the swarm can begin operating on your site.

---

## The PLG Onboarding Flow

When you first sign up, Swarme takes you through a three-step guided setup designed to collect the context the swarm needs to operate intelligently on your behalf.

### Step 1: Platform Selection

Choose your CMS or e-commerce platform from the supported list:

- **Shopify** — Full Storefront API integration with automatic product schema injection
- **WooCommerce** — REST API connection with WordPress hooks for on-page optimization
- **BigCommerce** — Catalog API + WebDAV file access for template-level modifications
- **WordPress** — REST API with Yoast/RankMath compatibility layer
- **Custom / Headless** — Generic REST or GraphQL adapter for any CMS with an API

After selecting your platform, enter your **Primary Site URL**. This is the root domain the swarm will audit, monitor, and optimize.

### Step 2: Competitive Landscape

Add up to five competitor URLs. The swarm uses these for:

- **Keyword gap analysis** — identifying ranking opportunities your competitors hold that you don't
- **Content velocity tracking** — monitoring how often competitors publish and update content
- **Backlink delta monitoring** — detecting new referring domains acquired by competitors
- **SERP displacement alerts** — notifying you when a competitor overtakes your position on tracked queries

Competitors are optional during onboarding — you can configure them later from the **Trend Radar** page in the dashboard.

### Step 3: North Star Brand

Enter the URL of a brand or website you aspire to emulate. This doesn't have to be a direct competitor — it can be any site whose content strategy, design quality, or market positioning you admire.

The swarm's **Content Engine** uses this as a stylistic and strategic reference point when generating content drafts, meta descriptions, and social copy.

---

## Adding a Domain

After onboarding, you'll be taken to the dashboard. To add additional domains:

1. Navigate to **Domains** in the sidebar
2. Click **Add Domain**
3. Enter the root domain (e.g., \`yourbrand.com\`) — do not include \`https://\` or trailing paths
4. Select the CMS platform for this domain
5. Click **Verify**

### DNS Verification

Swarme uses DNS TXT record verification to confirm domain ownership. When you add a domain, the system generates a unique verification token:

\`\`\`
TXT Record: _swarme-verify.yourbrand.com
Value:      swarme-site-verification=sk_verify_abc123def456
\`\`\`

**To add this record:**

1. Log in to your domain registrar or DNS provider (Cloudflare, Namecheap, Route 53, GoDaddy, etc.)
2. Navigate to the DNS management panel for your domain
3. Add a new **TXT** record:
   - **Host/Name**: \`_swarme-verify\`
   - **Value**: The verification string shown in the Swarme dashboard
   - **TTL**: 300 (or Auto)
4. Save the record and return to Swarme
5. Click **Check Verification** — DNS propagation typically takes 1-5 minutes

Once verified, the domain moves to **Active** status and all 12 swarm agents begin their initial baseline audit.

### Multi-Domain Architecture

Each domain in Swarme operates in strict isolation:

- Separate D1 database partitions per domain
- Independent agent configurations and task queues
- Domain-scoped brand context and keyword tracking
- Isolated CMS credentials in encrypted KV storage

An agent working on Domain A cannot read, write, or access any data belonging to Domain B. This compartmentalization is enforced at the database query layer — every query requires a \`domain_id\` parameter.

---

## What Happens Next

Once your domain is verified and the swarm is deployed, the following occurs automatically:

1. **Baseline Audit** — The Auditor agent crawls your entire site, analyzing every page's \`<head>\` tags, schema markup, accessibility attributes, Core Web Vitals, and security headers
2. **Content Inventory** — The Content Engine catalogs all existing pages, blog posts, and product listings
3. **Keyword Mapping** — The SERP Analyst agent pulls ranking data and maps your current keyword positions
4. **Competitive Snapshot** — If competitors were provided, the Trend Radar agent captures their current rankings and content footprint
5. **Risk Assessment** — All findings are compiled into a risk score and presented on your dashboard

The initial audit typically completes within 15-30 minutes depending on site size. You'll see real-time progress in the **Agent Activity** feed.

---

## Dashboard Overview

After onboarding, your dashboard displays:

| Widget | Description |
|--------|-------------|
| **Active Agents** | Number of swarm agents currently running tasks |
| **Pages Optimized** | Cumulative count of pages modified by the swarm |
| **Backlinks Acquired** | New referring domains detected since deployment |
| **Avg. SERP Position** | Weighted average across all tracked keywords |
| **Agent Activity** | Live feed of agent actions with timestamps |
| **AI Visibility Score** | Your presence in AI overview panels (Perplexity, ChatGPT, Gemini) |
| **Search Console Performance** | Impressions and clicks from connected GSC property |

---

## Need Help?

- **AI Manager** — Your in-dashboard strategic advisor. Ask questions, approve tasks, and get recommendations in natural language.
- **Help Center** — Visit the Help page for FAQs, support channels, and contact information.
- **Developer API** — Visit the Developers page for REST API documentation and webhook configuration.`;

const AI_MANAGER_MD = `# The AI Manager

The AI Manager is your Chief Strategy Officer inside the Swarme dashboard. It's a conversational interface that sits between you and the 12 autonomous agents, translating their technical outputs into actionable recommendations and giving you a single point of control over the entire swarm.

---

## How It Works

The AI Manager operates as a stateful chat interface backed by a reasoning engine that has full read access to your swarm's telemetry, audit history, content drafts, keyword rankings, and agent task queues.

When you send a message, the AI Manager:

1. **Parses intent** — Determines whether you're asking a question, issuing a command, or requesting a status update
2. **Queries context** — Pulls relevant data from your domain's D1 tables, Vectorize semantic memory, and real-time agent telemetry
3. **Generates response** — Produces a natural language answer with supporting data, charts, or actionable next steps
4. **Queues actions** — If your message implies a task (e.g., "refresh the blog post about edge computing"), it creates a draft task and asks for confirmation before dispatching it to the relevant agent

### Example Interactions

| You Say | The Manager Does |
|---------|-----------------|
| "What's my biggest SEO risk right now?" | Queries the latest audit, surfaces the highest-severity finding, and suggests a fix |
| "Draft a blog post about serverless SEO" | Creates a content brief, generates a draft, and saves it for your review |
| "Why did my traffic drop last Tuesday?" | Cross-references Search Console data with agent activity logs to identify potential causes |
| "Pause all agents for 24 hours" | Confirms the action, then sets the global swarm toggle to paused |
| "Deploy the meta title changes we discussed" | Retrieves the pending draft, shows a diff, and dispatches on approval |

---

## Approving Tasks

The swarm operates on a **draft-first** principle. No agent publishes content, modifies meta tags, or submits sitemaps without explicit human approval. The AI Manager is the primary interface for this approval workflow.

### The Approval Flow

1. An agent generates a recommendation or draft (e.g., new meta description, refreshed blog post, social media caption)
2. The draft appears in the **AI Manager Roadmap** panel with a priority badge (High / Medium / Low)
3. You review the draft — the Manager provides context on why the change was recommended
4. Click **Deploy** to approve, or discuss modifications in chat
5. The Manager dispatches the approved task to the relevant agent for execution

### Bulk Approval

For high-volume changes (e.g., 50 meta descriptions generated after a site audit), the Roadmap panel supports batch operations:

- **Select All** — Approve all pending items at once
- **Filter by Agent** — View only drafts from a specific agent (Writer, Auditor, CRO, etc.)
- **Filter by Priority** — Focus on high-priority items first

---

## The 1-Click Rollback Engine

Every change the swarm makes is versioned. If a deployed change causes unexpected results — a traffic dip, a ranking drop, or simply a copy preference — you can reverse it instantly.

### How Rollback Works

1. Navigate to **Agent Activity** in the sidebar
2. Find the specific deployment entry
3. Click the **Rollback** button
4. The system restores the previous version of the affected content, meta tag, or configuration
5. A confirmation appears in the AI Manager chat

### What Gets Versioned

| Asset Type | Versioning Scope |
|-----------|-----------------|
| Meta tags (title, description, OG) | Full tag-level snapshots before/after |
| Blog posts and page content | Full-text diff with paragraph-level granularity |
| Schema markup (JSON-LD) | Complete structured data block |
| Sitemap modifications | Before/after XML diff |
| Social media drafts | Draft, approved, published state chain |
| CRO experiments | Variant configuration + traffic split percentages |

Rollback history is retained for 90 days on all plans. Enterprise plans include unlimited retention.

### Automated Rollback Triggers

The swarm includes circuit breakers that can trigger automatic rollback when:

- A deployed change causes a greater than 15% drop in page impressions within 48 hours
- Core Web Vitals regress beyond the "Good" threshold
- A Lighthouse audit score drops by more than 10 points
- A crawl error rate exceeds the configured threshold

Automatic rollbacks are logged in Agent Activity and the AI Manager notifies you with a summary of what happened and why.

---

## Roadmap Panel

The right side of the AI Manager screen displays the **Strategic Roadmap** — a prioritized list of recommendations generated by the swarm's analysis engines.

Each roadmap item includes:

- **Title** — Short description of the recommended action
- **Agent** — Which swarm agent generated the recommendation
- **Priority** — High (red), Medium (amber), or Low (default)
- **Impact Estimate** — Projected effect on traffic, rankings, or conversions
- **Status** — Pending, Approved, Deployed, or Rolled Back

You can interact with roadmap items directly from the panel or discuss them in the chat interface.

---

## UGC Campaigns

The AI Manager also manages User-Generated Content campaigns. When the Content Engine identifies an opportunity for customer reviews, testimonials, or social proof:

1. A campaign brief appears in the **UGC Campaigns** tab
2. Review the proposed outreach strategy and messaging
3. **Approve** to activate the campaign or **Dismiss** to skip it
4. Approved campaigns are dispatched to the Social Agent for execution via the Media Wallet

UGC campaigns are never executed without approval. The Social Agent drafts all outreach content and saves it to the database for human review before any external posting or messaging occurs.

---

## Telemetry Panel

The bottom section of the AI Manager displays real-time system telemetry:

- **Agent Health** — Status of each swarm agent (Active, Idle, Error, Paused)
- **Task Queue Depth** — Number of pending tasks across all agents
- **API Rate Limits** — Current consumption against Cloudflare Workers limits
- **Memory Usage** — Vectorize index size and D1 row counts

This panel is primarily useful for debugging and monitoring during high-activity periods.`;

const CREDITS_MD = `# Swarme Credits & The Media Wallet

Swarme operates on a hybrid pricing model: a fixed monthly SaaS subscription for the platform and agents, combined with a prepaid credit system — the **Media Wallet** — that funds variable-cost operations like paid content distribution, UGC campaigns, and third-party API calls.

---

## How Credits Work

Swarme Credits are the internal currency used to fund operations that incur real-world costs on your behalf. One credit equals one U.S. cent ($0.01).

### What Consumes Credits

| Operation | Approximate Cost |
|-----------|-----------------|
| AI content generation (per 1,000 tokens) | 2-5 credits |
| Image generation for social/blog posts | 10-25 credits |
| Paid social media boost (per campaign) | Variable — you set the budget |
| UGC outreach campaign execution | 50-200 credits per campaign |
| Premium backlink verification API calls | 1-3 credits per check |
| Competitor SERP tracking (per keyword/day) | 1 credit |
| Schema validation via third-party API | 1 credit per page |

Credits are only consumed for operations with real external costs. Core platform features — auditing, agent orchestration, dashboard analytics, chat with the AI Manager — are included in your subscription and do not consume credits.

---

## The Media Wallet

The Media Wallet is your prepaid credit balance, visible in the **Wallet** section of the sidebar. It functions like a debit account: credits are deducted as operations execute, and you maintain a balance that the swarm draws from.

### Funding Your Wallet

You can add credits to your wallet in three ways:

1. **Manual Top-Up** — Purchase credit packs from the Wallet page:
   - 5,000 credits ($50)
   - 25,000 credits ($250)
   - 100,000 credits ($1,000)
   - Custom amount

2. **Auto-Recharge** — Set a threshold and recharge amount. When your balance drops below the threshold, credits are automatically purchased using your payment method on file.

3. **Subscription Inclusion** — Higher-tier plans include a monthly credit allocation:
   - **Growth** ($499/mo): 10,000 credits included
   - **Scale** ($999/mo): 50,000 credits included
   - **Enterprise** (Custom): Negotiated credit allocation

### Auto-Recharge Configuration

To configure auto-recharge:

1. Navigate to **Wallet** in the sidebar
2. Toggle **Auto-Recharge** to enabled
3. Set your **Threshold** — the balance level that triggers a recharge (e.g., 1,000 credits)
4. Set your **Recharge Amount** — how many credits to purchase when triggered (e.g., 10,000 credits)
5. Confirm your payment method

Auto-recharge prevents service interruptions. When the wallet is empty, credit-consuming operations are paused — but core platform features continue operating normally.

---

## How UGC Campaigns Are Funded

User-Generated Content campaigns are the primary credit consumer for most accounts. Here's how the funding flow works:

### Campaign Lifecycle

1. **Detection** — The Content Engine identifies a UGC opportunity (e.g., a product with no customer reviews, a trending topic where user testimonials would boost credibility)
2. **Brief Generation** — The AI Manager creates a campaign brief with estimated cost, target channels, and expected outcomes
3. **Human Approval** — You review and approve the campaign in the AI Manager's UGC panel. The estimated credit cost is displayed prominently.
4. **Credit Hold** — Upon approval, the estimated credits are placed on hold (reserved but not yet deducted)
5. **Execution** — The Social Agent dispatches the campaign across approved channels
6. **Settlement** — Actual credits consumed are settled against the hold. Unused credits are released back to your wallet.

### Campaign Budget Controls

You maintain full control over campaign spending:

- **Per-Campaign Cap** — Maximum credits any single campaign can consume
- **Monthly Ceiling** — Total credit spend limit across all campaigns per billing cycle
- **Channel Restrictions** — Limit campaigns to specific channels (e.g., only Trustpilot reviews, no Reddit outreach)
- **Pause All Campaigns** — Immediately halt all active UGC operations

These controls are configurable in **Settings > Notifications & Limits**.

---

## Credit Transparency

Every credit deduction is logged with full traceability:

- **Transaction ID** — Unique identifier for each deduction
- **Operation** — What the credits were spent on
- **Agent** — Which swarm agent initiated the operation
- **Amount** — Credits consumed
- **Timestamp** — When the deduction occurred
- **Domain** — Which domain the operation was performed for

The full transaction log is accessible from the Wallet page and can be exported as CSV for accounting purposes.

---

## Billing & Invoicing

Swarme uses Stripe for payment processing. Your billing page (accessible from **Settings > Billing**) shows:

- Current subscription plan and renewal date
- Credit balance and recent transactions
- Payment method on file
- Downloadable invoices for all charges

All prices are in USD. Credit purchases are charged immediately. Subscription fees are charged on your billing anniversary date.

---

## What Happens When Credits Run Out

When your Media Wallet balance reaches zero:

1. **Credit-consuming operations pause** — No new campaigns, content generation, or paid API calls are initiated
2. **Core platform continues** — Auditing, monitoring, keyword tracking, and dashboard analytics remain fully operational
3. **In-progress operations complete** — Any operation that was already running when the balance hit zero will complete, potentially creating a small negative balance
4. **Notification** — The AI Manager alerts you that your wallet needs funding
5. **Auto-recharge triggers** — If configured, credits are automatically purchased to restore operations

The swarm never incurs costs beyond your approved limits. Budget controls are enforced at the task dispatch layer — before an operation begins, not after.`;

const GEO_RAG_MD = `# Generative Engine Optimization (GEO) & RAG Strategy

The search landscape has fundamentally shifted. Traditional SEO optimized for ten blue links. The new paradigm — **Generative Engine Optimization** — optimizes for AI-generated answers. Swarme is built from the ground up for this reality.

---

## The GEO Era

AI overview panels now appear in over 40% of Google search results. Perplexity, ChatGPT with browsing, Gemini, and Copilot generate synthesized answers that cite sources inline. The question is no longer "how do I rank #1?" — it's "how do I get cited in the AI's answer?"

### What Changed

| Traditional SEO | Generative Engine Optimization |
|----------------|-------------------------------|
| Optimize for crawler bots | Optimize for LLM retrieval pipelines |
| Target keyword density | Target semantic relevance and authority signals |
| Build backlinks for PageRank | Build citations that LLMs can attribute |
| Write for SERP snippets | Write for RAG (Retrieval-Augmented Generation) extraction |
| Measure rankings | Measure AI citation frequency and visibility |

### Why It Matters

When an AI assistant answers a user's question, it typically:

1. Retrieves relevant documents from its index or live web search
2. Extracts key claims, facts, and quotes
3. Synthesizes a coherent answer
4. Attributes sources with inline citations

If your content isn't structured for step 2 — easy extraction of authoritative, quotable claims — the AI will cite your competitors instead. Swarme's agents are specifically designed to make your content the preferred citation source.

---

## The llms.txt Protocol

Swarme implements and manages the emerging \`/llms.txt\` protocol — a machine-readable file (similar to \`robots.txt\`) that explicitly tells AI crawlers how to interact with your site.

### What Is llms.txt?

The \`/llms.txt\` file sits at your domain root and provides structured metadata to LLM crawlers:

\`\`\`
# llms.txt — Machine-readable site context for LLM retrieval

> Site: yourbrand.com
> Description: Premium outdoor gear for serious adventurers
> Primary Topics: hiking equipment, camping gear, trail running
> Authority Signals: 15 years in business, 50,000+ customers
> Preferred Citation Format: "According to YourBrand..."
> Content Freshness: Updated weekly
> Contact: press@yourbrand.com

## Key Pages
- /about — Company history and mission
- /blog — Expert guides and product reviews
- /products — Full product catalog with specs
- /reviews — Verified customer testimonials
\`\`\`

### How Swarme Manages llms.txt

The swarm's Edge Worker dynamically generates and serves your \`/llms.txt\` file based on:

1. **Brand context** collected during onboarding (your platform, competitors, north star)
2. **Content inventory** maintained by the Content Engine
3. **Authority signals** detected by the Auditor (backlink profile, domain age, trust metrics)
4. **Freshness metadata** from your CMS update timestamps

The file is regenerated whenever your content inventory changes significantly. You can review and edit the generated file from the **AI Visibility** dashboard.

---

## RAG-Bait Content Strategy

"RAG-bait" refers to content specifically structured to be easily retrievable and citable by AI systems. Swarme's Content Engine generates and optimizes your content with RAG extraction in mind.

### RAG-Bait Principles

1. **Atomic Claims** — Break complex topics into standalone, quotable statements. AI systems extract individual claims, not entire paragraphs.

2. **Structured Data Density** — Embed facts in tables, definition lists, and FAQ schemas. These formats are preferred by retrieval pipelines because they're unambiguous to parse.

3. **Authority Framing** — Preface claims with credibility markers: "Based on our analysis of 10,000 customer orders..." or "In our 15 years of manufacturing experience..."

4. **Semantic Anchors** — Use schema.org markup (FAQ, HowTo, Article, Product) to create machine-readable semantic anchors that retrieval systems can index.

5. **Freshness Signals** — Include "Last updated: [date]" metadata and \`dateModified\` in your JSON-LD. LLMs preferentially cite recent sources.

### How the Swarm Implements RAG-Bait

| Agent | RAG-Bait Action |
|-------|----------------|
| **Content Engine** | Restructures existing content with atomic claim formatting and FAQ sections |
| **Auditor** | Scans for missing schema markup and injects JSON-LD (FAQ, HowTo, Article) |
| **Edge Worker** | Serves /llms.txt and injects meta llm-context tags at the edge |
| **Writer** | Generates new content drafts pre-optimized for RAG extraction patterns |
| **SERP Analyst** | Monitors which of your pages appear in AI overview citations |

---

## AI Visibility Tracking

The **AI Visibility** dashboard tracks your presence across AI-generated answer panels:

### What We Track

- **Citation Frequency** — How often your domain appears as a cited source in AI overviews
- **Citation Context** — The queries that triggered your citation (what users were asking)
- **Competitor Citations** — How often your competitors are cited for queries you're targeting
- **Gap Analysis** — Queries where competitors are cited but you aren't — and actionable recommendations to close the gap
- **Trend Lines** — Your AI visibility score over time, correlated with content changes and swarm activity

### The AI Visibility Score

Your AI Visibility Score (0-100) represents the percentage of your tracked keyword universe where your content appears in AI-generated answers. The score accounts for:

- **Breadth** — How many queries cite you (coverage)
- **Depth** — How prominently you're cited (primary source vs. one of many)
- **Consistency** — Whether citations are stable or fluctuating
- **Growth** — Trajectory compared to the previous measurement period

The swarm continuously works to improve this score by:

1. Identifying citation gaps through the SERP Analyst
2. Generating RAG-optimized content to fill gaps via the Content Engine
3. Injecting schema markup and semantic anchors through the Auditor
4. Maintaining /llms.txt freshness through the Edge Worker
5. Building off-domain authority through the Digital PR and Social agents

---

## Snippet Injection at the Edge

Swarme's Cloudflare Worker uses HTMLRewriter to inject RAG-bait snippets directly into your pages at the edge — without modifying your CMS templates:

### What Gets Injected

- **FAQ Schema** — Automatically generated from your content, injected as JSON-LD in the head
- **LLM Context Meta** — Meta tags providing AI crawlers with page-level semantic hints
- **Structured Breadcrumbs** — Navigation breadcrumb schema for better topic hierarchy signals
- **SpeakableSpecification** — Marks sections of your content as suitable for voice assistant readout

All injections are non-destructive — they add metadata without altering visible page content. They're applied at the Cloudflare edge, meaning your origin server load is unaffected and changes take effect globally within seconds.

---

## Measuring GEO Impact

Track the ROI of your GEO strategy through the **Revenue Attribution** dashboard:

- **AI-Sourced Traffic** — Visits from users who clicked your citation in an AI overview
- **Assisted Conversions** — Revenue attributed to visits that included an AI overview touchpoint
- **GEO vs. Traditional SEO** — Side-by-side comparison of traffic and conversions from organic search vs. AI citations
- **Content ROI** — Per-page revenue attribution for RAG-optimized content

The swarm correlates AI visibility improvements with traffic and revenue changes, giving you a clear signal on which GEO investments are paying off.`;

// ── Document definitions ────────────────────────────────────

interface DocEntry {
  slug: string;
  title: string;
  shortTitle: string;
  icon: typeof Rocket;
  content: string;
}

const DOC_ENTRIES: DocEntry[] = [
  {
    slug: "getting-started",
    title: "Getting Started with Swarme",
    shortTitle: "Getting Started",
    icon: Rocket,
    content: GETTING_STARTED_MD,
  },
  {
    slug: "ai-manager",
    title: "The AI Manager",
    shortTitle: "AI Manager",
    icon: BrainCircuit,
    content: AI_MANAGER_MD,
  },
  {
    slug: "credits",
    title: "Swarme Credits & The Media Wallet",
    shortTitle: "Credits & Wallet",
    icon: Coins,
    content: CREDITS_MD,
  },
  {
    slug: "geo-and-rag",
    title: "GEO & RAG Strategy",
    shortTitle: "GEO & RAG",
    icon: Globe,
    content: GEO_RAG_MD,
  },
];

// ── Markdown Renderer ───────────────────────────────────────

/**
 * Simple markdown-to-HTML converter with GFM table support.
 * Handles: headings, paragraphs, bold, code, code blocks, lists, tables, hr, links.
 */
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let inOl = false;

  const inline = (text: string): string => {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  };

  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      closeList();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i].replace(/</g, "&lt;").replace(/>/g, "&gt;"));
        i++;
      }
      i++; // skip closing ```
      out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Table: detect header row + separator row
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1])) {
      closeList();
      // Parse header
      const headers = line.split("|").filter(Boolean).map(h => h.trim());
      i += 2; // skip header + separator
      let tableHtml = "<table><thead><tr>";
      for (const h of headers) tableHtml += `<th>${inline(h)}</th>`;
      tableHtml += "</tr></thead><tbody>";
      // Parse rows
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|").filter(Boolean).map(c => c.trim());
        tableHtml += "<tr>";
        for (const c of cells) tableHtml += `<td>${inline(c)}</td>`;
        tableHtml += "</tr>";
        i++;
      }
      tableHtml += "</tbody></table>";
      out.push(tableHtml);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3}) (.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      const text = inline(hMatch[2]);
      const id = hMatch[2].toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^(\s*)- (.+)$/);
    if (ulMatch) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(ulMatch[2])}</li>`);
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)\d+\. (.+)$/);
    if (olMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inline(olMatch[2])}</li>`);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    // Paragraph
    closeList();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

function DocContent({ markdown }: { markdown: string }) {
  const html = useMemo(() => mdToHtml(markdown), [markdown]);
  return (
    <article
      className="prose prose-invert max-w-none prose-headings:scroll-mt-20 prose-h1:text-2xl prose-h1:font-bold prose-h1:tracking-tight prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-base prose-h3:font-medium prose-h3:mt-8 prose-h3:mb-3 prose-p:text-sm prose-p:leading-relaxed prose-p:text-slate-300 prose-li:text-sm prose-li:text-slate-300 prose-strong:text-white prose-code:text-emerald-400 prose-code:text-xs prose-code:bg-white/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[#161b22] prose-pre:border prose-pre:border-white/[0.06] prose-pre:text-xs prose-table:text-sm prose-th:text-left prose-th:text-white prose-th:font-medium prose-th:text-xs prose-th:uppercase prose-th:tracking-wider prose-td:text-slate-300 prose-td:text-sm prose-hr:border-white/[0.08] prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Extract H2 headings for TOC ─────────────────────────────

function extractHeadings(markdown: string): { id: string; text: string }[] {
  const lines = markdown.split("\n");
  const headings: { id: string; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      const text = match[1].trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      headings.push({ id, text });
    }
  }
  return headings;
}

// ── Sidebar Navigation ──────────────────────────────────────

function DocSidebar({
  activeSlug,
  onSelectDoc,
  headings,
  className,
}: {
  activeSlug: string;
  onSelectDoc: (slug: string) => void;
  headings: { id: string; text: string }[];
  className?: string;
}) {
  return (
    <nav className={cn("space-y-1", className)} data-testid="docs-sidebar-nav">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3 px-2">
        Documentation
      </p>
      {DOC_ENTRIES.map((doc) => {
        const Icon = doc.icon;
        const isActive = doc.slug === activeSlug;
        return (
          <div key={doc.slug}>
            <button
              onClick={() => onSelectDoc(doc.slug)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              )}
              data-testid={`docs-nav-${doc.slug}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{doc.shortTitle}</span>
            </button>
            {/* Section headings for active doc */}
            {isActive && headings.length > 0 && (
              <div className="ml-6 mt-1 mb-2 space-y-0.5 border-l border-white/[0.06] pl-3">
                {headings.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      const el = document.getElementById(h.id);
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="block w-full text-left text-xs text-slate-500 hover:text-slate-300 transition-colors py-0.5 truncate"
                    data-testid={`docs-toc-${h.id}`}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Main Page Component ─────────────────────────────────────

export default function DocsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/docs/:slug");
  const slug = params?.slug || "getting-started";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeDoc = DOC_ENTRIES.find((d) => d.slug === slug) || DOC_ENTRIES[0];
  const headings = useMemo(
    () => extractHeadings(activeDoc.content),
    [activeDoc.content]
  );

  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to top when doc changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [slug]);

  const handleSelectDoc = (newSlug: string) => {
    navigate(newSlug === "getting-started" ? "/docs" : `/docs/${newSlug}`);
    setMobileNavOpen(false);
  };

  // Find next/prev docs for pagination
  const currentIndex = DOC_ENTRIES.findIndex((d) => d.slug === activeDoc.slug);
  const prevDoc = currentIndex > 0 ? DOC_ENTRIES[currentIndex - 1] : null;
  const nextDoc =
    currentIndex < DOC_ENTRIES.length - 1
      ? DOC_ENTRIES[currentIndex + 1]
      : null;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-slate-400 hover:text-white"
            data-testid="button-docs-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <SwarmeLogo className="h-5 w-5 text-white" />
            <span className="font-semibold tracking-tight text-sm text-white">
              Swarme
            </span>
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-600" />
          <span className="text-sm text-slate-400">Docs</span>
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="ml-auto md:hidden text-slate-400 hover:text-white"
            data-testid="button-docs-mobile-nav"
          >
            {mobileNavOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {/* Layout */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-56 shrink-0 border-r border-white/[0.06]">
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <div className="py-6 px-4">
              <DocSidebar
                activeSlug={activeDoc.slug}
                onSelectDoc={handleSelectDoc}
                headings={headings}
              />
            </div>
          </ScrollArea>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileNavOpen(false)}>
            <div
              className="absolute left-0 top-14 bottom-0 w-64 bg-[#0d1117] border-r border-white/[0.06] p-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <DocSidebar
                activeSlug={activeDoc.slug}
                onSelectDoc={handleSelectDoc}
                headings={headings}
              />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div
          ref={contentRef}
          className="flex-1 min-w-0 overflow-y-auto h-[calc(100vh-3.5rem)]"
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
            <DocContent markdown={activeDoc.content} />

            {/* Pagination */}
            <div className="flex items-center justify-between mt-14 pt-6 border-t border-white/[0.06]">
              {prevDoc ? (
                <button
                  onClick={() => handleSelectDoc(prevDoc.slug)}
                  className="flex flex-col items-start text-sm group"
                  data-testid={`docs-prev-${prevDoc.slug}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">
                    Previous
                  </span>
                  <span className="text-slate-400 group-hover:text-white transition-colors">
                    {prevDoc.shortTitle}
                  </span>
                </button>
              ) : (
                <div />
              )}
              {nextDoc ? (
                <button
                  onClick={() => handleSelectDoc(nextDoc.slug)}
                  className="flex flex-col items-end text-sm group"
                  data-testid={`docs-next-${nextDoc.slug}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">
                    Next
                  </span>
                  <span className="text-slate-400 group-hover:text-white transition-colors">
                    {nextDoc.shortTitle}
                  </span>
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>

          {/* Footer */}
          <Footer />
        </div>
      </div>
    </div>
  );
}
