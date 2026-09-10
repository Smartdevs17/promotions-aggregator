# Design

## Scope

This project implements the single-mall vertical slice described in the take-home brief: scrape real promotions from The Promenade Shops at Briargate, enrich them with brand metadata from the same portal, persist the result, serve it through a typed REST API, verify persisted records against the live source, and provide a small browser UI.

The design deliberately optimizes for reliability, inspectability, and a clean local developer experience rather than a premature multi-portal abstraction.

## Architecture

The repository is a pnpm workspace with three applications and shared packages:

- `apps/api`: Express REST API. It validates requests, reads persisted data, and enqueues scrape/verification work. It never performs a scrape inline.
- `apps/worker`: BullMQ workers for scrape and verification jobs.
- `apps/web`: Next.js UI.
- `packages/shared`: runtime schemas and TypeScript contracts shared by scraper, queue payloads, API, and UI.
- `packages/database`: Sequelize models, migrations, repositories, and PostgreSQL connection.
- `packages/scraper`: source-specific extraction, normalization, enrichment, politeness, and comparison helpers.

PostgreSQL stores domain data and durable run/report metadata. Redis is used by BullMQ. Docker Compose runs the web app, API, worker, PostgreSQL, and Redis.

## Scraping approach

The source is intentionally treated as a real external dependency rather than stable HTML. The scraper will use Playwright for browser-grade navigation where required by redirects/client behaviour and Cheerio for deterministic HTML extraction where practical. The promotions listing is discovered first, promotion detail pages are traversed when fields are missing, and brand directory/detail pages are stitched in to obtain website URL, hours, and social links.

A source adapter is intentionally specific to this mall. We avoid a generic multi-portal framework because it is a stated non-goal.

Scraping is polite: bounded concurrency, a small delay between source requests, an identifiable user agent, request timeouts, and a shared request budget for scrape and verification jobs. We will inspect robots.txt and document any relevant discovery in `ASSUMPTIONS.md`.

## Data model

Brands are normalized because many promotions can belong to one brand and brand metadata changes independently. A promotion references one brand.

A promotion has an internal UUID plus a deterministic `sourceKey`. The source key prefers a stable source identifier when available; otherwise it is derived from the canonical promotion URL. A uniqueness constraint on `(sourcePortal, sourceKey)` makes re-scrapes idempotent.

Core entities:

- `Brand`: name, normalized name, source URL, external website URL, hours, social links, scrape timestamps.
- `Promotion`: source key, name, description, image URL, optional start/end dates, canonical URL, source portal, brand ID, scraped/verified timestamps and verification status.
- `ScrapeRun`: BullMQ job ID, state, attempted/persisted/updated/skipped/failed counts, timing, error summary, and source-health information.
- `VerificationRun`: BullMQ job ID, state, timing, clean/discrepancy counts, and errors.
- `VerificationDiscrepancy`: promotion, kind, field, normalized before/after values, and verification failure reason where applicable.

Missing scalar source data is represented as `null`; missing collections such as social links are `[]`. The shared runtime schemas enforce this consistently.

## Queue and run health

`POST /scrape` and `POST /verify` enqueue BullMQ jobs and immediately return identifiers. Workers are separate from the API process. Jobs use bounded attempts, exponential backoff, timeouts, structured failure logging, and durable run rows so job history remains queryable independently of Redis retention.

Run health is a first-class concern. A technically successful request that extracts zero promotions is not silently accepted: it is marked suspicious when the source page was reachable but expected structures/data disappeared. Parser invariants distinguish a legitimate empty result from likely selector/source drift. Structured logs include `jobId`, `runId`, stage, and source URL.

The API exposes `/health` for API/PostgreSQL/Redis readiness. Worker failures never terminate the API.

## Verification

Verification revisits persisted canonical source records and compares meaningful normalized values with stored values. It reports:

- records no longer present at the source;
- changed meaningful fields with before/after values;
- records that could not be verified and a concrete reason;
- an explicit clean result when no discrepancies exist.

Comparison normalization removes irrelevant whitespace and equivalent URL formatting. Image CDN query-string churn is ignored unless the meaningful image identity changes. Dates, names, descriptions, canonical URLs, and relevant brand association/metadata changes are meaningful.

For this single-mall MVP, verification covers all persisted promotions. The data set is expected to be small enough that complete verification provides a stronger correctness signal than sampling while still respecting the shared source-request budget.

## API and type safety

Request query parameters are runtime-validated. `GET /promotions` supports search, startDate, endDate, brand, page, and pageSize. `GET /brands` includes promotion counts and scraped brand metadata. Job/report endpoints use shared contracts.

Shared schemas are the source of truth for DTOs and queue payloads. `any` is prohibited unless an integration boundary genuinely requires it and the reason is documented locally.

OpenAPI documentation is generated/exposed for reviewer discoverability, while the shared package remains the application-level type contract.

## UI

The Next.js UI provides promotion cards, keyword search, filtering, page-number pagination, and list/group-by-brand modes. Grouped sections expose website, hours, and social links. A compact run-health surface shows the most recent scrape/verification state and flags suspicious/failed runs without turning the exercise into an admin product.

## Testing

Backend tests use Vitest and Supertest for validation, filtering/pagination, job-enqueue semantics, persistence behaviour, idempotency, verification comparison, and failure paths. Scraper parsing uses saved HTML fixtures so selector behaviour can be tested deterministically without repeatedly hitting the live portal.

Playwright E2E covers the reviewer-critical UI journey: render promotions, search/filter, paginate, switch to group-by-brand, and surface source links/run health. Live-source smoke checks remain separate from deterministic automated tests.

## Failure modes anticipated

- Source redirects or rejects naive HTTP clients.
- Listing/detail selectors change and extraction returns zero records.
- One malformed promotion or brand page fails while others are valid.
- Brand enrichment is partially unavailable.
- Redis becomes unavailable while API reads should remain safe.
- A worker dies mid-job.
- Re-scraping produces duplicate records.
- Cosmetic source changes create false verification discrepancies.

Each is made visible through validation, per-record failure counts, run state, structured logs, retries where safe, and explicit verification/source-health results.

## Time-box decisions

We will not build authentication, automated scheduling, a generic portal framework, distributed tracing infrastructure, or a large design system. If time remains after all acceptance criteria and tests pass, additional observability can be added without changing the core architecture.
