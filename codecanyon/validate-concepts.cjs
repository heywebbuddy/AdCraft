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
  await page.goto('http://127.0.0.1:4322/sign-in');
  await page.getByPlaceholder('you@brand.com').last().fill('buyer@example.com');
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.goto('http://127.0.0.1:4322/briefs/new');
  await page.locator('input[name="title"]').fill('A simple daily ritual');
  await page.locator('select[name="productId"]').selectOption({ label: 'Everyday Serum' });
  await page.locator('textarea[name="audience"]').fill('Shoppers who want a simple daily skincare routine.');
  await page.getByRole('button', { name: /Generate concepts/ }).click();
  await page.waitForURL(/\/briefs\/[0-9a-f-]{36}$/);
  await expect(page.locator('.concept-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Select', exact: true }).first().click();
  await page.getByRole('link', { name: /Make the ad/ }).first().click();
  await expect(page.getByRole('button', { name: /Generate ad/ })).toBeDisabled();
  await browser.close();
  fs.writeFileSync('codecanyon/build/concepts-smoke.json', JSON.stringify({
    conceptsGenerated: 8, source: 'offline sample adapter', selectConcept: true,
    staticStudio: true, imageGenerationRequiresProvider: true,
  }, null, 2));
  console.log('Brief generated 8 sample concepts; selection and static studio opened. Live image generation correctly requires a provider.');
})();
