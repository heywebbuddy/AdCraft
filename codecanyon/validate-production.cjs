const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const buyer = process.argv[2];
const docsOnly = process.argv[3] === '--docs-only';
const req = createRequire(path.join(buyer, 'apps/app/package.json'));
const { chromium } = req('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checks = [];
  for (const route of docsOnly ? [] : ['/', '/pricing', '/showcase', '/sign-in', '/api/health']) {
    const response = await page.goto('http://127.0.0.1:4321' + route);
    if (response.status() !== 200) throw new Error(`${route}: ${response.status()}`);
    if (route === '/sign-in' && await page.getByText('Local development', { exact: true }).count()) {
      throw new Error('Development sign-in visible in production');
    }
    if (route === '/api/health') {
      const body = await response.json();
      if (!body.ok || !body.checks.database.ok || !body.checks.storage.ok) throw new Error('Unhealthy production server');
    }
    checks.push({ route, status: response.status() });
  }
  if (!docsOnly) {
    await page.goto('http://127.0.0.1:4321/dashboard');
    if (!page.url().includes('/sign-in')) throw new Error('Dashboard not protected');
    checks.push({ route: '/dashboard', unauthenticatedRedirect: true });
  }
  const docs = [];
  const evidence = path.resolve('codecanyon/build/evidence');
  fs.mkdirSync(evidence, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(pathToFileURL(path.join(buyer, 'documentation/index.html')).href);
    const result = await page.evaluate(() => ({
      width: innerWidth, documentWidth: document.documentElement.scrollWidth,
      brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.querySelector(a.getAttribute('href'))).map(a => a.hash),
      italic: [...document.querySelectorAll('body *')].filter(e => e.textContent.trim() && getComputedStyle(e).fontStyle === 'italic').length,
    }));
    if (result.documentWidth > width || result.brokenAnchors.length || result.italic) throw new Error(`Documentation layout: ${JSON.stringify(result)}`);
    await page.screenshot({ path: path.join(evidence, `buyer-guide-${width}.png`) });
    docs.push(result);
  }
  await browser.close();
  fs.writeFileSync(`codecanyon/build/${docsOnly ? 'documentation' : 'production'}-smoke.json`, JSON.stringify({ checks, docs }, null, 2));
  console.log(docsOnly ? 'Final buyer guide checked at desktop and mobile widths.' : 'Production checks passed: 5 public routes, protected dashboard, no development login; buyer guide checked at desktop and mobile widths.');
})();
