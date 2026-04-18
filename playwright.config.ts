import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4174/atlas-orbital/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run preview:test",
    url: "http://127.0.0.1:4174/atlas-orbital/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
