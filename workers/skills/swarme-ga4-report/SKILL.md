---
name: swarme-ga4-report
description: Fetch and analyze Google Analytics 4 engagement metrics
enabled: true
---

# GA4 Report Skill

Query Google Analytics 4 metrics for bounce rate, session duration, and conversions.

## When to use
- User asks about website engagement, bounce rate, or conversions
- User wants device-level breakdowns
- Comparing engagement metrics over time

## API Endpoint
`GET /api/ga4/metrics?project_id={project_id}`

## Response Fields
- `metric_date`, `bounce_rate`, `session_duration`, `conversion_rate`, `device_type`

## Example
Ask: "What's my bounce rate on mobile vs desktop?"
Action: Fetch GA4 metrics, filter by device_type, compare bounce rates.
