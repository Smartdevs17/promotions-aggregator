# Assumptions

This file records interpretations of ambiguous parts of the take-home brief and discoveries made while implementing the project. It is expected to evolve during development.

## Initial interpretations

1. **One source portal only.** The implementation is intentionally specific to The Promenade Shops at Briargate. No generic scraper/plugin framework is required.
2. **Promotion identity.** A stable source-provided identifier will be used when discoverable. Otherwise the canonical promotion detail URL is the stable source identity. Re-scraping must not create duplicates.
3. **Missing values.** Unavailable scalar values are represented as `null`; unavailable collections are represented as empty arrays. We do not invent brand metadata.
4. **Brands are normalized.** A brand is stored once and referenced by promotions because multiple promotions may share the same brand metadata.
5. **Date filtering.** A promotion matches a requested date window when its known validity interval overlaps that window. Open-ended source dates are supported.
6. **Search semantics.** Keyword search is case-insensitive and covers promotion name and brand name as explicitly required; description may also be searched where useful.
7. **Verification scope.** Verification checks all persisted promotions for this single-mall MVP rather than sampling. Source requests made during verification use the same politeness controls as scraping.
8. **Meaningful discrepancies.** Business-semantic changes are reported. Pure whitespace changes, harmless URL normalization, and transient image-CDN query parameters are ignored to avoid noisy reports.
9. **Disappeared records.** A persisted promotion whose canonical source record can no longer be found is reported as `missing_at_source`; it is not automatically deleted during verification.
10. **Partial failures.** One bad promotion/brand page should not invalidate all successfully processed records. It increments failed/skipped counts with a reason. A systemic parser failure or suspicious zero-result extraction is a run-health failure/suspicion, not a successful empty scrape.
11. **Job progress.** Attempted/persisted/updated/skipped/failed counts describe record processing and are durably mirrored to PostgreSQL, while BullMQ remains the execution queue.
12. **Job timeout.** The implementation will choose a bounded timeout appropriate for the observed source size and document the final value once live behaviour is measured.
13. **Politeness.** We will use bounded concurrency, delay/jitter, request timeouts, a descriptive user agent, and inspect robots.txt before finalizing the request policy.
14. **UI scope.** The UI is functional rather than a full design system. Run-health information is included because it directly supports the operational goal of detecting quiet scraper failure.
15. **Local operation.** Docker Compose is the canonical reviewer path and will start the application services, Redis, and PostgreSQL. Development commands outside Docker may also be documented for convenience.

## Discoveries during implementation

_To be updated as the live portal is inspected and implementation proceeds._
