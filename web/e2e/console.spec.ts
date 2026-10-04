import { test, expect } from '@playwright/test';
import { E2E } from '../playwright.config';
import { auth, login, seedPatient } from './helpers';

test.describe.configure({ mode: 'serial' });

test('the console opens directly, with no sign-in', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/app\/live/);
  await expect(page.getByRole('navigation', { name: 'Console' })).toBeVisible();
});

test('login → fragment → trace animates → YES → resolved sentence', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);

  await expect(page.getByRole('button', { name: 'Patient' })).toContainText('Mohan Lal Sharma');
  // idle state, then connection state lives in the Omi chip (no banner)
  await expect(page.getByTestId('conversation-idle')).toContainText('Mohan Lal Sharma');
  await expect(page.getByText(/Omi live|Simulated|Omi offline/).first()).toBeVisible();

  await page.getByLabel('Simulate a fragment of speech').fill('water… Ramesh… bill');
  await page.getByRole('button', { name: 'Send fragment' }).click();

  // reasoning steps arrive over SSE
  const steps = page.getByRole('list', { name: 'Reasoning steps' });
  await expect(steps).toBeVisible();
  // the real DAG: an "in parallel" group first, then the sequential steps
  await expect(steps.getByText('In parallel')).toBeVisible();
  await expect(steps.getByText('Analyze fragment')).toBeVisible();
  await expect(steps.locator('[data-node="retrieve_memory"]')).toBeVisible({ timeout: 20_000 });
  await expect(steps.locator('[data-node="classify"]').getByText(/lyzr · /)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('list', { name: 'Ranked meanings' })).toBeVisible({ timeout: 20_000 });

  // the question + YES/NO
  const yes = page.getByRole('button', { name: /^Yes/ });
  await expect(yes).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('announcer')).toContainText('Question 1 of 3');
  await yes.click();

  // resolved sentence, spoken to caregiver; LEARN shows as a follow-up, not a step of the ASSIST trace
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('announcer')).toContainText('Confirmed.');
  await expect(page.getByTestId('learn-followup')).toContainText('LEARN');
  await expect(steps.locator('[data-node="learner"]')).toHaveCount(0);
  // the run shows up in Runs and the learned sentence in the word map
  await page.getByRole('link', { name: 'Runs' }).click();
  await expect(page.getByText('water… Ramesh… bill').first()).toBeVisible();
  await page.getByRole('link', { name: 'Word map' }).click();
  // LEARN runs after the answer; reload until the word map has the confirmed sentence
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('cell', { name: 'Sentence' }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test('keyboard: N advances to the next meaning, Y confirms', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  await page.getByLabel('Simulate a fragment of speech').fill('Sunday… Priya… cake… no');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.getByText('Question 1 of 3', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('n');
  await expect(page.getByText('Question 2 of 3', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('y');
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
});

test('memory: search, provenance, delete with confirmation', async ({ page, request }) => {
  const { id } = await seedPatient(request);
  await login(page);
  await page.getByRole('link', { name: 'Memory' }).click();
  await expect(page.getByRole('heading', { name: 'Memory', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Heard/).first()).toBeVisible({ timeout: 15_000 });

  const before = (await (await request.get(`/v1/memory?userId=${id}`, { headers: auth })).json()).data.length;
  await page
    .getByRole('button', { name: /^Delete memory:/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Delete this memory?');
  await dialog.getByRole('button', { name: 'Delete memory' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await (await request.get(`/v1/memory?userId=${id}`, { headers: auth })).json()).data.length,
    )
    .toBe(before - 1);

  // purge needs the typed word
  await page.getByRole('button', { name: 'Purge all' }).click();
  const purge = page.getByRole('dialog');
  const confirm = purge.getByRole('button', { name: 'Purge memory' });
  await expect(confirm).toBeDisabled();
  await purge.getByLabel('Type PURGE to confirm').fill('PURGE');
  await expect(confirm).toBeEnabled();
  await purge.getByRole('button', { name: 'Cancel' }).click();
});

test('context toggle turns retrieval off for the next fragment', async ({ page, request }) => {
  const { id } = await seedPatient(request);
  await login(page);
  const toggle = page.getByRole('switch', { name: 'Use personal memory' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect((await (await request.get(`/v1/users/${id}`, { headers: auth })).json()).data.contextEnabled).toBe(
    false,
  );

  await page.getByLabel('Simulate a fragment of speech').fill('tea… cup… morning');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.getByText('Skipped: memory is switched off').first()).toBeVisible({
    timeout: 20_000,
  });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('eval page renders the live report with provenance', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  await page.getByRole('link', { name: 'Eval' }).click();
  await expect(page.getByText('Live run', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Resolved within three yes/no questions' })).toBeVisible();
});

test('runs: trace detail shows steps with sponsor tags and a shared timeline', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  await page.getByRole('link', { name: 'Runs' }).click();
  await page
    .getByRole('link', { name: /ASSIST/ })
    .first()
    .click();
  await expect(page.getByRole('list', { name: 'Reasoning steps' })).toBeVisible();
  await expect(page.getByText(/qdrant · /).first()).toBeVisible();
  await expect(page.getByText(/lyzr · /).first()).toBeVisible();
});

test('empty, loading and error states for Memory', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  // error: the API fails; the screen explains and offers a retry
  await page.route('**/v1/memory?*', (r) =>
    r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'server_error', message: 'boom', requestId: 'r1' } }),
    }),
  );
  await page.getByRole('link', { name: 'Memory' }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t load memory');
  await page.unroute('**/v1/memory?*');
  // empty: no facts
  await page.route('**/v1/memory?*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Nothing remembered yet')).toBeVisible();
  await page.unroute('**/v1/memory?*');
  // loading: a skeleton with an accessible name while the request is in flight
  await page.route('**/v1/memory?*', async (r) => {
    await new Promise((res) => setTimeout(res, 800));
    await r.continue();
  });
  await page.reload();
  await expect(page.getByRole('status', { name: 'Loading memory' })).toBeVisible();
});

test('Live at 1024 collapses the sidebar to an icon rail', async ({ page, request }) => {
  await seedPatient(request);
  await page.setViewportSize({ width: 1024, height: 800 });
  await login(page);
  const sidebar = page.getByRole('navigation', { name: 'Console' });
  await expect(sidebar.getByRole('link', { name: 'Word map' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reasoning' })).toBeVisible();
  const w = await sidebar.evaluate((el) => el.closest('aside')!.getBoundingClientRect().width);
  expect(w).toBeLessThan(80);
});
