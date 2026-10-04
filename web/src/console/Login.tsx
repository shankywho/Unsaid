import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { client, errMessage, unwrap } from '../api/client';
import { Button, Wordmark, inputClass } from '../design/primitives';
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

  return (
    <main className="grain relative grid min-h-screen place-items-center bg-canvas px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[700px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(94,234,212,0.07),transparent)]"
      />
      <Reveal className="relative flex w-full max-w-[360px] flex-col items-center">
        <Link to="/" aria-label="Unsaid home" className="mb-8">
          <Wordmark size={28} />
        </Link>
        <div className="w-full rounded-[10px] border border-line-strong bg-surface p-7">
          <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">Sign in</h1>
          <p className="mb-5 mt-1.5 text-[13px] text-muted">Console for caregivers and clinicians.</p>
          <form onSubmit={submit}>
            <label htmlFor="email" className="mb-1.5 block text-[13px] text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <label htmlFor="password" className="mb-1.5 mt-4 block text-[13px] text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && (
              <p role="alert" className="mt-4 rounded-[8px] border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger">
                Could not log in. {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-[12px] text-faint">Unsaid is a communication aid, not a medical device.</p>
      </Reveal>
    </main>
  );
}
