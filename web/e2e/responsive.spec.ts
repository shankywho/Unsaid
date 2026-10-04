import { test, expect } from '@playwright/test';

test('landing has no horizontal overflow at 375px and every section is visible without scrolling into view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  // no scroll-triggered reveal: every heading is already visible in the DOM and not transparent
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw).toBeLessThanOrEqual(cw);
  for (const h of [
    'Finishing the sentences aphasia takes away.',
    'From overheard context to a spoken sentence.',
    'Every fact is visible, and deletable.',
    'See it work end to end.',
    'Questions, answered plainly.',
  ]) {
    const el = page.getByRole('heading', { name: h });
    await expect(el).toHaveCount(1);
    const opacity = await el.evaluate((n) => {
      let o = 1;
      for (let e: Element | null = n; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    });
    expect(opacity).toBe(1);
  }
  await expect(
    page.getByRole('heading', { name: /context-dependent fragments resolved within 3 yes\/no questions/ }),
  ).toBeVisible();
});

test('hero shows the confirmed frame by default and under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(5000);
  await expect(page.getByText('Spoken to caregiver').first()).toBeVisible();
  await expect(page.getByTestId('learn-followup').first()).toContainText('LEARN');
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

test('the hero demo loop never scrolls the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 3000));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(16_000); // one full loop starts after 4 s
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y0)).toBeLessThan(2);
});
