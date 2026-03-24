---
name: swarme-roadmap-status
description: View and manage the strategy roadmap for a project
enabled: true
---

# Roadmap Status Skill

Query the AI-generated strategy roadmap showing suggested, active, and completed items.

## When to use
- User asks "what's on my roadmap?"
- User wants progress updates on strategy items
- Reviewing what the AI Manager has suggested

## API Endpoint
`GET /api/manager/roadmap?project_id={project_id}`

## Statuses
- `Suggested` — AI-proposed, awaiting human review
- `Approved` — Human-approved, queued for execution
- `In_Progress` — Being executed by the swarm
- `Completed` — Finished

## Priorities
- `High`, `Medium`, `Low`

## Example
Ask: "How many roadmap items are completed vs suggested?"
Action: Fetch roadmap, group by status, provide summary counts and highlights.
