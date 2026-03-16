import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:5000', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

// Test 1: Click on "awaiting approval" task to open sheet
console.log('Test 1: Opening approval sheet...');
const awaitingRow = page.locator('[data-testid="log-entry-task_002"]');
await awaitingRow.click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/home/user/workspace/phase5-approval-sheet.png' });
console.log('Approval sheet screenshot saved');

// Close the sheet
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// Test 2: Click autopilot switch to trigger confirmation dialog
console.log('Test 2: Opening autopilot confirmation...');
const switchEl = page.locator('[data-testid="switch-autopilot"]');
await switchEl.click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/home/user/workspace/phase5-autopilot-dialog.png' });
console.log('Autopilot dialog screenshot saved');

// Test 3: Confirm autopilot
console.log('Test 3: Confirming autopilot...');
const confirmBtn = page.locator('[data-testid="button-confirm-autopilot"]');
await confirmBtn.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: '/home/user/workspace/phase5-autopilot-active.png' });
console.log('Autopilot active screenshot saved');

await browser.close();
console.log('All tests passed!');
