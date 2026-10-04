// Records a silent, paced walkthrough of the whole product (landing -> console) for a voice-over.
// Run with the app up:  node web/scripts/record-demo.mjs [baseUrl]   (default http://localhost:8080)
// Output: web/demo-video/unsaid-demo.webm (1440x900). Uses the real backend, so the reasoning takes real time.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../demo-video');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
  reducedMotion: 'no-preference',
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// a visible cursor, since screen recordings from the browser do not draw one
await page.addInitScript(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.style.cssText =
      'position:fixed;z-index:2147483647;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(10,10,11,.7),0 2px 10px rgba(0,0,0,.5);pointer-events:none;transition:transform 60ms linear';
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => {
      c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
    });
  };
  if (document.readyState !== 'loading') mk();
  else document.addEventListener('DOMContentLoaded', mk);
});

let mx = 720;
async function moveTo(x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
  mx = x;
}
async function pointAt(loc, dy = 0) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('not visible');
  await moveTo(b.x + b.width / 2, b.y + b.height / 2 + dy);
}
async function click(loc) {
  await loc.scrollIntoViewIfNeeded();
  await pointAt(loc);
  await wait(250);
  await page.mouse.down();
  await wait(70);
  await page.mouse.up();
}
async function glide(toY, ms = 3000) {
  const from = await page.evaluate(() => window.scrollY);
  const n = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), from + (toY - from) * e);
    await page.waitForTimeout(16);
  }
}
const section = async (sel) =>
  (await page
    .locator(sel)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY)) - 90;

/* ---------------- 1. Landing ---------------- */
await moveTo(720, 460, 1);
await page.goto(base + '/', { waitUntil: 'networkidle' });
await wait(1500);
// the hero demo loop restarts a few seconds after load; let it play through once
await wait(10800);
await glide(await section('#how'), 2500);
await wait(1800);
for (const y of [0.25, 0.5, 0.75]) {
  const h = await page.evaluate(() => document.querySelector('#how').getBoundingClientRect().height);
  await glide((await section('#how')) + h * y, 3000);
  await wait(2500);
}
await glide(
  (await page.evaluate(
    () => document.querySelector('#how').getBoundingClientRect().bottom + window.scrollY,
  )) - 60,
  2500,
);
await wait(2850); // private by design
await glide(await section('#results'), 2500);
await wait(4300);
await glide(await section('#faq'), 2500);
await wait(2500);
await glide(0, 2500);
await wait(1500);

/* ---------------- 2. Console: idle ---------------- */
await click(page.getByRole('link', { name: 'Open console' }).first());
await page.waitForURL(/\/app\/live/);
await page.getByTestId('conversation-idle').waitFor();
await wait(3600);
await pointAt(page.getByRole('region', { name: 'Transcript' }), -100);
await wait(2150);
await pointAt(page.getByRole('region', { name: 'Reasoning' }), -150);
await wait(2500);

/* ---------------- 3. First fragment: confirmed on the first question ---------------- */
async function speak(fragment) {
  const input = page.getByLabel('Simulate a fragment of speech');
  await click(input);
  await wait(400);
  await page.keyboard.type(fragment, { delay: 95 });
  await wait(900);
  await click(page.getByRole('button', { name: 'Send fragment' }));
}
await speak('Sunday… Priya… cake… no');
await page.getByRole('status', { name: 'Working out a question' }).waitFor({ timeout: 15000 });
await wait(3600);
const yes = page.getByRole('button', { name: /^Yes/ });
await yes.waitFor({ timeout: 60000 });
// walk the eye through the facts and the ranked meanings while the question is on screen
const facts = page.locator('[data-fact-id]');
if ((await facts.count()) > 0) await pointAt(facts.first());
await wait(1800);
const hyp = page.getByRole('list', { name: 'Ranked meanings' });
if (await hyp.count()) await pointAt(hyp.first(), -40);
await wait(2500);
await moveTo(1200, 500);
await wait(2850);
await click(yes);
await page.getByText('Spoken to caregiver').waitFor({ timeout: 30000 });
await wait(1800);
await page.getByTestId('learn-followup').waitFor({ timeout: 30000 });
await wait(5000);

/* ---------------- 4. Second fragment: "No" moves to the next meaning ---------------- */
await speak('water… Ramesh… bill');
await yes.waitFor({ timeout: 70000 });
await wait(3600);
const no = page.getByRole('button', { name: /^No/ });
await click(no);
await page.getByText('Question 2 of 3', { exact: true }).waitFor({ timeout: 40000 });
await wait(3200);
await click(yes);
await page.getByText('Spoken to caregiver').waitFor({ timeout: 30000 });
await wait(4300);

/* ---------------- 5. Memory ---------------- */
await click(page.getByRole('link', { name: 'Memory' }));
await page.getByRole('heading', { name: 'Memory', level: 1 }).waitFor();
await wait(2850);
await glide(500, 3000);
await wait(1800);
await glide(0, 1500);
const search = page.getByLabel('Search memory');
await click(search);
await page.keyboard.type('water bill', { delay: 110 });
await page.keyboard.press('Enter');
await wait(3200);
await search.fill('');
await page.keyboard.press('Enter');
await wait(1500);
// show the privacy controls (without deleting anything)
await click(page.getByRole('button', { name: 'Purge all' }));
const dlg = page.getByRole('dialog');
await dlg.waitFor();
await wait(1800);
await click(dlg.getByLabel('Type PURGE to confirm'));
await page.keyboard.type('PURGE', { delay: 150 });
await wait(2150);
await click(dlg.getByRole('button', { name: 'Cancel' }));
await wait(1500);

/* ---------------- 6. Word map ---------------- */
await click(page.getByRole('link', { name: 'Word map' }));
await page.getByRole('heading', { name: 'Word map', level: 1 }).waitFor();
await wait(4650);

/* ---------------- 7. Runs and a trace ---------------- */
await click(page.getByRole('link', { name: 'Runs' }));
await page.getByRole('heading', { name: 'Runs', level: 1 }).waitFor();
await wait(2500);
await click(page.getByRole('button', { name: 'Learn' }));
await wait(1800);
await click(page.getByRole('button', { name: 'Assist' }));
await wait(1500);
await click(page.getByRole('link', { name: /ASSIST/ }).first());
await page.getByRole('list', { name: 'Reasoning steps' }).waitFor();
await wait(2850);
await glide(450, 3000);
await wait(2850);

/* ---------------- 8. Eval ---------------- */
await click(page.getByRole('link', { name: 'Eval' }));
await page.getByRole('heading', { name: 'Eval', level: 1 }).waitFor();
await wait(4300);
await glide(420, 3000);
await wait(3600);

/* ---------------- 9. Back to Live, end ---------------- */
await click(page.getByRole('link', { name: 'Live' }));
await wait(2850);

const video = page.video();
await ctx.close();
await browser.close();
const file = path.join(out, 'unsaid-demo.webm');
fs.renameSync(await video.path(), file);
console.log('saved', file);
