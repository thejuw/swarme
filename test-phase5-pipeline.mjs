import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// First, trigger a workflow so there's pipeline data
await fetch('http://localhost:5000/api/projects/proj_001/trigger-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: 'edge computing saas', initiator: 'manual' }),
});

// Switch project back to copilot mode so workflow lands in AWAITING_APPROVAL
await fetch('http://localhost:5000/api/projects/proj_001/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'copilot' }),
});

// Re-trigger with copilot mode to get AWAITING_APPROVAL state
await fetch('http://localhost:5000/api/projects/proj_001/trigger-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: 'edge computing saas', initiator: 'manual' }),
});

await page.goto('http://localhost:5000', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

// Click the awaiting approval row
const awaitingRow = page.locator('[data-testid="log-entry-task_002"]');
await awaitingRow.click();
await page.waitForTimeout(1500);

// Scroll the sheet content to see pipeline data
await page.screenshot({ path: '/home/user/workspace/phase5-pipeline-sheet.png' });
console.log('Pipeline sheet screenshot saved');

await browser.close();
