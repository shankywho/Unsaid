import { test, expect } from '@playwright/test';
import { E2E } from '../playwright.config';
import { auth, login, seedPatient } from './helpers';

test.describe.configure({ mode: 'serial' });

test('unauthenticated /app redirects to login', async ({ page }) => {
  await page.goto('/app/live');
  await expect(page).toHaveURL(/\/login/);
});

test('login rejects a wrong password with an explanation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E.email);
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid email or password');
});

test('login → fragment → trace animates → YES → resolved sentence', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);

  await expect(page.getByRole('combobox', { name: 'Patient' })).toContainText('Mohan Lal Sharma');
  await expect(page.getByText('Connected: events arrive as they happen')).toBeVisible();

  await page.getByLabel('Simulate a fragment of speech').fill('water… Ramesh… bill');
  await page.getByRole('button', { name: 'Send fragment' }).click();

  // reasoning steps arrive over SSE
  const steps = page.getByRole('list', { name: 'Reasoning steps' });
  await expect(steps).toBeVisible();
  await expect(steps.getByText('Reading the fragment')).toBeVisible();
  await expect(steps.getByText('Collecting related memories')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Possible meanings' })).toBeVisible({ timeout: 20_000 });

  // the question + YES/NO
  const yes = page.getByRole('button', { name: /^Yes/ });
  await expect(yes).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('announcer')).toContainText('Question 1 of 3');
  await yes.click();

  // resolved sentence in the serif style, spoken to caregiver
  await expect(page.getByText('Spoken to caregiver')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('announcer')).toContainText('Confirmed.');
  // the run shows up in Runs and the learned sentence in the word map
  await page.getByRole('link', { name: 'Runs' }).click();
  await expect(page.getByText('water… Ramesh… bill').first()).toBeVisible();
  await page.getByRole('link', { name: 'Word map' }).click();
  await expect(page.getByText('Confirmed sentences')).toBeVisible({ timeout: 20_000 });
});

test('keyboard: N advances to the next meaning, Y confirms', async ({ page, request }) => {
  await seedPatient(request);
  await login(page);
  await page.getByLabel('Simulate a fragment of speech').fill('Sunday… Priya… cake… no');
  await page.getByRole('button', { name: 'Send fragment' }).click();
  await expect(page.getByText(/^question 1 of 3$/)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('n');
  await expect(page.getByText(/^question 2 of 3$/)).toBeVisible({ timeout: 10_000 });
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
  await page.getByRole('button', { name: 'Erase all memory…' }).click();
  const purge = page.getByRole('dialog');
  const confirm = purge.getByRole('button', { name: 'Erase everything' });
  await expect(confirm).toBeDisabled();
  await purge.getByLabel('Type erase').fill('erase');
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
  await expect(page.getByText('Skipped: memory is switched off for this patient').first()).toBeVisible({
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
