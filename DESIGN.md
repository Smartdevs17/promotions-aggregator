# Design

## Scope

This project implements the single-mall vertical slice described in the take-home brief: scrape real promotions from The Promenade Shops at Briargate, enrich them with brand metadata from the same portal, persist the result, serve it through a typed REST API, verify persisted records against the live source, and provide a small browser UI.

The design deliberately optimizes for reliability, inspectability, and a clean local developer experience rather than a premature multi-portal abstraction.

## Architecture

The repository is a pnpm workspace with three applications and shared packages:

- `apps/api`: Express REST API. It validates requests, reads persisted data, and enqueues scrape/verification work. It never performs a scrape inline.
- `apps/worker`: BullMQ workers for scrape and verification jobs.
- `apps/web`: Next.js UI.
- `packages/shared`: runtime schemas and TypeScript contracts shared across API/UI/job boundaries.
- `packages/database`: Sequelize models, migrations, and PostgreSQL connection.
- `packages/scraper`: source-specific extraction, normalization, enrichment, politeness, and comparison helpers.

PostgreSQL stores domain data and durable run/report metadata. Redis is used by BullMQ. Docker Compose runs the web app, API, worker, migration step, PostgreSQL, and Redis.

## Scraping approach

The source is intentionally treated as a real external dependency rather than stable HTML. The scraper uses Playwright for browser-grade navigation and redirect handling, with Cheerio for deterministic HTML extraction. It discovers promotion detail URLs from the sales listing, traverses promotion pages, follows tenant/store links, and stitches website/hours metadata into each promotion's normalized brand record.

A source adapter is intentionally specific to this mall. We avoid a generic multi-portal framework because it is a stated non-goal.

Scraping uses bounded concurrency, request delays, an identifiable user agent, retries, and timeouts. Source behavior and the portal's `robots.txt` findings are documented in `ASSUMPTIONS.md`.

## Data model

Brands are normalized because many promotions can belong to one brand and brand metadata changes independently. A promotion references one brand.

A promotion has an internal UUID plus a deterministic `sourceKey`. The current source exposes a canonical `/deals/{id}` locator, so the normalized canonical URL is hashed into a stable source key. A uniqueness constraint on `(sourcePortal, sourceKey)` makes re-scrapes idempotent.

Core entities:

- `Brand`: name, normalized name, source URL, external website URL, hours, social links, scrape timestamps.
- `Promotion`: source key, name, description, image URL, optional start/end dates, canonical URL, source portal, brand ID, scraped/verified timestamps and verification status.
- `ScrapeRun`: BullMQ job ID, state, attempted/persisted/updated/skipped/failed counts, timing, error summary, and source-health information.
- `VerificationRun`: BullMQ job ID, state, timing, clean/discrepancy counts, and errors.
- `VerificationDiscrepancy`: promotion, kind, field, before/after values, and verification failure reason where applicable.

Missing scalar source data is represented as `null`; map-like collections such as `socialLinks` use `{}`. We do not invent missing source values.

## Queue and run health

`POST /scrape` and `POST /verify` enqueue BullMQ jobs and immediately return identifiers. Workers are separate from the API process. Jobs use bounded attempts, exponential backoff, a real configurable execution timeout, stalled-job handling, queue-submission timeout, and durable run rows so job history remains queryable independently of Redis retention.

Run health is a first-class concern. A technically reachable source that produces suspicious zero extraction is not silently accepted as success. Durable status records expose counts, source health, timestamps, and actionable errors. Worker failures do not terminate the API process.

The API exposes `/health` for API/PostgreSQL/Redis readiness.

## Verification

Verification re-scrapes the source and compares persisted promotions against the current live records. It reports:

- records no longer present at the source;
- changed meaningful fields with before/after values;
- records that could not be verified and a concrete reason;
- an explicit clean result when no discrepancies exist.

Comparison normalization removes irrelevant whitespace and equivalent URL formatting. Image CDN query-string churn is ignored unless the meaningful image identity changes. Dates, names, descriptions, canonical URLs, and relevant brand association/metadata changes remain meaningful.

For this single-mall MVP, verification covers all persisted promotions. The live investigation confirmed that the portal can mutate tenant/promotion content while retaining the same `/deals/{id}` URL, so a successful verification run may legitimately be non-clean. Those source-backed semantic changes are intentionally surfaced rather than masked.

## API and type safety

Request query parameters are runtime-validated. `GET /promotions` supports `search`, `startDate`, `endDate`, `brand`, `page`, and `pageSize`; `GET /promotions/:id` returns one promotion with its brand metadata; `GET /brands` includes promotion counts and scraped brand metadata. Job/report endpoints expose durable scrape and verification status.

Shared Zod schemas and inferred TypeScript types are the source of truth for application DTOs. `any` is avoided unless an integration boundary genuinely requires it and the reason is documented locally.

OpenAPI is exposed at `/openapi.json`, with a lightweight discoverability page at `/docs`.

## UI

The Next.js UI provides promotion cards, keyword search, brand filtering, pagination, and flat/group-by-brand modes. Grouped sections expose brand website and hours when available. A compact run-health surface shows scrape/verification state, counts, source health, discrepancies, and failures without turning the exercise into an admin product.

The grouped view operates on the current paginated result set, which is a deliberate MVP tradeoff.

## Testing

Backend tests use Vitest and Supertest for validation, filtering/pagination, job-enqueue semantics, persistence behaviour, idempotency, verification comparison, and failure paths. Database integration tests run against real PostgreSQL. Scraper parsing uses saved sanitized HTML fixtures so selector behaviour can be tested deterministically without repeatedly hitting the live portal.

Playwright E2E covers the reviewer-critical UI journey: render promotions, search/filter, paginate, switch to group-by-brand, surface source links, and exercise scrape/verification run-health UX. Deterministic browser tests use API interception, while the complete Docker-backed browser → API → Redis → worker → live source → PostgreSQL → UI path was separately validated.

## Failure modes exercised

- Source redirects and browser-grade navigation requirements.
- Listing/detail selector drift and suspicious extraction.
- Partial promotion/brand failures.
- Redis unavailable during queue submission.
- PostgreSQL unavailable during health checks.
- Worker execution timeout/stalled-job handling.
- Worker independence from API lifetime.
- Re-scrape duplicate prevention.
- Cosmetic verification noise normalization.
- Real source content mutation behind stable canonical URLs.

## Time-box decisions

We do not build authentication, automated scheduling, a generic portal framework, distributed tracing infrastructure, or a large design system. These are deliberate cuts so the implementation stays focused on the required reliable single-source pipeline.
