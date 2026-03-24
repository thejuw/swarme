---
name: swarme-site-audit
description: Trigger or view site audits for SEO, accessibility, and performance
enabled: true
---

# Site Audit Skill

Run comprehensive site audits and retrieve findings with remediation roadmaps.

## When to use
- User asks to audit their site
- User wants to check accessibility compliance
- User asks about SEO health score

## API Endpoints
- `GET /api/projects/{project_id}/site-audit` — Latest audit results
- `POST /api/projects/{project_id}/site-audit/run` — Trigger new audit

## Audit Types
- `full` — Complete SEO + accessibility + performance
- `seo` — Technical SEO only
- `accessibility` — ADA/WCAG compliance
- `performance` — Core Web Vitals

## Output
Returns health_score (0-100), findings array, and a remediation roadmap with priority and effort estimates.
