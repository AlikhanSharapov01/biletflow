import { defineConfig } from "@playwright/test";

// Browser tests for the whole stack. They need `docker compose up --build` from the
// repository root (web and API on :8080, Mailpit on :8025) and nothing else:
// every test creates its own accounts and events through the API.
//
//   cd e2e && npm ci && npx playwright install chromium && npm test
//
// E2E_BASE_URL and E2E_MAIL_URL point the tests at another address. Keep the browser on
// `localhost`: pages opened over plain HTTP on any other name cannot call
// crypto.randomUUID(), which the checkout needs.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  // The stack has one database and one worker, so flows run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    // The interface follows the browser language; pin English so texts are stable.
    locale: "en-US",
    timezoneId: "Asia/Almaty",
    // A trace of every failed test: open with `npx playwright show-trace`.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
