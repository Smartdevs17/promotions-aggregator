# Assessment Audit

This file maps the take-home requirements to the current implementation for final submission review.

## Functional requirements

- **FR1 – scrape listing/detail pages:** implemented in `packages/scraper` against The Promenade Shops at Briargate.
- **FR2 – brand enrichment:** implemented by traversing tenant/store detail pages and stitching website/hours metadata to promotions.
- **FR3 – persistent store:** PostgreSQL persists brands, promotions, scrape runs, verification runs, and discrepancies across restarts.
- **FR4 – `GET /promotions`:** supports `search`, `startDate`, `endDate`, `brand`, `page`, and `pageSize` with runtime validation and deterministic pagination.
- **FR5 – `GET /promotions/:id`:** implemented with joined brand metadata and 400/404 handling.
- **FR6 – `GET /brands`:** implemented with `promotionCount` and scraped brand metadata.
- **FR7 – `POST /scrape`:** enqueues BullMQ work and returns immediately with run/job identifiers.
- **FR8 – `GET /scrape/:jobId`:** returns durable state, counters, source health, timestamps, and errors.
- **FR9 – queue reliability:** bounded attempts, exponential backoff, execution timeout, stalled-job handling, and durable failure state.
- **FR10 – `POST /verify`:** enqueues verification as background work.
- **FR11 – `GET /verify/:runId`:** returns explicit clean/non-clean result plus promotion-level changed/missing discrepancies with before/after fields.
- **FR12 – UI list/search/filter/pagination:** implemented in Next.js.
- **FR13 – group-by-brand UI:** implemented with brand website/hours metadata and grouped promotions.
- **FR14 – shared types:** Zod schemas and inferred TypeScript contracts are shared across application boundaries.

## Non-functional requirements

- **Clean local startup:** `docker compose up --build` starts PostgreSQL, Redis, migrations, API, worker, and web.
- **Persistence:** PostgreSQL volume survives service restart.
- **Async execution:** scraping and verification run only in the worker, never inline in the API or browser.
- **Failure isolation:** worker/Redis/PostgreSQL failure behavior was exercised; API remains process-safe and health reports degradation where appropriate.
- **Type safety:** strict TypeScript; no deliberate `any` usage in application code.
- **Tests:** Vitest/Supertest unit coverage, real PostgreSQL integration tests, deterministic scraper fixtures, and Playwright frontend E2E.
- **API performance:** read endpoints were locally measured well below the 5-second target at the current source size.
- **Secrets/config:** `.env.example` documents local variables; no production secrets are required.
- **Documentation:** `README.md`, `DESIGN.md`, and `ASSUMPTIONS.md` describe setup, architecture, decisions, and source behavior.

## Source-specific findings

- The configured `/sales` URL redirects to `/sales/`.
- Live listing/detail/store pages are successfully parsed with Playwright navigation plus deterministic HTML parsing.
- Tenant pages expose website and operating-hours metadata. Inspected pages did not expose tenant-scoped social links, so `socialLinks` remains `{}` rather than inheriting mall-wide footer links.
- Promotion validity dates are currently not exposed as reliable machine-readable dates, so unknown dates remain `null`.
- The portal can mutate promotion/tenant content behind a stable `/deals/{id}` URL. Verification intentionally reports these source-backed semantic changes rather than masking them.

## Known limitations / deliberate cuts

- Single source portal only; no generic multi-portal abstraction.
- No authentication, production deployment, automated scheduling, or large design system.
- Group-by-brand operates on the currently paginated result set.
- Social links remain empty when tenant-scoped links are not available from the source.
- Live source mutation means a successful verification run can legitimately be non-clean.

## Final reviewer flow

1. Run `docker compose up --build`.
2. Open `http://localhost:3000`.
3. Trigger **Run scrape** and observe asynchronous run health.
4. Browse, search, filter, paginate, and switch to group-by-brand.
5. Open a source link and inspect enriched brand metadata.
6. Trigger **Verify data** and inspect clean/non-clean verification outcome and discrepancy count.
7. Open `http://localhost:4000/docs` for API discoverability.
