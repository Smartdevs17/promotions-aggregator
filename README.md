# Promotions Aggregator

A production-style, single-mall promotions pipeline for The Promenade Shops at Briargate. It scrapes and enriches promotions asynchronously, persists them in PostgreSQL, verifies them against the live source, and serves a small reviewer-friendly Next.js UI.

## Quick start

Prerequisites: Docker with Compose, and Node.js/pnpm for host-side development and tests.

```bash
pnpm install --frozen-lockfile
docker compose up --build
```

Open [the UI](http://localhost:3000), [the API](http://localhost:4000), or [API docs](http://localhost:4000/docs). The Compose stack starts PostgreSQL, Redis, migrations, the API, an independent Playwright worker, and the web application.

In the UI, click **Run scrape**, wait for the asynchronous run panel to complete, browse/search/filter the persisted promotions, then click **Verify data** to inspect verification status and any source-backed discrepancies. The equivalent API operations are `POST /scrape` and `POST /verify`.

## Configuration

Copy `.env.example` for host-side development. The important variables are:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `SOURCE_PORTAL_URL`: the mall sales listing
- `NEXT_PUBLIC_API_URL`: browser-facing API URL; this is embedded at web build time (Compose uses `http://localhost:4000`)

## Development and tests

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:db
pnpm test:e2e
```

For host-side web development, start the backend services/API and run `NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @promotions/web dev`. Playwright E2E starts the web app automatically when one is not already running; the browser tests use realistic intercepted API contracts for deterministic interaction coverage. The Docker-backed UI flow should also be checked with `docker compose up --build`.

## Architecture notes

The browser never scrapes directly. It calls the Express API, which creates durable run records and enqueues BullMQ jobs; the separate worker runs Playwright, persists idempotently, and updates progress. Brand metadata is joined into promotion responses and exposed in group-by-brand mode.

The source can mutate the content assigned to a stable `/deals/{id}` URL. Verification intentionally reports meaningful changes instead of treating them as a transport failure. Fields unavailable at the source remain `null` (or `{}` for social links); see [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) and [`DESIGN.md`](./DESIGN.md) for the detailed decisions.
