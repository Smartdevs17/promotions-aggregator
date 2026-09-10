import { scrapePromenade } from './promenade.js';
import type { ScraperConfig } from './types.js';

async function main(): Promise<void> {
  const overrides: Partial<ScraperConfig> = {};
  if (process.env.SOURCE_PORTAL_URL) overrides.listingUrl = process.env.SOURCE_PORTAL_URL;
  if (process.env.SCRAPER_USER_AGENT) overrides.userAgent = process.env.SCRAPER_USER_AGENT;
  if (process.env.SCRAPER_REQUEST_DELAY_MS) overrides.requestDelayMs = Number(process.env.SCRAPER_REQUEST_DELAY_MS);
  if (process.env.SCRAPER_CONCURRENCY) overrides.concurrency = Number(process.env.SCRAPER_CONCURRENCY);
  if (process.env.SCRAPER_NAVIGATION_TIMEOUT_MS) overrides.navigationTimeoutMs = Number(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS);

  const result = await scrapePromenade(overrides);

  console.log(JSON.stringify({
    sourceHealth: result.sourceHealth,
    diagnostics: result.diagnostics,
    sample: result.promotions.slice(0, 3),
  }, null, 2));

  if (result.sourceHealth !== 'healthy') process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
