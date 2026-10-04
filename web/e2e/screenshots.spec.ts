import { test, expect } from '@playwright/test';
import path from 'node:path';
import { auth, login, seedPatient } from './helpers';

const out = (n: string) => path.resolve(import.meta.dirname, '../../docs/screenshots', n);

test.use({ reducedMotion: 'no-preference' });

test('landing screenshots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Spoken to caregiver').first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('landing-hero.png') });
  await page.screenshot({ path: out('landing-full.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('landing-mobile.png'), fullPage: true });
});

test('live console screenshot (resolved)', async ({ page, request }) => {
  const { id } = await seedPatient(request);
  await login(page);
  await page.getByLabel('Simulate a fragment of speech').fill('water… Ramesh… bill');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.getByText(/^question 1 of 3$/)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: out('console-live-question.png') });
  await page.keyboard.press('y');
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out('console-live-resolved.png') });
  void id;
  void auth;
});
