"""
Replace hardcoded PROJECT_ID = "proj_001" across all page files.

Strategy:
1. Remove `const PROJECT_ID = "proj_001";` line
2. Add `import { useProjectId } from "@/hooks/use-project-id";` 
3. Add `const PROJECT_ID = useProjectId();` inside the default export function body
"""
import re
import os

BASE = "/home/user/workspace/swarme/client/src"

# Pages with module-level const PROJECT_ID = "proj_001"
PAGE_FILES = [
    "pages/site-audit.tsx",
    "pages/connect-store.tsx",
    "pages/roi-dashboard.tsx",
    "pages/cro-telemetry.tsx",
    "pages/social-queue.tsx",
    "pages/decay-manager.tsx",
    "pages/ai-manager.tsx",
    "pages/ab-tests.tsx",
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

# Components with default parameter projectId = "proj_001"
COMPONENT_FILES = [
    "components/kpi-cards.tsx",
    "components/agent-activity-log.tsx",
    "components/visibility-score.tsx",
    "components/serp-chart.tsx",
]

IMPORT_LINE = 'import { useProjectId } from "@/hooks/use-project-id";'

def fix_page_file(filepath):
    """Fix a page file that has module-level const PROJECT_ID = "proj_001" """
    full_path = os.path.join(BASE, filepath)
    if not os.path.exists(full_path):
        print(f"  SKIP (not found): {filepath}")
        return False
    
    with open(full_path, "r") as f:
        content = f.read()
    
    # Check if already fixed
    if "useProjectId" in content:
        print(f"  SKIP (already fixed): {filepath}")
        return False
    
    # 1. Remove the module-level const PROJECT_ID line
    original = content
    content = re.sub(r'const PROJECT_ID\s*=\s*["\']proj_001["\'];?\s*\n', '', content)
    
    if content == original:
        print(f"  SKIP (no proj_001 found): {filepath}")
        return False
    
    # 2. Add import after last import line
    # Find the last import statement
    import_matches = list(re.finditer(r'^import\s.*?[;\n]', content, re.MULTILINE))
    if import_matches:
        last_import_end = import_matches[-1].end()
        content = content[:last_import_end] + "\n" + IMPORT_LINE + "\n" + content[last_import_end:]
    else:
        content = IMPORT_LINE + "\n" + content
    
    # 3. Add const PROJECT_ID = useProjectId() inside the default export function
    # Pattern: find "export default function XXX(" and insert after the opening brace
    # Or find "function XXX(" for named functions that are exported
    
    # Try: export default function Name() {
    match = re.search(r'(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)', content)
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + '\n  const PROJECT_ID = useProjectId();' + content[insert_pos:]
    else:
        # Try: function Name() { ... export default Name
        match = re.search(r'(function\s+\w+Page\s*\([^)]*\)\s*\{|function\s+\w+\s*\([^)]*\)\s*\{)', content)
        if match:
            insert_pos = match.end()
            content = content[:insert_pos] + '\n  const PROJECT_ID = useProjectId();' + content[insert_pos:]
        else:
            print(f"  WARNING: Could not find function body in {filepath}")
            # Just add it after imports as a module-level call (will work in component files)
            # Actually, hooks can't be called at module level. Let's skip and handle manually.
            return False
    
    with open(full_path, "w") as f:
        f.write(content)
    
    print(f"  FIXED: {filepath}")
    return True

def fix_component_file(filepath):
    """Fix a component file that has projectId = "proj_001" as default parameter"""
    full_path = os.path.join(BASE, filepath)
    if not os.path.exists(full_path):
        print(f"  SKIP (not found): {filepath}")
        return False
    
    with open(full_path, "r") as f:
        content = f.read()
    
    if "useProjectId" in content:
        print(f"  SKIP (already fixed): {filepath}")
        return False
    
    # For components, we replace the default parameter value
    # e.g., { projectId = "proj_001" } becomes { projectId }
    # and add useProjectId as a fallback inside the component
    
    # Actually, the cleaner approach: keep the prop interface but remove the default,
    # and use the hook inside the component as the default
    
    # Pattern: projectId = "proj_001"  ->  remove default
    original = content
    content = re.sub(r'projectId\s*=\s*["\']proj_001["\']', 'projectId', content)
    
    if content == original:
        # Try the const pattern
        content = re.sub(r'const PROJECT_ID\s*=\s*["\']proj_001["\'];?\s*\n', '', content)
        if content == original:
            print(f"  SKIP (no proj_001 found): {filepath}")
            return False
    
    # Add import
    import_matches = list(re.finditer(r'^import\s.*?[;\n]', content, re.MULTILINE))
    if import_matches:
        last_import_end = import_matches[-1].end()
        content = content[:last_import_end] + "\n" + IMPORT_LINE + "\n" + content[last_import_end:]
    
    # For components with destructured props like { projectId }, add hook as fallback
    # Find the export function and add: const _pid = useProjectId(); then use it
    # Actually simpler: replace the destructured default with the hook
    
    # Find the function declaration and add hook call + fallback
    match = re.search(r'(export\s+function\s+\w+\s*\([^)]*\)\s*\{)', content)
    if match:
        insert_pos = match.end()
        content = content[:insert_pos] + '\n  const _hookProjectId = useProjectId();\n  if (!projectId) projectId = _hookProjectId;' + content[insert_pos:]
    
    with open(full_path, "w") as f:
        f.write(content)
    
    print(f"  FIXED: {filepath}")
    return True

print("=== Fixing page files ===")
page_count = 0
for f in PAGE_FILES:
    if fix_page_file(f):
        page_count += 1

print(f"\n=== Fixing component files ===")
comp_count = 0
for f in COMPONENT_FILES:
    if fix_component_file(f):
        comp_count += 1

print(f"\nDone: {page_count} pages + {comp_count} components fixed")
