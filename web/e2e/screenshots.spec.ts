import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { login, seedPatient } from './helpers';

/**
 * Screenshots of the built UI (the seeded demo patient, mocked externals with a small per-call latency so the
 * reasoning state can be caught), each placed next to the matching board from web/design-ref/ in
 * docs/screenshots/compare/. Run on its own (fresh e2e database):  pnpm --dir web e2e e2e/screenshots.spec.ts
 */
const shots = path.resolve(import.meta.dirname, '../../docs/screenshots');
const cmp = path.join(shots, 'compare');
const ref = (n: string) => pathToFileURL(path.resolve(import.meta.dirname, '../design-ref', n)).href;
fs.mkdirSync(cmp, { recursive: true });

test.use({ reducedMotion: 'no-preference' });
test.setTimeout(120_000);

/** Render a design-ref board and the built screenshot side by side. */
async function compare(
  page: Page,
  name: string,
  board: string,
  built: string,
  width: number,
  fullPage: boolean,
) {
  const ctx = page.context();
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height: 900 });
  await p.goto(ref(board));
  await p.waitForTimeout(1200); // web fonts
  const designPath = path.join(cmp, `${name}-design.png`);
  await p.screenshot({ path: designPath, fullPage });
  const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await p.setViewportSize({ width: width * 2 + 48, height: 900 });
  await p.setContent(`<body style="margin:0;background:#050506;color:#8b8b93;font:12px monospace;display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:12px 12px">
    <figure style="margin:0"><figcaption style="padding:6px 0">design-ref/${board}</figcaption><img style="width:100%;display:block" src="${img(designPath)}"></figure>
    <figure style="margin:0"><figcaption style="padding:6px 0">built</figcaption><img style="width:100%;display:block" src="${img(built)}"></figure></body>`);
  await p.screenshot({ path: path.join(cmp, `${name}.png`), fullPage: true });
  fs.rmSync(designPath); // only the side-by-side image is kept
  await p.close();
}

test('landing 1440 and 375', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByText('Spoken to caregiver').first()).toBeVisible();
  await page.waitForTimeout(800);
  const desktop = path.join(shots, 'landing-desktop.png');
  await page.screenshot({ path: desktop, fullPage: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(500);
  const mobile = path.join(shots, 'landing-mobile.png');
  await page.screenshot({ path: mobile, fullPage: true });
  await compare(page, 'landing-desktop', 'Landing.dc.html', desktop, 1440, true);
  await compare(page, 'landing-mobile', 'LandingMobile.dc.html', mobile, 375, true);
});

test('live console: idle, reasoning, question, confirmed', async ({ page, request }) => {
  await seedPatient(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page.getByTestId('conversation-idle')).toBeVisible();
  await page.waitForTimeout(600);
  const idle = path.join(shots, 'live-idle.png');
  await page.screenshot({ path: idle });

  await page.getByLabel('Simulate a fragment of speech').fill('water… Ramesh… bill');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.locator('[data-node="hypothesize"][data-status="running"]')).toBeVisible({
    timeout: 15_000,
  });
  const reasoning = path.join(shots, 'live-reasoning.png');
  await page.screenshot({ path: reasoning });

  await expect(page.getByRole('button', { name: /^Yes/ })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const question = path.join(shots, 'live-question.png');
  await page.screenshot({ path: question });

  await page.keyboard.press('y');
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('learn-followup')).toContainText('LEARN done', { timeout: 20_000 });
  await page.waitForTimeout(600);
  const confirmed = path.join(shots, 'live-confirmed.png');
  await page.screenshot({ path: confirmed });

  await compare(page, 'live-idle', 'LiveIdle.dc.html', idle, 1440, false);
  await compare(page, 'live-reasoning', 'LiveReasoning.dc.html', reasoning, 1440, false);
  await compare(page, 'live-question', 'LiveQuestion.dc.html', question, 1440, false);
  await compare(page, 'live-confirmed', 'LiveConfirmed.dc.html', confirmed, 1440, false);
});
