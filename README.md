# Promotions Aggregator

A production-style, single-mall promotions pipeline for The Promenade Shops at Briargate. It scrapes and enriches promotions asynchronously, persists them in PostgreSQL, verifies them against the live source, and serves a reviewer-friendly Next.js UI.

## Quick start

Prerequisite: Docker with Docker Compose. Node.js and pnpm are only needed for host-side development/tests.

```bash
docker compose up --build
```

Then open:

- UI: http://localhost:3000
- API: http://localhost:4000
- API docs: http://localhost:4000/docs
- OpenAPI JSON: http://localhost:4000/openapi.json

The Compose stack starts PostgreSQL, Redis, migrations, the Express API, an independent Playwright worker, and the Next.js web application.

### Simple pnpm commands

For the complete local development stack, run this one command from the repository root:

```bash
pnpm dev:local
```

It starts PostgreSQL and Redis, runs migrations, then starts the API, worker, and Next.js frontend in parallel. Open http://localhost:3000.

To start only the backend services:

```bash
pnpm dev:backend
```

Then, in another terminal, start the frontend:

```bash
pnpm dev:frontend
```

For the production-like all-in-Docker path:

```bash
pnpm dev:docker
```

Stop local containers with `pnpm infra:down`. Use `pnpm infra:reset` only when you intentionally want to delete the local database volume.

### Reviewer flow

1. Open the UI.
2. Click **Run scrape**. The request returns immediately and BullMQ processes the live scrape in the worker.
3. Wait for the run-health panel to reach a terminal state.
4. Browse, search, filter, paginate, and switch to **Group by brand**.
5. Inspect brand hours/website metadata and canonical source links.
6. Click **Verify data** and inspect verification status/discrepancies.

Equivalent API triggers are `POST /scrape` and `POST /verify`.

### Hosted assessment demo

The current hosted demo uses the same public API and frontend:

- UI: https://promotions-aggregator-web.vercel.app
- API: https://promotions-aggregator-api.onrender.com
- API health: https://promotions-aggregator-api.onrender.com/health

The Neon database is pre-populated with real scraped promotions. For a no-cost
demo, the API and UI remain hosted while the BullMQ worker can be run locally
with the project's Neon and Upstash environment variables. Existing data stays
available when the local worker is stopped; new scrape or verify jobs require
the worker to be running.

## API

The required endpoints are:

- `GET /health`
- `GET /promotions?search=&startDate=&endDate=&brand=&page=&pageSize=`
- `GET /promotions/:id`
- `GET /brands`
- `POST /scrape`
- `GET /scrape/:jobId`
- `POST /verify`
- `GET /verify/:runId`

Read requests are runtime-validated and typed through shared Zod contracts. Scrape and verification triggers never execute source work inline.

## Configuration

Copy `.env.example` for host-side development. Important variables include:

- `DATABASE_URL` — PostgreSQL connection string
- `TEST_DATABASE_URL` — integration-test database
- `REDIS_URL` — Redis connection string
- `SOURCE_PORTAL_URL` — mall promotions listing
- `SCRAPER_USER_AGENT` — scraper user agent
- `SCRAPER_REQUEST_DELAY_MS` — source-request delay
- `SCRAPER_CONCURRENCY` — bounded scraper concurrency
- `JOB_TIMEOUT_MS` — worker execution timeout
- `QUEUE_SUBMISSION_TIMEOUT_MS` — API queue submission timeout
- `NEXT_PUBLIC_API_URL` — browser-facing API URL embedded into the web build

Compose configures the browser-facing API as `http://localhost:4000`.

## Development and tests

Install workspace dependencies:

```bash
pnpm install --frozen-lockfile
```

Then run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:db
pnpm test:e2e
```

For host-side web development, start the backend services/API and run:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @promotions/web dev
```

Playwright E2E uses realistic intercepted API responses for deterministic interaction coverage. The complete Docker-backed flow has also been validated separately against the live mall source.

## Architecture

```text
Browser / Next.js
       |
       v
   Express API
       |
       +---- PostgreSQL (reads + durable run metadata)
       |
       v
   Redis / BullMQ
       |
       v
 Separate Worker
       |
       v
 Playwright + parser
       |
       v
 Live mall portal
```

The worker persists normalized brands/promotions back to PostgreSQL. Verification re-crawls the live source and compares meaningful normalized values with persisted records.

See `DESIGN.md` for implementation decisions, `ASSUMPTIONS.md` for source discoveries/ambiguities, and `docs/ASSESSMENT_AUDIT.md` for an acceptance-criteria map.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Source behavior and limitations

- The project intentionally supports one mall portal only.
- Brand website and opening-hours metadata are populated where the tenant pages expose them.
- The inspected tenant pages did not expose tenant-specific social links, so `socialLinks` remains `{}` instead of incorrectly inheriting mall-wide footer links.
- Promotion validity dates are currently not exposed as reliable machine-readable dates, so unavailable dates remain `null`.
- The portal can mutate promotion/tenant content behind a stable `/deals/{id}` URL. Verification intentionally surfaces these source-backed semantic changes, so a successful verification run can legitimately be non-clean.
- Group-by-brand operates over the currently paginated result set.
- Authentication, production deployment, automated scheduling, and a generic multi-source framework are deliberate non-goals for this take-home.
