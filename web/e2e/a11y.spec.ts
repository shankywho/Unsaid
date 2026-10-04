import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, seedPatient } from './helpers';

const PUBLIC = ['/', '/login'];
const CONSOLE = [
  '/app/live',
  '/app/memory',
  '/app/wordmap',
  '/app/runs',
  '/app/eval',
  '/app/settings',
  '/app/_kitchen',
];

async function scan(page: import('@playwright/test').Page, name: string) {
  // let entrance animations finish: axe would otherwise measure contrast on half-faded text
  await page.waitForFunction(
    () => document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).length === 0,
  );
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = r.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(summary, `axe violations on ${name}`).toEqual([]);
}

for (const path of PUBLIC) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(500);
    await scan(page, path);
  });
}

test('axe: landing demo at a late frame (resolved sentence visible)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Spoken to caregiver').first()).toBeVisible({ timeout: 15_000 });
  await scan(page, '/ (resolved)');
});

test('axe: console routes', async ({ page, request }) => {
  const { id } = await seedPatient(request);
  await request.post('/v1/simulate/fragment', {
    headers: { Authorization: 'Bearer e2e-api-key-0123456789' },
    data: { userId: id, text: 'water… Ramesh… bill' },
  });
  await login(page);
  for (const path of CONSOLE) {
    await page.goto(path);
    await page.waitForTimeout(700);
    await scan(page, path);
  }
});
