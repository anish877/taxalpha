import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-fog">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(29,78,216,0.15),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.9),transparent_30%)]" />

      <div className="relative flex min-h-screen w-full flex-col justify-between border-black/10 bg-paper/95 px-6 py-8 shadow-panel backdrop-blur-sm sm:px-10 sm:py-10">
        <header className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.25em] text-mute">TaxAlpha</p>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-accent hover:text-accent"
              to="/signin"
            >
              Sign In
            </Link>
            <Link
              className="rounded-full bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90"
              to="/signup"
            >
              Sign Up
            </Link>
          </div>
        </header>

        <section className="max-w-3xl py-14 sm:py-24">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Investor Intake, Simplified</p>
          <h1 className="mt-6 text-4xl font-light leading-[1.06] tracking-tight text-ink sm:text-6xl">
            Investor onboarding workspace
          </h1>
          <p className="mt-6 max-w-2xl text-base font-light leading-relaxed text-mute sm:text-lg">
            Build clients, assign brokers, and progress onboarding one thoughtful step at a time.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.16em] text-white transition hover:bg-accent/90"
              to="/signup"
            >
              Start Workspace
            </Link>
            <Link
              className="rounded-full border border-line px-6 py-3 text-sm uppercase tracking-[0.16em] text-ink transition hover:border-accent hover:text-accent"
              to="/signin"
            >
              Existing Account
            </Link>
          </div>
        </section>

        <footer className="border-t border-line pt-6 text-xs uppercase tracking-[0.18em] text-mute">
          Clean workflows. Minimal surface. Reliable data capture.
        </footer>
      </div>
    </main>
  );
}


