import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "npx tsx server/index.ts",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 45_000,
    env: {
      NODE_ENV: "production",
      PORT: "3000",
    },
  },
});
