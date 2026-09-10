import { describe, expect, it } from 'vitest';
import { promotionSchema, promotionsQuerySchema, scrapeRunSchema } from './index.js';

describe('shared contracts', () => {
  it('coerces pagination query values', () => {
    const parsed = promotionsQuerySchema.parse({ page: '2', pageSize: '25', search: 'sale' });
    expect(parsed).toEqual({ page: 2, pageSize: 25, search: 'sale' });
  });

  it('rejects invalid page sizes', () => {
    expect(() => promotionsQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it('accepts a complete promotion contract', () => {
    const now = new Date().toISOString();
    const parsed = promotionSchema.parse({
      id: '8d4de0f0-6c63-4fe2-8c5e-44f05a489f34',
      sourceKey: 'https://example.com/promo/1',
      name: 'Example Promotion',
      description: null,
      imageUrl: null,
      startDate: null,
      endDate: '2026-09-30',
      canonicalUrl: 'https://example.com/promo/1',
      sourcePortal: 'https://example.com/sales',
      scrapedAt: now,
      lastVerifiedAt: null,
      verificationStatus: 'pending',
      brand: {
        id: 'eb680ad6-a5a2-4c73-8468-b60d86b82633',
        name: 'Example Brand',
        normalizedName: 'example brand',
        sourceUrl: null,
        websiteUrl: null,
        hours: null,
        socialLinks: {},
        scrapedAt: now,
        updatedAt: now,
      },
    });
    expect(parsed.name).toBe('Example Promotion');
  });

  it('allows suspicious scrape runs to remain explicit', () => {
    const parsed = scrapeRunSchema.parse({
      id: '8751320d-f1b7-4f61-8685-f7929c42a8ec',
      jobId: 'scrape-1',
      state: 'suspicious',
      attempted: 0,
      persisted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      startedAt: null,
      finishedAt: null,
      errorSummary: 'Expected promotion cards but extracted zero records',
      sourceHealth: 'suspicious',
    });
    expect(parsed.sourceHealth).toBe('suspicious');
  });
});
