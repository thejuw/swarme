import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto("http://127.0.0.1:5000/#/connect-store", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

// Step 1: Verify all 3 platform cards
const shopifyCard = await page.locator('[data-testid="card-platform-shopify"]').isVisible();
const wooCard = await page.locator('[data-testid="card-platform-woocommerce"]').isVisible();
const bcCard = await page.locator('[data-testid="card-platform-bigcommerce"]').isVisible();
console.log(`Platform cards visible: Shopify=${shopifyCard}, WooCommerce=${wooCard}, BigCommerce=${bcCard}`);

// Click Shopify card to go to step 2
await page.locator('[data-testid="card-platform-shopify"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/user/workspace/swarme/qa-wizard-step2.png" });
console.log("Step 2 screenshot captured");

// Click "Continue to Connect" to go to step 3
const continueBtn = page.locator('[data-testid="button-continue-connect"]');
if (await continueBtn.isVisible()) {
  await continueBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/home/user/workspace/swarme/qa-wizard-step3.png" });
  console.log("Step 3 screenshot captured");
} else {
  console.log("Continue button not found — trying alternative selectors");
  // Try generic button text
  const btn = page.getByRole("button", { name: /continue|next|connect/i });
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/home/user/workspace/swarme/qa-wizard-step3.png" });
    console.log("Step 3 screenshot captured via text match");
  }
}

// Check the back button
const backBtn = page.locator('[data-testid="button-back"]');
if (await backBtn.isVisible()) {
  console.log("Back button is visible on step 3");
}

await browser.close();
console.log("QA test complete");
