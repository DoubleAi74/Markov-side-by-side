import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    env: {
      ...process.env,
      AUTH_SECRET: process.env.AUTH_SECRET || "markov-lab-playwright-secret-do-not-use-outside-tests",
      AUTH_TRUST_HOST: "true",
      MARKOV_LAB_E2E: "true",
    },
    reuseExistingServer: true,
    timeout: 120_000
  }
});
