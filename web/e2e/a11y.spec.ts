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
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState !== 'finished' && a.effect?.getTiming().iterations !== Infinity).length === 0,
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
  const sim = await request.post('/v1/simulate/fragment', {
    headers: { Authorization: 'Bearer e2e-api-key-0123456789' },
    data: { userId: id, text: 'water… Ramesh… bill' },
  });
  const runId: string | undefined = (await sim.json()).data?.runId;
  await login(page);
  for (const path of [...CONSOLE, ...(runId ? [`/app/runs/${runId}`] : [])]) {
    await page.goto(path);
    await page.waitForTimeout(700);
    await scan(page, path);
  }
  // answer the question that fragment left pending, so later tests start clean
  await request.post('/v1/simulate/fragment', {
    headers: { Authorization: 'Bearer e2e-api-key-0123456789' },
    data: { userId: id, text: 'yes' },
  });
});

test('axe: landing at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await page.waitForTimeout(500);
  await scan(page, '/ (375)');
});

test('axe: live console states (reasoning, question, confirmed) and the 1024 rail', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  await scan(page, 'live idle');
  await page.getByLabel('Simulate a fragment of speech').fill('Sunday… Priya… cake… no');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.getByRole('status', { name: 'Working out a question' })).toBeVisible({ timeout: 10_000 });
  await scan(page, 'live reasoning');
  await expect(page.getByRole('button', { name: /^Yes/ })).toBeVisible({ timeout: 20_000 });
  await scan(page, 'live question');
  await page.setViewportSize({ width: 1024, height: 800 });
  await scan(page, 'live question 1024');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('y');
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
  await scan(page, 'live confirmed');
});
