import { Op } from 'sequelize';
import { BrandModel, PromotionModel, ScrapeRunModel, VerificationRunModel, VerificationDiscrepancyModel } from '@promotions/database';
import { scrapePromenade, type ScrapedPromotion } from '@promotions/scraper';

function scraperConfig() {
  return {
    listingUrl: process.env.SOURCE_PORTAL_URL,
    userAgent: process.env.SCRAPER_USER_AGENT,
    requestDelayMs: process.env.SCRAPER_REQUEST_DELAY_MS ? Number(process.env.SCRAPER_REQUEST_DELAY_MS) : undefined,
    concurrency: process.env.SCRAPER_CONCURRENCY ? Number(process.env.SCRAPER_CONCURRENCY) : undefined,
    navigationTimeoutMs: process.env.SCRAPER_NAVIGATION_TIMEOUT_MS ? Number(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS) : undefined,
  };
}

export async function persistPromotion(promotion: ScrapedPromotion, now = new Date()): Promise<'persisted' | 'updated'> {
  const [brand] = await BrandModel.findOrCreate({
    where: { normalizedName: promotion.brand.normalizedName },
    defaults: { ...promotion.brand, scrapedAt: now },
  });
  await brand.update({ ...promotion.brand, scrapedAt: now });

  const existing = await PromotionModel.findOne({ where: { sourcePortal: promotion.sourcePortal, sourceKey: promotion.sourceKey } });
  const values = {
    brandId: brand.id,
    name: promotion.name,
    description: promotion.description,
    imageUrl: promotion.imageUrl,
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    canonicalUrl: promotion.canonicalUrl,
    scrapedAt: now,
  };
  if (existing) {
    await existing.update(values);
    return 'updated';
  }
  await PromotionModel.create({ ...values, sourceKey: promotion.sourceKey, sourcePortal: promotion.sourcePortal, lastVerifiedAt: null, verificationStatus: 'pending' });
  return 'persisted';
}

export async function processScrape(runId: string): Promise<void> {
  const startedAt = new Date();
  await ScrapeRunModel.update({ state: 'active', startedAt, finishedAt: null, errorSummary: null }, { where: { id: runId } });
  try {
    const result = await scrapePromenade(scraperConfig());
    let persisted = 0;
    let updated = 0;
    for (const promotion of result.promotions) {
      const outcome = await persistPromotion(promotion, new Date());
      if (outcome === 'persisted') persisted += 1; else updated += 1;
    }
    const failed = result.diagnostics.failedPromotionPages;
    const state = result.sourceHealth === 'healthy' ? 'completed' : result.sourceHealth === 'suspicious' ? 'suspicious' : 'failed';
    await ScrapeRunModel.update({
      state,
      attempted: result.diagnostics.discoveredPromotionLinks,
      persisted,
      updated,
      skipped: 0,
      failed,
      sourceHealth: result.sourceHealth,
      errorSummary: result.diagnostics.warnings.length ? result.diagnostics.warnings.join('\n') : null,
      finishedAt: new Date(),
    }, { where: { id: runId } });
    if (result.sourceHealth === 'unreachable') throw new Error('Source portal was unreachable');
  } catch (error: unknown) {
    await ScrapeRunModel.update({ state: 'failed', errorSummary: error instanceof Error ? error.message : 'Unknown scrape failure', finishedAt: new Date() }, { where: { id: runId } });
    throw error;
  }
}

function comparableFields(stored: PromotionModel & { brand?: BrandModel }, live: ScrapedPromotion): Array<[string, string | null, string | null]> {
  return [
    ['name', stored.name, live.name], ['description', stored.description, live.description], ['imageUrl', stored.imageUrl, live.imageUrl],
    ['startDate', stored.startDate, live.startDate], ['endDate', stored.endDate, live.endDate], ['canonicalUrl', stored.canonicalUrl, live.canonicalUrl],
    ['brand.name', stored.brand?.name ?? null, live.brand.name], ['brand.websiteUrl', stored.brand?.websiteUrl ?? null, live.brand.websiteUrl],
    ['brand.hours', stored.brand?.hours ?? null, live.brand.hours], ['brand.socialLinks', JSON.stringify(stored.brand?.socialLinks ?? {}), JSON.stringify(live.brand.socialLinks)],
  ];
}

export async function processVerification(runId: string): Promise<void> {
  await VerificationRunModel.update({ state: 'active', startedAt: new Date(), finishedAt: null, errorSummary: null }, { where: { id: runId } });
  await VerificationDiscrepancyModel.destroy({ where: { verificationRunId: runId } });
  try {
    const stored = await PromotionModel.findAll({ include: [{ association: 'brand' }] }) as Array<PromotionModel & { brand?: BrandModel }>;
    const result = await scrapePromenade(scraperConfig());
    if (result.sourceHealth === 'unreachable') throw new Error('Source portal was unreachable during verification');
    const liveByKey = new Map(result.promotions.map((promotion) => [`${promotion.sourcePortal}|${promotion.sourceKey}`, promotion]));
    let discrepancyCount = 0;
    for (const promotion of stored) {
      const live = liveByKey.get(`${promotion.sourcePortal}|${promotion.sourceKey}`);
      if (!live) {
        await VerificationDiscrepancyModel.create({ verificationRunId: runId, promotionId: promotion.id, kind: 'missing', field: null, before: promotion.canonicalUrl, after: null, reason: 'Persisted promotion was not present in the live scrape' });
        await promotion.update({ lastVerifiedAt: new Date(), verificationStatus: 'missing' });
        discrepancyCount += 1;
        continue;
      }
      let changed = false;
      for (const [field, before, after] of comparableFields(promotion, live)) {
        if (before !== after) {
          changed = true;
          discrepancyCount += 1;
          await VerificationDiscrepancyModel.create({ verificationRunId: runId, promotionId: promotion.id, kind: 'changed', field, before, after, reason: null });
        }
      }
      await promotion.update({ lastVerifiedAt: new Date(), verificationStatus: changed ? 'changed' : 'verified' });
    }
    await VerificationRunModel.update({ state: result.sourceHealth === 'suspicious' ? 'suspicious' : 'completed', checked: stored.length, discrepancyCount, clean: discrepancyCount === 0, finishedAt: new Date(), errorSummary: result.diagnostics.warnings.length ? result.diagnostics.warnings.join('\n') : null }, { where: { id: runId } });
  } catch (error: unknown) {
    await VerificationRunModel.update({ state: 'failed', clean: false, errorSummary: error instanceof Error ? error.message : 'Unknown verification failure', finishedAt: new Date() }, { where: { id: runId } });
    throw error;
  }
}
