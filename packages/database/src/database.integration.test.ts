import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseError, ForeignKeyConstraintError, UniqueConstraintError, type Sequelize } from 'sequelize';
import { createDatabase, BrandModel, PromotionModel, ScrapeRunModel, VerificationRunModel, VerificationDiscrepancyModel } from './index.js';
import { up, down } from './migrations/001-initial-schema.js';

const testUrl = process.env.TEST_DATABASE_URL ?? 'postgres://promotions:promotions@localhost:5432/promotions_test';
let db: Sequelize;

beforeAll(async () => {
  db = createDatabase({ url: testUrl });
  await db.authenticate();
  const qi = db.getQueryInterface();
  await qi.dropAllTables();
  await up({ context: qi });
});

afterAll(async () => {
  if (!db) return;
  await down({ context: db.getQueryInterface() });
  await db.close();
});

async function createBrand(name = 'Test Brand') {
  return BrandModel.create({
    name,
    normalizedName: name.toLowerCase(),
    sourceUrl: 'https://example.com/brand',
    websiteUrl: 'https://brand.example',
    hours: null,
    socialLinks: {},
    scrapedAt: new Date(),
  });
}

async function createPromotion(brandId: string, sourceKey = 'promo-1') {
  return PromotionModel.create({
    brandId,
    sourceKey,
    name: 'Sample promotion',
    description: null,
    imageUrl: null,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    canonicalUrl: `https://example.com/sales/${sourceKey}`,
    sourcePortal: 'briargate',
    scrapedAt: new Date(),
    lastVerifiedAt: null,
    verificationStatus: 'pending',
  });
}

describe('database foundation against PostgreSQL', () => {
  it('persists brand and promotion associations', async () => {
    const brand = await createBrand('Association Brand');
    const promotion = await createPromotion(brand.id, 'association-promo');

    const loadedPromotion = await PromotionModel.findByPk(promotion.id, { include: [{ model: BrandModel, as: 'brand' }] });
    expect(loadedPromotion).not.toBeNull();
    expect((loadedPromotion as PromotionModel & { brand?: BrandModel }).brand?.id).toBe(brand.id);

    const loadedBrand = await BrandModel.findByPk(brand.id, { include: [{ model: PromotionModel, as: 'promotions' }] });
    expect((loadedBrand as BrandModel & { promotions?: PromotionModel[] }).promotions).toHaveLength(1);
  });

  it('rejects duplicate source identities', async () => {
    const brand = await createBrand('Identity Brand');
    await createPromotion(brand.id, 'same-source-key');
    await expect(createPromotion(brand.id, 'same-source-key')).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('rejects invalid promotion foreign keys', async () => {
    await expect(createPromotion(randomUUID(), 'invalid-fk')).rejects.toBeInstanceOf(ForeignKeyConstraintError);
  });

  it('enforces promotion date-range integrity in PostgreSQL', async () => {
    const brand = await createBrand('Dates Brand');
    await expect(PromotionModel.create({
      brandId: brand.id,
      sourceKey: 'bad-dates',
      name: 'Invalid dates',
      description: null,
      imageUrl: null,
      startDate: '2026-10-10',
      endDate: '2026-10-01',
      canonicalUrl: 'https://example.com/sales/bad-dates',
      sourcePortal: 'briargate',
      scrapedAt: new Date(),
      lastVerifiedAt: null,
      verificationStatus: 'pending',
    })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('persists run health and rejects negative counters', async () => {
    const run = await ScrapeRunModel.create({
      jobId: `scrape-${randomUUID()}`,
      state: 'suspicious',
      attempted: 10,
      persisted: 0,
      updated: 0,
      skipped: 10,
      failed: 0,
      sourceHealth: 'suspicious',
      errorSummary: 'Expected promotion structures produced zero records',
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    expect(run.sourceHealth).toBe('suspicious');

    await expect(ScrapeRunModel.create({
      jobId: `negative-${randomUUID()}`,
      state: 'failed',
      attempted: -1,
      persisted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      sourceHealth: 'unknown',
      errorSummary: null,
      startedAt: null,
      finishedAt: null,
    })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('persists verification discrepancies and reverse associations', async () => {
    const brand = await createBrand('Verify Brand');
    const promotion = await createPromotion(brand.id, 'verify-promo');
    const run = await VerificationRunModel.create({
      jobId: `verify-${randomUUID()}`,
      state: 'completed',
      checked: 1,
      discrepancyCount: 1,
      clean: false,
      errorSummary: null,
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    const discrepancy = await VerificationDiscrepancyModel.create({
      verificationRunId: run.id,
      promotionId: promotion.id,
      kind: 'changed',
      field: 'endDate',
      before: '2026-09-30',
      after: '2026-10-01',
      reason: null,
    });

    const loaded = await VerificationDiscrepancyModel.findByPk(discrepancy.id, {
      include: [{ model: PromotionModel, as: 'promotion' }, { model: VerificationRunModel, as: 'run' }],
    });
    expect((loaded as VerificationDiscrepancyModel & { promotion?: PromotionModel }).promotion?.id).toBe(promotion.id);
    expect((loaded as VerificationDiscrepancyModel & { run?: VerificationRunModel }).run?.id).toBe(run.id);
  });
});
