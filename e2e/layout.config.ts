import { defineConfig } from "@playwright/test";

// Layout checks: the real web app in Chromium with every API call answered by
// fixtures (see layout/fixtures.ts), so no backend or Docker stack is needed.
//
//   cd e2e && npm ci && npx playwright install chromium && npm run test:layout
//
// PW_CHROMIUM_PATH points the run at an existing Chromium binary.
const CI = Boolean(process.env.CI);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./layout",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  webServer: {
    command: "npm --prefix ../web run dev -- --port 5180 --strictPort",
    url: "http://localhost:5180",
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:5180",
    timezoneId: "Asia/Almaty",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
