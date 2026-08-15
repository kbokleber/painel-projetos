import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/login.html',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /pages\.spec\.js/ },
    {
      name: 'mobile',
      use: { viewport: { width: 360, height: 800 } },
      testMatch: /smoke\.spec\.js/,
    },
    {
      name: 'screenshots',
      use: { viewport: { width: 1440, height: 1000 } },
      testMatch: /screenshots\.spec\.js/,
    },
  ],
});
