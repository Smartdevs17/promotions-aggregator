import { SourceBrowser } from './browser.js';
import { discoverPromotionLinks, parseBrandDetail, parsePromotionDetail } from './parser.js';
import { canonicalizeUrl, normalizeBrandName } from './normalize.js';
import type { ScrapeDiagnostics, ScrapeResult, ScrapedBrand, ScrapedPromotion, ScraperConfig } from './types.js';

const DEFAULT_CONFIG: ScraperConfig = {
  listingUrl: 'https://www.thepromenadeshopsatbriargate.com/sales',
  userAgent: 'PromotionsAggregatorTakeHome/1.0 (+local assessment scraper)',
  requestDelayMs: 500,
  concurrency: 2,
  navigationTimeoutMs: 20_000,
  maxRetries: 2,
};

function mergeConfig(overrides: Partial<ScraperConfig> = {}): ScraperConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker()));
  return results;
}

function unknownBrand(name: string, sourceUrl: string | null): ScrapedBrand {
  return {
    name,
    normalizedName: normalizeBrandName(name),
    sourceUrl,
    websiteUrl: null,
    hours: null,
    socialLinks: {},
  };
}

export async function scrapePromenade(overrides: Partial<ScraperConfig> = {}): Promise<ScrapeResult> {
  const config = mergeConfig(overrides);
  const browser = new SourceBrowser(config);
  const diagnostics: ScrapeDiagnostics = {
    listingUrl: canonicalizeUrl(config.listingUrl),
    listingReachable: false,
    discoveredPromotionLinks: 0,
    parsedPromotions: 0,
    failedPromotionPages: 0,
    discoveredBrandPages: 0,
    failedBrandPages: 0,
    warnings: [],
  };

  try {
    await browser.start();
    let listingHtml: string;
    try {
      listingHtml = await browser.getHtml(config.listingUrl);
      diagnostics.listingReachable = true;
    } catch (error: unknown) {
      diagnostics.warnings.push(error instanceof Error ? error.message : String(error));
      return { promotions: [], diagnostics, sourceHealth: 'unreachable' };
    }

    const links = discoverPromotionLinks(listingHtml, config.listingUrl);
    diagnostics.discoveredPromotionLinks = links.length;
    if (links.length === 0) {
      diagnostics.warnings.push('Listing page was reachable but no promotion detail links matched expected sale/offer URL patterns.');
      return { promotions: [], diagnostics, sourceHealth: 'suspicious' };
    }

    const parsed = await mapLimit(links, config.concurrency, async (url) => {
      try {
        const html = await browser.getHtml(url);
        return parsePromotionDetail(html, url, config.listingUrl);
      } catch (error: unknown) {
        diagnostics.failedPromotionPages += 1;
        diagnostics.warnings.push(`Promotion page failed: ${url} :: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    const promotionDetails = parsed.filter((value): value is NonNullable<typeof value> => value !== null);
    diagnostics.parsedPromotions = promotionDetails.length;

    if (promotionDetails.length === 0) {
      diagnostics.warnings.push('Promotion links were discovered, but none could be parsed into valid promotion records.');
      return { promotions: [], diagnostics, sourceHealth: 'suspicious' };
    }

    const brandSeeds = new Map<string, { name: string; url: string }>();
    for (const promotion of promotionDetails) {
      if (!promotion.brandSourceUrl) continue;
      const key = canonicalizeUrl(promotion.brandSourceUrl);
      if (!brandSeeds.has(key)) brandSeeds.set(key, { name: promotion.brandName, url: key });
    }
    diagnostics.discoveredBrandPages = brandSeeds.size;

    const brandEntries = await mapLimit([...brandSeeds.values()], config.concurrency, async ({ name, url }) => {
      try {
        const html = await browser.getHtml(url);
        return [url, parseBrandDetail(html, url, name)] as const;
      } catch (error: unknown) {
        diagnostics.failedBrandPages += 1;
        diagnostics.warnings.push(`Brand page failed: ${url} :: ${error instanceof Error ? error.message : String(error)}`);
        return [url, unknownBrand(name, url)] as const;
      }
    });
    const brandsByUrl = new Map<string, ScrapedBrand>(brandEntries);

    const promotions: ScrapedPromotion[] = promotionDetails.map((promotion) => {
      const brand = promotion.brandSourceUrl
        ? brandsByUrl.get(canonicalizeUrl(promotion.brandSourceUrl)) ?? unknownBrand(promotion.brandName, promotion.brandSourceUrl)
        : unknownBrand(promotion.brandName, null);
      const { brandName: _brandName, brandSourceUrl: _brandSourceUrl, ...record } = promotion;
      return { ...record, brand };
    });

    const failureRatio = diagnostics.failedPromotionPages / Math.max(1, diagnostics.discoveredPromotionLinks);
    const sourceHealth = failureRatio >= 0.5 ? 'suspicious' : 'healthy';
    if (sourceHealth === 'suspicious') diagnostics.warnings.push('At least half of discovered promotion pages failed to parse or load.');

    return { promotions, diagnostics, sourceHealth };
  } finally {
    await browser.close();
  }
}

export { DEFAULT_CONFIG as promenadeDefaultConfig };
