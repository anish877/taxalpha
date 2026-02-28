import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function SignUpPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { pushToast } = useToast();

  const [name, setName] = useState('');
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

    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = 'Name is required.';
    }

    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    }

    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setSubmitting(false);
      return;
    }

    try {
      await signUp({
        name: name.trim(),
        email: email.trim(),
        password
      });

      pushToast('Account created successfully.');
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to create account right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      subtitle="Create your advisor workspace and start onboarding clients."
      switchLabel="Already have an account?"
      switchText="Sign in"
      switchTo="/signin"
      title="Create Account"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm text-mute">Full Name</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
            placeholder="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name && <p className="mt-2 text-xs text-black">{fieldErrors.name}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-mute">Email</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
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
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
            placeholder="At least 8 characters"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fieldErrors.password && <p className="mt-2 text-xs text-black">{fieldErrors.password}</p>}
        </label>

        {error && <p className="rounded-xl border border-black/15 bg-black px-3 py-2 text-sm text-white">{error}</p>}

        <button
          className="w-full rounded-full bg-accent px-4 py-3 text-sm uppercase tracking-[0.18em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
    </AuthShell>
  );
}
