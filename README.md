# TaxAlpha V1

Monorepo containing:

- `frontend`: React + TypeScript + Vite + Tailwind
- `backend`: Node.js + Express + Prisma + Neon/Postgres

## Quick Start

1. Install dependencies

```bash
pnpm install
```

2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Generate Prisma client and run migrations

```bash
pnpm --filter @taxalpha/backend prisma:generate
pnpm --filter @taxalpha/backend prisma:migrate
pnpm --filter @taxalpha/backend prisma:seed
```

4. Run apps

```bash
pnpm dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Test

```bash
pnpm test
```

## Implemented Scope

- Landing page
- Sign up / sign in / sign out
- Protected dashboard
- Create client 3-step drawer flow
- Prisma-backed models for users, brokers, clients, forms, and selections
- Seeded 5-form catalog
- Backend + frontend critical-path tests
