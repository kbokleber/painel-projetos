import { test, expect } from '@playwright/test';
import { mockApis, projectId } from './fixtures.js';

let browserErrors;
test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  await mockApis(page);
});
test.afterEach(() => expect(browserErrors).toEqual([]));

test('smoke mobile 360', async ({ page }) => {
  for (const url of [
    '/login.html',
    '/dashboard.html',
    '/projects.html',
    `/project-detail.html?id=${projectId}`,
    `/tasks.html?id=${projectId}`,
  ]) {
    await page.goto(url);
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBeTruthy();
  }
});
