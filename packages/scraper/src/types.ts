export type ScrapedBrand = {
  name: string;
  normalizedName: string;
  sourceUrl: string | null;
  websiteUrl: string | null;
  hours: string | null;
  socialLinks: Record<string, string>;
};

export type ScrapedPromotion = {
  sourceKey: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  canonicalUrl: string;
  sourcePortal: string;
  brand: ScrapedBrand;
};

export type ScrapeDiagnostics = {
  listingUrl: string;
  listingReachable: boolean;
  discoveredPromotionLinks: number;
  parsedPromotions: number;
  failedPromotionPages: number;
  discoveredBrandPages: number;
  failedBrandPages: number;
  warnings: string[];
};

export type ScrapeResult = {
  promotions: ScrapedPromotion[];
  diagnostics: ScrapeDiagnostics;
  sourceHealth: 'healthy' | 'suspicious' | 'unreachable';
};

export type ScraperConfig = {
  listingUrl: string;
  userAgent: string;
  requestDelayMs: number;
  concurrency: number;
  navigationTimeoutMs: number;
  maxRetries: number;
};
