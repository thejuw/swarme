import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5000';

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ── 1. Landing Page (desktop) ──
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktopCtx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-landing-desktop.png', fullPage: true });
  console.log('✓ 1. Landing desktop (full page)');

  // ── 2. Landing Page hero viewport only ──
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-landing-hero.png' });
  console.log('✓ 2. Landing hero viewport');

  // ── 3. Login Page ──
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-login-desktop.png' });
  console.log('✓ 3. Login page');

  // ── 4. Signup Page ──
  await page.goto(`${BASE}/#/signup`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-signup-desktop.png' });
  console.log('✓ 4. Signup page');

  // ── 5. Login flow → redirects to dashboard ──
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.fill('[data-testid="input-email"]', 'demo@swarme.io');
  await page.fill('[data-testid="input-password"]', 'swarme2026');
  await page.click('[data-testid="button-auth-submit"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-after-login.png' });
  console.log('✓ 5. After login → dashboard');

  // ── 6. Verify sidebar nav shows /dashboard active ──
  const currentUrl = page.url();
  console.log(`  Current URL after login: ${currentUrl}`);

  await desktopCtx.close();

  // ── 7. Mobile landing ──
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePg = await mobileCtx.newPage();
  await mobilePg.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await mobilePg.waitForTimeout(2000);
  await mobilePg.screenshot({ path: '/home/user/workspace/swarme/qa-landing-mobile.png', fullPage: true });
  console.log('✓ 7. Landing mobile (full page)');

  // ── 8. Mobile login ──
  await mobilePg.goto(`${BASE}/#/login`, { waitUntil: 'networkidle' });
  await mobilePg.waitForTimeout(1000);
  await mobilePg.screenshot({ path: '/home/user/workspace/swarme/qa-login-mobile.png' });
  console.log('✓ 8. Login mobile');

  await mobileCtx.close();

  // ── 9. Dark mode landing check (already dark by default) ──
  const darkCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark',
  });
  const darkPg = await darkCtx.newPage();
  await darkPg.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await darkPg.waitForTimeout(1500);
  await darkPg.screenshot({ path: '/home/user/workspace/swarme/qa-landing-dark.png' });
  console.log('✓ 9. Landing dark mode');

  await darkCtx.close();
  await browser.close();
  console.log('\nDone — all screenshots captured');
}

run().catch(e => { console.error(e); process.exit(1); });
