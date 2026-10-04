import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E } from '../playwright.config';

export const auth = { Authorization: `Bearer ${E2E.apiKey}` };

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E.email);
  await page.getByLabel('Password').fill(E2E.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/app\/live/);
}

/** One patient with a little remembered context. Idempotent per run. */
export async function seedPatient(request: APIRequestContext): Promise<{ id: string }> {
  const list = await (await request.get('/v1/me', { headers: auth })).json();
  const existing = list.data.patients.find(
    (p: { displayName: string }) => p.displayName === 'Mohan Lal Sharma',
  );
  if (existing) return existing;
  const u = await (
    await request.post('/v1/users', {
      headers: auth,
      data: { displayName: 'Mohan Lal Sharma', caregiverName: 'Ramesh' },
    })
  ).json();
  const id: string = u.data.id;
  await request.post('/v1/simulate/segments', {
    headers: auth,
    data: {
      userId: id,
      sessionId: 'e2e-ambient',
      segments: [
        { text: 'Ramesh said he will pay the water bill on Friday.', isUser: false, speaker: 'Sunita' },
        { text: 'Priya is coming on Sunday, she is bringing sweets.', isUser: false, speaker: 'Ramesh' },
      ],
    },
  });
  await expect
    .poll(
      async () =>
        (await (await request.get(`/v1/memory?userId=${id}`, { headers: auth })).json()).data.length,
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  return { id };
}
