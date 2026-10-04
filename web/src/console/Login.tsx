import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { client, errMessage, unwrap } from '../api/client';
import { Button, Fragment, Resolved } from '../design/primitives';
import { ErrorState } from '../design/feedback';
import { Reveal } from '../design/motion';

export function Login() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unwrap(client.POST('/auth/login', { body: { email, password } }));
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav('/app/live', { replace: true });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field =
    'h-12 w-full rounded-[12px] border border-border-strong bg-canvas px-4 text-[16px] text-ink placeholder:text-muted';
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <Reveal className="w-full max-w-sm">
        <Link to="/" className="mb-8 block font-serif text-[28px] text-ink">
          Unsaid
        </Link>
        <div className="rounded-[14px] border border-border bg-canvas p-6">
          <Fragment className="block">log… in…</Fragment>
          <Resolved size="md" as="h1" className="mb-5 mt-1">
            Open the console
          </Resolved>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[14px] font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-[14px] font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
              />
            </div>
            {error && (
              <ErrorState
                title="Could not log in"
                detail={error}
                fix="Check the demo email and password set on the server."
              />
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-[14px] text-muted">
          Unsaid is a communication aid, not a medical device.
        </p>
      </Reveal>
    </main>
  );
}
