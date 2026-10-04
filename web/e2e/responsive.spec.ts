import { test, expect } from '@playwright/test';

test('landing has no horizontal overflow at 375px and every feature section renders', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  // scroll through so scroll-triggered reveals run
  for (let y = 0; y < 12000; y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(60);
  }
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw).toBeLessThanOrEqual(cw);
  for (const h of [
    'Everyday conversation becomes context.',
    'Every memory shows where it came from.',
    'A fragment becomes three possible meanings.',
    'Nothing is said until the patient says yes.',
    'It learns how this person speaks.',
    'Private by design.',
  ]) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  await page.screenshot({ path: '../docs/screenshots/landing-mobile-features.png' });
});

test('console shell has no horizontal overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/login');
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw).toBeLessThanOrEqual(cw);
});
