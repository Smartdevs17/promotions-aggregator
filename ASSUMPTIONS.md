# Assumptions

This file records interpretations of ambiguous parts of the take-home brief and discoveries made while implementing the project. It is expected to evolve during development.

## Initial interpretations

1. **One source portal only.** The implementation is intentionally specific to The Promenade Shops at Briargate. No generic scraper/plugin framework is required.
2. **Promotion identity.** A stable source-provided identifier will be used when discoverable. Otherwise the canonical promotion detail URL is the stable source identity. Re-scraping must not create duplicates.
3. **Missing values.** Unavailable scalar values are represented as `null`; unavailable collections are represented as empty arrays. We do not invent brand metadata.
4. **Brands are normalized.** A brand is stored once and referenced by promotions because multiple promotions may share the same brand metadata.
5. **Date filtering.** A promotion matches a requested date window when its known validity interval overlaps that window. Open-ended source dates are supported.
6. **Search semantics.** Keyword search is case-insensitive and covers promotion name and brand name as explicitly required; the MVP uses partial matching (`ILIKE`) for both keyword search and the brand filter.
7. **Verification scope.** Verification checks all persisted promotions for this single-mall MVP rather than sampling. Source requests made during verification use the same politeness controls as scraping.
8. **Meaningful discrepancies.** Business-semantic changes are reported. Pure whitespace changes, harmless URL normalization, and transient image-CDN query parameters are ignored to avoid noisy reports.
9. **Disappeared records.** A persisted promotion whose canonical source record can no longer be found is reported as `missing_at_source`; it is not automatically deleted during verification.
10. **Partial failures.** One bad promotion/brand page should not invalidate all successfully processed records. It increments failed/skipped counts with a reason. A systemic parser failure or suspicious zero-result extraction is a run-health failure/suspicion, not a successful empty scrape.
11. **Job progress.** Attempted/persisted/updated/skipped/failed counts describe record processing and are durably mirrored to PostgreSQL, while BullMQ remains the execution queue.
12. **Job timeout.** The implementation will choose a bounded timeout appropriate for the observed source size and document the final value once live behaviour is measured.
13. **Politeness.** We will use bounded concurrency, delay/jitter, request timeouts, a descriptive user agent, and inspect robots.txt before finalizing the request policy.
14. **UI scope.** The UI is functional rather than a full design system. Run-health information is included because it directly supports the operational goal of detecting quiet scraper failure.
15. **Local operation.** Docker Compose is the canonical reviewer path and will start the application services, Redis, and PostgreSQL. Development commands outside Docker may also be documented for convenience.
16. **Worker timeout.** BullMQ jobs are bounded by `JOB_TIMEOUT_MS`, defaulting to 10 minutes. This accommodates the observed single-source crawl while preventing a worker promise from running indefinitely.

## Discoveries during implementation

- The configured sales URL responds with a 301 redirect to `/sales/`. The final page is reachable with a browser and contains the current deal cards in the initial HTML; the live inspection found 23 unique deal links and no pagination or load-more control.
- Promotion detail URLs use `/deals/{numeric-id}/`, not `/sales/*`. Promotion pages link to the associated tenant at `/stores/{numeric-id-slug}/` through an `a.store-link` element.
- Store pages expose the tenant name in the store detail `h1`, external website links as `.external_link.ext_retailer`, and hours in `.store-container-component .opening-hours li`. Mall-wide footer social links are outside the store detail container and must not be attributed to a brand. Brand-level social links are absent on the inspected store pages, so `socialLinks` remains `{}` when none are present at source.
- The live content was present after `domcontentloaded`; Playwright remains the browser transport because it follows the source redirect and provides browser-grade behavior consistently. The scraper does not rely on client-side XHR data for the inspected listing.
- `robots.txt` allows the relevant public sales, deals, and stores paths, declares `Crawl-delay: 60` for `User-agent: *`, and disallows unrelated paths such as profile, admin, live-update, and sign-in. The scraper stays on same-origin listing, deal, and store pages with bounded concurrency, retries, and a request delay; production scheduling should honor the published crawl delay.
- Promotion dates are not exposed as machine-readable dates on the inspected detail pages; pages show relative labels such as “Ends Today” or “Ends 9/17”. The scraper leaves `startDate` and `endDate` as `null` rather than inventing a year or date.
- Canonical promotion identity is the normalized `/deals/{numeric-id}` URL hashed with SHA-256. Tracking parameters, fragments, and trailing slashes do not change `sourceKey`; no better public stable promotion identifier was found than the numeric deal URL itself.
- Repeated live verification during async validation showed that some deal pages can change their displayed promotion/tenant content between crawls while retaining the same deal URL. The verifier reports these as explicit semantic changes; it does not silently treat them as clean.
- Direct raw-page confirmation on 2026-09-10 found `/deals/3434187`, `/deals/3434181`, and `/deals/3434190` consistently served Bath & Body Works content across three observations each, despite earlier persisted Altar’d State associations. The listing contained 25 unique deal links with no duplicates, so the numeric deal URL remains the best available record locator; the observed discrepancy is source content mutation between crawl windows.
