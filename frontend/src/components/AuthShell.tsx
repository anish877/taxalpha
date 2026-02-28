import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  switchLabel: string;
  switchTo: string;
  switchText: string;
}

export function AuthShell({
  title,
  subtitle,
  children,
  switchLabel,
  switchTo,
  switchText
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-fog px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-black/10 bg-paper shadow-panel lg:grid-cols-[1.2fr_1fr]">
          <section className="hidden bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.28),rgba(0,0,0,1)_58%)] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">TaxAlpha</p>
              <h1 className="mt-4 text-4xl font-light leading-tight tracking-tight">
                Investor onboarding, built for thoughtful advisors.
              </h1>
            </div>
            <p className="text-sm text-white/70">
              Minimal, secure, and focused workflows for client intake and document preparation.
            </p>
          </section>
          <section className="px-6 py-8 sm:px-10 sm:py-12">
            <h2 className="text-2xl font-light tracking-tight text-ink">{title}</h2>
            <p className="mt-2 text-sm text-mute">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <p className="mt-6 text-sm text-mute">
              {switchLabel}{' '}
              <Link className="text-accent underline underline-offset-4" to={switchTo}>
                {switchText}
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
