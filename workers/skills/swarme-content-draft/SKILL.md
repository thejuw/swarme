---
name: swarme-content-draft
description: Draft content for human review. NEVER auto-publishes.
enabled: true
---

# Content Draft Skill

Create SEO-optimized content drafts that require human approval before publishing.

## CRITICAL CONSTRAINT
Content must NEVER be published autonomously. All drafts are saved to the database and require explicit human approval.

## When to use
- User asks to write an article or blog post
- User wants to refresh decaying content
- AI Manager suggests content based on keyword gaps

## API Endpoint
`POST /api/manager/roadmap` — Creates a roadmap item with status "Suggested"

## Required Parameters
- `topic` — Article topic or title
- `keywords` — Target SEO keywords
- `tone` — Writing tone (professional, casual, technical)

## Approval Flow
1. Draft is created as a roadmap item with status "Suggested"
2. Human reviews in the Strategy Roadmap panel
3. Human approves → status changes to "Approved"
4. Swarm executes the approved task
