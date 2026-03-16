const { chromium } = require('/home/user/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // Go to login
  await page.goto('http://127.0.0.1:5000/#/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  console.log('Title:', await page.title());

  // Fill login form
  const emailInput = await page.waitForSelector('[data-testid="input-email"]', { timeout: 5000 }).catch(() => null);
  if (emailInput) {
    await emailInput.fill('demo@swarme.io');
    const passInput = await page.waitForSelector('[data-testid="input-password"]');
    await passInput.fill('swarme2026');
    const submitBtn = await page.waitForSelector('[data-testid="button-auth-submit"]');
    await submitBtn.click();
    await page.waitForTimeout(3000);
    console.log('URL after login:', page.url());
  } else {
    // Fallback: check what's on the page
    const html = await page.content();
    console.log('No login input found. HTML snippet:', html.substring(0, 500));
  }

  await page.screenshot({ path: '/home/user/workspace/swarme/qa-post-login.jpg', type: 'jpeg', quality: 85 });

  // Navigate to admin overview
  await page.goto('http://127.0.0.1:5000/#/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-admin-overview.jpg', type: 'jpeg', quality: 85 });
  console.log('Admin overview done');

  // Navigate to admin users (CRM)
  await page.goto('http://127.0.0.1:5000/#/admin/users', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-admin-users.jpg', type: 'jpeg', quality: 85 });
  console.log('Admin users done');

  // Navigate to admin vault
  await page.goto('http://127.0.0.1:5000/#/admin/vault', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-admin-vault.jpg', type: 'jpeg', quality: 85 });
  console.log('Admin vault done');

  // Navigate to admin ecosystem
  await page.goto('http://127.0.0.1:5000/#/admin/ecosystem', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/user/workspace/swarme/qa-admin-ecosystem.jpg', type: 'jpeg', quality: 85 });
  console.log('Admin ecosystem done');

  await browser.close();
  console.log('All QA screenshots captured');
})();
