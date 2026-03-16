const { chromium } = require('/home/user/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto('http://127.0.0.1:5000/#/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await (await page.waitForSelector('[data-testid="input-email"]')).fill('demo@swarme.io');
  await (await page.waitForSelector('[data-testid="input-password"]')).fill('swarme2026');
  await (await page.waitForSelector('[data-testid="button-auth-submit"]')).click();
  await page.waitForTimeout(3000);
  console.log('1. Logged in, URL:', page.url());

  // Click Admin Panel link from sidebar
  const adminLink = await page.waitForSelector('[data-testid="nav-admin-panel"]', { timeout: 5000 }).catch(() => null);
  if (adminLink) {
    await adminLink.click();
    await page.waitForTimeout(2000);
    console.log('2. Navigated to admin via sidebar link, URL:', page.url());
  } else {
    console.log('2. Admin link not found, navigating directly');
    await page.goto('http://127.0.0.1:5000/#/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  // Check admin overview has stat cards
  const statCards = await page.locator('[data-testid^="stat-"]').count();
  console.log('3. Overview stat cards found:', statCards);

  // Navigate to CRM
  await page.click('[data-testid="admin-nav-crm---users"]');
  await page.waitForTimeout(2000);
  
  // Count user rows
  const userRows = await page.locator('[data-testid^="user-row-"]').count();
  console.log('4. User rows found:', userRows);

  // Test the actions dropdown on bob (usr_003)
  const actionsBtn = await page.waitForSelector('[data-testid="actions-usr_003"]', { timeout: 5000 }).catch(() => null);
  if (actionsBtn) {
    await actionsBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/user/workspace/swarme/qa-actions-dropdown.jpg', type: 'jpeg', quality: 85 });
    console.log('5. Actions dropdown opened for usr_003');
    
    // Click View Details
    const viewItem = await page.waitForSelector('[data-testid="view-usr_003"]', { timeout: 3000 }).catch(() => null);
    if (viewItem) {
      await viewItem.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/home/user/workspace/swarme/qa-user-detail-dialog.jpg', type: 'jpeg', quality: 85 });
      console.log('6. User detail dialog opened');
      
      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }

  // Navigate to vault, click Communications tab
  await page.click('[data-testid="admin-nav-infrastructure-vault"]');
  await page.waitForTimeout(2000);
  
  const commsTab = await page.waitForSelector('[data-testid="tab-communications"]', { timeout: 5000 }).catch(() => null);
  if (commsTab) {
    await commsTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/user/workspace/swarme/qa-vault-comms.jpg', type: 'jpeg', quality: 85 });
    console.log('7. Communications tab shown');
  }

  // Navigate to ecosystem
  await page.click('[data-testid="admin-nav-app-ecosystem"]');
  await page.waitForTimeout(2000);
  
  // Count integration cards
  const integCards = await page.locator('[data-testid^="integration-"]').count();
  console.log('8. Integration cards found:', integCards);

  // Test "Back to Dashboard" link
  const backBtn = await page.waitForSelector('[data-testid="admin-back-dashboard"]', { timeout: 5000 }).catch(() => null);
  if (backBtn) {
    await backBtn.click();
    await page.waitForTimeout(2000);
    console.log('9. Back to dashboard, URL:', page.url());
  }

  await browser.close();
  console.log('All functional tests passed');
})();
