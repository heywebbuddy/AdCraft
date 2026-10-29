const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const buyer = process.argv[2];
const req = createRequire(path.join(buyer, 'apps/app/package.json'));
const { chromium, expect } = req('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:4322/sign-in');
  await page.getByPlaceholder('you@brand.com').last().fill('buyer@example.com');
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/welcome$/);
  await page.locator('[name="orgName"]').fill('Buyer Test Studio');
  await page.locator('[name="brandName"]').fill('Everyday Test');
  await page.getByRole('button', { name: /Open my studio/ }).click();
  await page.waitForURL(/welcome\/first-ad/);
  await page.goto('http://127.0.0.1:4322/library/new');
  await page.locator('[name="name"]').fill('Everyday Serum');
  await page.locator('textarea[name="description"]').fill('Fictional product for buyer package validation.');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('dist/assets/ads/eclat-packshot.webp'));
  await page.getByRole('button', { name: /Upload and cut out/ }).click();
  await page.waitForURL(/\/library\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Everyday Serum' })).toBeVisible();
  await page.goto('http://127.0.0.1:4322/admin');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (!page.url().endsWith('/admin')) throw new Error('Admin access failed');
  await browser.close();
  if (errors.length) throw new Error(JSON.stringify(errors));
  fs.writeFileSync('codecanyon/build/onboarding-smoke.json', JSON.stringify({
    signIn: true, newWorkspace: true, newBrand: true, productUpload: true,
    administratorAccess: true, pageErrors: errors,
  }, null, 2));
  console.log('Fresh buyer onboarding, product upload and administrator access passed.');
})();
