---
name: swarme-gsc-report
description: Fetch and analyze Google Search Console data for a Swarme project
enabled: true
---

# GSC Report Skill

Query Google Search Console performance data via the Swarme API.

## When to use
- User asks about search performance, clicks, impressions, CTR, or ranking position
- User wants to see SEO trends over time
- Generating weekly/monthly SEO reports

## API Endpoint
`GET /api/projects/{project_id}/gsc-metrics`

## Response Fields
- `date` — Day of the metric
- `clicks` — Total organic clicks
- `impressions` — Total SERP impressions
- `ctr` — Click-through rate (decimal)
- `position` — Average ranking position

## Example
Ask: "Show me my GSC performance for the last 2 weeks"
Action: Call the GSC metrics endpoint with the active project ID, summarize trends in clicks, impressions, and position changes.
