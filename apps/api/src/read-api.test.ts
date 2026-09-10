import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const models = vi.hoisted(() => ({
  promotionFindAndCountAll: vi.fn(), promotionFindByPk: vi.fn(), brandFindAll: vi.fn(),
  scrapeCreate: vi.fn(), scrapeUpdate: vi.fn(), scrapeFindOne: vi.fn(),
  verifyCreate: vi.fn(), verifyUpdate: vi.fn(), verifyFindByPk: vi.fn(),
}));

vi.mock('@promotions/database', () => ({
  PromotionModel: { findAndCountAll: models.promotionFindAndCountAll, findByPk: models.promotionFindByPk },
  BrandModel: { findAll: models.brandFindAll },
  ScrapeRunModel: { create: models.scrapeCreate, update: models.scrapeUpdate, findOne: models.scrapeFindOne },
  VerificationRunModel: { create: models.verifyCreate, update: models.verifyUpdate, findByPk: models.verifyFindByPk },
}));

import { createApp } from './app.js';

function deps() {
  return {
    database: { authenticate: vi.fn().mockResolvedValue(undefined) } as never,
    redisConnection: { ping: vi.fn().mockResolvedValue('PONG') } as never,
    scrapeQueue: { add: vi.fn().mockResolvedValue(undefined) } as never,
    verifyQueue: { add: vi.fn().mockResolvedValue(undefined) } as never,
  };
}

const brand = {
  id: '00000000-0000-4000-8000-000000000001', name: 'Example Brand', normalizedName: 'example brand',
  sourceUrl: 'https://example.com/store', websiteUrl: 'https://brand.example/', hours: 'Mon-Fri 9-5', socialLinks: {},
  scrapedAt: new Date('2026-09-10T10:00:00Z'), updatedAt: new Date('2026-09-10T10:00:00Z'), get: vi.fn().mockReturnValue('2'),
};

const promotion = {
  id: '00000000-0000-4000-8000-000000000002', sourceKey: 'source-key', name: 'Example Promotion', description: 'Save today', imageUrl: null,
  startDate: null, endDate: null, canonicalUrl: 'https://example.com/deals/1', sourcePortal: 'https://example.com/sales/',
  scrapedAt: new Date('2026-09-10T10:00:00Z'), lastVerifiedAt: null, verificationStatus: 'pending', brand,
};

beforeEach(() => {
  vi.clearAllMocks();
  brand.get.mockReturnValue('2');
  models.promotionFindAndCountAll.mockResolvedValue({ rows: [promotion], count: 1 });
  models.promotionFindByPk.mockResolvedValue(promotion);
  models.brandFindAll.mockResolvedValue([brand]);
});

describe('read API', () => {
  it('returns paginated promotions and validates pagination', async () => {
    const response = await request(createApp(deps())).get('/promotions?page=1&pageSize=10&search=Example');
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    expect(models.promotionFindAndCountAll).toHaveBeenCalledOnce();

    const invalid = await request(createApp(deps())).get('/promotions?page=0');
    expect(invalid.status).toBe(400);
  });

  it('returns a promotion detail and 404 for missing ids', async () => {
    const response = await request(createApp(deps())).get(`/promotions/${promotion.id}`);
    expect(response.status).toBe(200);
    expect(response.body.brand.name).toBe('Example Brand');

    models.promotionFindByPk.mockResolvedValueOnce(null);
    expect((await request(createApp(deps())).get('/promotions/missing')).status).toBe(404);
  });

  it('returns brand metadata with promotion counts', async () => {
    const response = await request(createApp(deps())).get('/brands');
    expect(response.status).toBe(200);
    expect(response.body.items[0].promotionCount).toBe(2);
    expect(response.body.items[0].websiteUrl).toBe('https://brand.example/');
  });
});
