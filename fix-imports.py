"""Fix broken import insertions where useProjectId was placed inside a multi-line import block."""
import re
import os

BASE = "/home/user/workspace/swarme/client/src"

FILES = [
    "pages/connect-store.tsx",
    "pages/cro-telemetry.tsx",
    "pages/ai-manager.tsx",
    "pages/mission-control.tsx",
    "pages/off-domain.tsx",
    "pages/wallet.tsx",
    "pages/agent-activity.tsx",
    "pages/ai-visibility.tsx",
    "pages/digital-pr.tsx",
    "pages/edge-workers.tsx",
    "pages/comms.tsx",
    "pages/onboarding/context-setup.tsx",
]

IMPORT_LINE = 'import { useProjectId } from "@/hooks/use-project-id";'

for filepath in FILES:
    full_path = os.path.join(BASE, filepath)
    with open(full_path, "r") as f:
        content = f.read()
    
    # Pattern: "import {\n\nimport { useProjectId }...\n  SomeIcon,"
    # Fix: move the useProjectId import before the multi-line import block
    pattern = r'(import \{)\n\nimport \{ useProjectId \} from "@/hooks/use-project-id";\n(\s+\w)'
    
    if re.search(pattern, content):
        # Replace: put useProjectId import before the multi-line import, restore the block
        content = re.sub(
            pattern,
            IMPORT_LINE + r'\n\1\n\2',
            content
        )
        with open(full_path, "w") as f:
            f.write(content)
        print(f"FIXED: {filepath}")
    else:
        print(f"OK (no issue): {filepath}")

print("Done")
