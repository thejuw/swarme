import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto("http://127.0.0.1:5000/#/free-analyzer", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

// Type a URL and submit
const input = page.locator('[data-testid="input-url"]');
await input.fill("sartelle-atelier.myshopify.com");
await page.waitForTimeout(300);

// Click analyze
const analyzeBtn = page.locator('[data-testid="button-analyze"]');
await analyzeBtn.click();

// Wait for results (mock has 1.5s delay)
await page.waitForTimeout(2500);

// Screenshot the results page
await page.screenshot({ path: "/home/user/workspace/swarme/qa-analyzer-results-desktop.png" });
console.log("Results desktop screenshot captured");

// Scroll down to see findings + CTA
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/user/workspace/swarme/qa-analyzer-findings-desktop.png" });
console.log("Findings desktop screenshot captured");

// Scroll further for CTA
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/user/workspace/swarme/qa-analyzer-cta-desktop.png" });
console.log("CTA desktop screenshot captured");

// Now test mobile
const mobileCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mobilePg = await mobileCtx.newPage();
await mobilePg.goto("http://127.0.0.1:5000/#/free-analyzer", { waitUntil: "domcontentloaded" });
await mobilePg.waitForTimeout(800);

await mobilePg.locator('[data-testid="input-url"]').fill("sartelle-atelier.myshopify.com");
await mobilePg.locator('[data-testid="button-analyze"]').click();
await mobilePg.waitForTimeout(2500);

await mobilePg.screenshot({ path: "/home/user/workspace/swarme/qa-analyzer-results-mobile.png" });
console.log("Results mobile screenshot captured");

await mobileCtx.close();
await browser.close();
console.log("QA test complete");
