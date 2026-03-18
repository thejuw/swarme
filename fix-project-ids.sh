#!/bin/bash
# Script to replace hardcoded PROJECT_ID = "proj_001" across all pages
# Each page file: remove const PROJECT_ID line, add useProjectId import, add hook call inside component

cd /home/user/workspace/swarme/client/src

# List of page files with const PROJECT_ID = "proj_001" at module level
PAGE_FILES=(
  "pages/site-audit.tsx"
  "pages/connect-store.tsx"
  "pages/roi-dashboard.tsx"
  "pages/cro-telemetry.tsx"
  "pages/social-queue.tsx"
  "pages/decay-manager.tsx"
  "pages/ai-manager.tsx"
  "pages/ab-tests.tsx"
  "pages/mission-control.tsx"
  "pages/off-domain.tsx"
  "pages/wallet.tsx"
  "pages/agent-activity.tsx"
  "pages/ai-visibility.tsx"
  "pages/digital-pr.tsx"
  "pages/edge-workers.tsx"
  "pages/comms.tsx"
  "pages/onboarding/context-setup.tsx"
)

echo "Found ${#PAGE_FILES[@]} files to fix"
for f in "${PAGE_FILES[@]}"; do
  echo "  - $f"
done
