const { defineConfig, devices } = require("@playwright/test");

/* The hub's own suite.
 *
 * Run with one worker and no parallelism. Cache Storage and service-worker
 * registrations are origin-wide, and the whole point of this repository is
 * that six courses share one origin -- so a test that saves a course and a
 * test that asserts nothing is saved must not run at the same time. Playwright
 * does give each test a fresh context, but keeping it serial also keeps the
 * dev server's load honest: a course saving itself is a hundred-odd requests.
 */
module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  reporter: process.env.CI ? "line" : [["line"]],
  use: {
    baseURL: "http://localhost:8099",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "python scripts/dev-server.py 8099",
    url: "http://localhost:8099/",
    reuseExistingServer: true,
    timeout: 60000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
