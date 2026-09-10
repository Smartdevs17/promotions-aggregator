import { scrapePromenade } from './promenade.js';

async function main(): Promise<void> {
  const result = await scrapePromenade({
    listingUrl: process.env.SOURCE_PORTAL_URL,
    userAgent: process.env.SCRAPER_USER_AGENT,
    requestDelayMs: process.env.SCRAPER_REQUEST_DELAY_MS ? Number(process.env.SCRAPER_REQUEST_DELAY_MS) : undefined,
    concurrency: process.env.SCRAPER_CONCURRENCY ? Number(process.env.SCRAPER_CONCURRENCY) : undefined,
    navigationTimeoutMs: process.env.SCRAPER_NAVIGATION_TIMEOUT_MS ? Number(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS) : undefined,
  });

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
