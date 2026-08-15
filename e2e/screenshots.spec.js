import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mockApis, projectId } from './fixtures.js';

const targets = [
  ['login', '/login.html'],
  ['dashboard', '/dashboard.html'],
  ['projects', '/projects.html'],
  ['project-detail', `/project-detail.html?id=${projectId}`],
  ['tasks', `/tasks.html?id=${projectId}`],
];
test('captura desktop e mobile', async ({ browser }) => {
  const output = resolve('docs/ui-ux-evolution/after');
  await mkdir(output, { recursive: true });
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 360, height: 800 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    });
    await mockApis(page);
    for (const [name, url] of targets) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: resolve(output, `${name}-${size}.png`), fullPage: true });
    }
    expect(browserErrors).toEqual([]);
    await context.close();
  }
});
