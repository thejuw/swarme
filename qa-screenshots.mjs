import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5000';

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Desktop 1280px — Decay Manager page
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto(`${BASE}/#/decay-manager`, { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(2000);
  await desktopPage.screenshot({ path: '/home/user/workspace/swarme/qa-desktop-decay.png', fullPage: true });
  console.log('✓ Desktop screenshot saved');

  // Desktop dark mode (already dark by default, but let's also capture the dialog)
  // Click on the first article with AWAITING_APPROVAL to open the diff dialog
  const reviewBtn = desktopPage.locator('button:has-text("Review")').first();
  if (await reviewBtn.isVisible()) {
    await reviewBtn.click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: '/home/user/workspace/swarme/qa-desktop-decay-dialog.png', fullPage: false });
    console.log('✓ Desktop dialog screenshot saved');
    // Close dialog
    await desktopPage.keyboard.press('Escape');
    await desktopPage.waitForTimeout(500);
  } else {
    console.log('⚠ No Review button visible');
  }
  await desktopCtx.close();

  // Mobile 375px
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(`${BASE}/#/decay-manager`, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: '/home/user/workspace/swarme/qa-mobile-decay.png', fullPage: true });
  console.log('✓ Mobile screenshot saved');
  await mobileCtx.close();

  await browser.close();
  console.log('Done');
}

run().catch(e => { console.error(e); process.exit(1); });
