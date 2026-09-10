import { load, type CheerioAPI } from 'cheerio';
import { canonicalizeUrl, firstNonEmpty, makeSourceKey, normalizeBrandName, normalizeWhitespace } from './normalize.js';
import type { ScrapedBrand, ScrapedPromotion } from './types.js';

const SOCIAL_HOSTS: Record<string, string> = {
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'tiktok.com': 'tiktok',
  'x.com': 'x',
  'twitter.com': 'x',
  'youtube.com': 'youtube',
  'linkedin.com': 'linkedin',
};

function textOf($: CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = normalizeWhitespace($(selector).first().text());
    if (value) return value;
  }
  return null;
}

function attrOf($: CheerioAPI, selectors: string[], attr: string): string | null {
  for (const selector of selectors) {
    const value = $(selector).first().attr(attr);
    if (value?.trim()) return value.trim();
  }
  return null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value) return null;
  const direct = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString().slice(0, 10);
}

function extractDatePair($: CheerioAPI): { startDate: string | null; endDate: string | null } {
  const startAttr = attrOf($, ['time[itemprop="validFrom"]','[data-start-date]','[itemprop="startDate"]'], 'datetime')
    ?? attrOf($, ['[data-start-date]'], 'data-start-date');
  const endAttr = attrOf($, ['time[itemprop="validThrough"]','[data-end-date]','[itemprop="endDate"]'], 'datetime')
    ?? attrOf($, ['[data-end-date]'], 'data-end-date');

  if (startAttr || endAttr) return { startDate: parseIsoDate(startAttr), endDate: parseIsoDate(endAttr) };

  const body = normalizeWhitespace($('body').text());
  const range = body.match(/(?:valid|offer|promotion|sale)?\s*(?:from\s*)?([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})\s*(?:-|–|—|through|to)\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i);
  if (range) return { startDate: parseIsoDate(range[1]), endDate: parseIsoDate(range[2]) };

  const until = body.match(/(?:through|until|expires?)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i);
  return { startDate: null, endDate: parseIsoDate(until?.[1] ?? null) };
}

function isPromotionDetailPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path === '/sales' || path === '/sales/') return false;
  return /\/(sales?|offers?|promotions?|deals?)\//.test(path);
}

export function discoverPromotionLinks(html: string, listingUrl: string): string[] {
  const $ = load(html);
  const origin = new URL(listingUrl).origin;
  const links = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    try {
      const candidate = new URL(href, listingUrl);
      if (candidate.origin !== origin || !isPromotionDetailPath(candidate.pathname)) return;
      links.add(canonicalizeUrl(candidate.toString()));
    } catch {
      // Ignore malformed source links; the run diagnostics captures missing/zero results.
    }
  });

  return [...links];
}

function inferBrandLink($: CheerioAPI, pageUrl: string): { name: string | null; url: string | null } {
  const origin = new URL(pageUrl).origin;
  const preferredSelectors = [
    '[class*="tenant"] a[href]',
    '[class*="store"] a[href]',
    '[class*="retailer"] a[href]',
    '[class*="brand"] a[href]',
    'a[href*="/directory/"]',
    'a[href*="/stores/"]',
    'a[href*="/shops/"]',
  ];

  for (const selector of preferredSelectors) {
    const anchor = $(selector).filter((_, element) => {
      const href = $(element).attr('href');
      if (!href) return false;
      try {
        const url = new URL(href, pageUrl);
        return url.origin === origin && !isPromotionDetailPath(url.pathname);
      } catch { return false; }
    }).first();
    if (!anchor.length) continue;
    const name = normalizeWhitespace(anchor.text());
    const href = anchor.attr('href');
    if (name && href) return { name, url: canonicalizeUrl(href, pageUrl) };
  }

  const labeledBrand = textOf($, ['[itemprop="brand"]','[class*="brand-name"]','[class*="tenant-name"]','[class*="store-name"]']);
  return { name: labeledBrand, url: null };
}

export function parsePromotionDetail(html: string, pageUrl: string, sourcePortal: string): Omit<ScrapedPromotion, 'brand'> & { brandName: string; brandSourceUrl: string | null } {
  const $ = load(html);
  const canonicalUrl = canonicalizeUrl(attrOf($, ['link[rel="canonical"]'], 'href') ?? pageUrl, pageUrl);
  const title = firstNonEmpty(
    textOf($, ['h1','[itemprop="name"]','[class*="sale-title"]','[class*="promotion-title"]']),
    $('meta[property="og:title"]').attr('content'),
    $('title').text(),
  );
  if (!title) throw new Error(`Promotion title not found: ${pageUrl}`);

  const inferredBrand = inferBrandLink($, pageUrl);
  const brandName = inferredBrand.name ?? textOf($, ['[class*="merchant"]','[class*="retailer"]']) ?? 'Unknown brand';
  const description = firstNonEmpty(
    attrOf($, ['meta[name="description"]','meta[property="og:description"]'], 'content'),
    textOf($, ['[itemprop="description"]','[class*="description"]','main p']),
  );
  const imageRaw = firstNonEmpty(
    attrOf($, ['meta[property="og:image"]'], 'content'),
    attrOf($, ['main img[src]','article img[src]'], 'src'),
  );
  const dates = extractDatePair($);

  return {
    sourceKey: makeSourceKey(canonicalUrl),
    name: title,
    description,
    imageUrl: imageRaw ? canonicalizeUrl(imageRaw, pageUrl) : null,
    startDate: dates.startDate,
    endDate: dates.endDate,
    canonicalUrl,
    sourcePortal: canonicalizeUrl(sourcePortal),
    brandName,
    brandSourceUrl: inferredBrand.url,
  };
}

export function parseBrandDetail(html: string, pageUrl: string, fallbackName: string): ScrapedBrand {
  const $ = load(html);
  const origin = new URL(pageUrl).origin;
  const name = firstNonEmpty(
    textOf($, ['h1','[itemprop="name"]','[class*="store-name"]','[class*="tenant-name"]']),
    fallbackName,
  ) ?? fallbackName;

  const socialLinks: Record<string, string> = {};
  let websiteUrl: string | null = null;

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    try {
      const url = new URL(href, pageUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const social = Object.entries(SOCIAL_HOSTS).find(([domain]) => host === domain || host.endsWith(`.${domain}`));
      if (social) {
        socialLinks[social[1]] ??= canonicalizeUrl(url.toString());
        return;
      }
      const text = normalizeWhitespace($(element).text()).toLowerCase();
      const isLikelyWebsite = url.origin !== origin && (text.includes('website') || text.includes('visit') || $(element).is('[class*="website"]'));
      if (!websiteUrl && isLikelyWebsite) websiteUrl = canonicalizeUrl(url.toString());
    } catch {
      // Ignore malformed third-party links.
    }
  });

  const hours = firstNonEmpty(
    textOf($, ['[itemprop="openingHours"]','[class*="hours"]','[data-hours]']),
    (() => {
      const body = normalizeWhitespace($('body').text());
      const match = body.match(/((?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[\s\S]{0,220}(?:am|pm))/i);
      return match?.[1] ?? null;
    })(),
  );

  return {
    name,
    normalizedName: normalizeBrandName(name),
    sourceUrl: canonicalizeUrl(pageUrl),
    websiteUrl,
    hours,
    socialLinks,
  };
}
