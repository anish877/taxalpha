import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    if (!email.trim()) {
      setFieldErrors({ email: 'Email is required.' });
      setSubmitting(false);
      return;
    }

    if (!password) {
      setFieldErrors({ password: 'Password is required.' });
      setSubmitting(false);
      return;
    }

    try {
      await signIn({
        email: email.trim(),
        password
      });

      pushToast('Signed in successfully.');
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to sign in right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      subtitle="Sign in to continue managing investor onboarding."
      switchLabel="New here?"
      switchText="Create account"
      switchTo="/signup"
      title="Sign In"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm text-mute">Email</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light text-ink outline-none ring-black transition focus:border-black focus:ring-1"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fieldErrors.email && <p className="mt-2 text-xs text-black">{fieldErrors.email}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-mute">Password</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light text-ink outline-none ring-black transition focus:border-black focus:ring-1"
            placeholder="Your password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fieldErrors.password && <p className="mt-2 text-xs text-black">{fieldErrors.password}</p>}
        </label>

        {error && <p className="rounded-xl border border-black/15 bg-black px-3 py-2 text-sm text-white">{error}</p>}

        <button
          className="w-full rounded-full bg-black px-4 py-3 text-sm uppercase tracking-[0.18em] text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/50"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </AuthShell>
  );
}
