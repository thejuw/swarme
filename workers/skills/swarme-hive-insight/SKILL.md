---
name: swarme-hive-insight
description: Query the Swarme Hive Mind for global rules and system health
enabled: true
---

# Hive Insight Skill

Access the global Hive Mind knowledge base — rules, circuit breaker states, and system health.

## When to use
- User asks about system health or status
- User wants to check active edge rules
- Reviewing circuit breaker states for dependencies

## Data Sources
- HIVE_MIND KV namespace (prefix: hive:rules:)
- Pulse engine snapshots (CONFIG_KV: pulse:latest_snapshot)
- Circuit breaker states

## Output
- Active rule count and names
- Service health (healthy/degraded/down counts)
- Emergency stop status
- Last ChatOps update
