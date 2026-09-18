import { test, expect, type Page } from "@playwright/test";

/**
 * The path a paying user takes, minus the provider calls: sign in → dashboard → library →
 * briefs → ads → campaign (sandbox) → performance → guardrails → health.
 *
 * Needs: DEV_LOGIN enabled, a user with a brand (E2E_EMAIL, default ratnesh@adcraft.local),
 * and at least one finished creative in that brand for the campaign step (it skips politely
 * if there is none).
 */
const EMAIL = process.env.E2E_EMAIL ?? "ratnesh@adcraft.local";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  const dev = page.getByRole("button", { name: /^Sign in$/ });
  await page.getByPlaceholder("you@brand.com").last().fill(EMAIL);
  await dev.click();
  await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 30_000 });
}

test.describe("golden path", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("dashboard, create menu and activity tray render", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await page.locator(".create-menu > summary").first().click();
    await expect(page.getByRole("link", { name: /Static ad/ })).toBeVisible();
    await page.getByRole("button", { name: /Activity|running/ }).click();
    await expect(page.getByRole("dialog", { name: "Activity" })).toBeVisible();
  });

  test("library → brief form is pre-filled from a product link", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Product library" })).toBeVisible();
    const first = page.locator('main a[href^="/library/"]:not([href="/library/new"]):not([href="/library"])').first();
    if ((await first.count()) === 0) test.skip(true, "no products in this brand");
    await first.click();
    await page.getByRole("link", { name: /Brief with this product/ }).click();
    await expect(page).toHaveURL(/\/briefs\/new\?product=/);
    await expect(page.locator('select[name="productId"]')).not.toHaveValue("");
    await expect(page.locator(".flow-step.current")).toContainText("Brief"); // flow map
  });

  test("ads list → creative page shows a Next panel", async ({ page }) => {
    await page.goto("/creatives");
    const card = page.locator('main a[href^="/creatives/"]:not([href="/creatives/new"]):not([href="/creatives"])').first();
    if ((await card.count()) === 0) test.skip(true, "no creatives yet");
    await card.click();
    await expect(page.getByText("Next", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Make a variant|Add to (a|another) campaign|See performance/ }).first()).toBeVisible();
  });

  test("campaign builder: five steps, review, publish paused on a sandbox account", async ({ page }) => {
    await page.goto("/campaigns");
    // Connect a sandbox account if none is connected.
    if ((await page.getByRole("button", { name: "Connect sandbox" }).count()) === 3) {
      await page.getByRole("button", { name: "Connect sandbox" }).first().click();
      await page.waitForURL(/\/campaigns/);
    }
    await page.goto("/campaigns/new");
    if (page.url().includes("connect=1")) test.skip(true, "no ad account connected");
    await expect(page.getByRole("heading", { name: "Where does it run?" })).toBeVisible();
    await page.locator('input[name="name"]').fill(`E2E ${new Date().toISOString().slice(0, 16)}`);
    await page.getByRole("button", { name: /Continue/ }).first().click();
    await expect(page.getByRole("heading", { name: "Who sees it?" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).first().click();
    await expect(page.getByRole("heading", { name: "Placements and budget" })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).first().click();
    await expect(page.getByRole("heading", { name: "Which ads?" })).toBeVisible();
    const selectAll = page.getByRole("button", { name: /Select all valid \((\d+)\)/ });
    const label = await selectAll.textContent();
    if (label?.includes("(0)")) test.skip(true, "no finished creative fits the placements");
    await selectAll.click();
    await page.getByRole("button", { name: /Continue/ }).first().click();
    await expect(page.getByRole("heading", { name: "Review and publish" })).toBeVisible();
    await expect(page.getByText(/Sandbox account/).first()).toBeVisible();
    await page.getByRole("button", { name: "Publish as paused" }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/, { timeout: 45_000 });
    await expect(page.getByText(/is paused/)).toBeVisible({ timeout: 30_000 });
  });

  test("performance syncs and offers refresh/pause per creative", async ({ page }) => {
    await page.goto("/performance");
    await page.getByRole("button", { name: "Sync now" }).click();
    await page.waitForURL(/performance/);
    await expect(page.getByText(/Spend/i).first()).toBeVisible();
    const refresh = page.getByRole("link", { name: /Refresh/ }).first();
    if (await refresh.count()) await expect(refresh).toHaveAttribute("href", /\/briefs\/new\?from=/);
  });

  test("guardrails page and health endpoint", async ({ page, request }) => {
    await page.goto("/settings/guardrails");
    await expect(page.getByRole("heading", { name: "Guardrails" })).toBeVisible();
    await expect(page.getByText(/Provider spend/)).toBeVisible();
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const body = await health.json();
    expect(body.checks.database.ok).toBe(true);
  });
});
