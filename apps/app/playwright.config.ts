import { defineConfig } from "@playwright/test";

/**
 * Golden-path smoke suite. Runs against a dev server (BASE_URL, default http://localhost:3000)
 * with the dev sign-in enabled and sandbox ad accounts, so it never spends provider money:
 * it does not generate concepts or images; it exercises navigation, the campaign builder end
 * to end on a sandbox account, performance sync, guardrails and health.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  // A dev server compiles routes on first visit; give navigations room for a cold compile.
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 960 },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
