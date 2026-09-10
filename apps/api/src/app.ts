import express, { type Express } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Op, fn, col, type Sequelize, type WhereOptions } from 'sequelize';
import type { Queue } from 'bullmq';
import { BrandModel, PromotionModel, ScrapeRunModel, VerificationRunModel } from '@promotions/database';
import type { RedisConnection, ScrapeJobPayload, VerifyJobPayload } from '@promotions/jobs';
import { promotionsQuerySchema } from '@promotions/shared';

export type AppDependencies = {
  database: Sequelize;
  redisConnection: RedisConnection;
  scrapeQueue: Queue<ScrapeJobPayload>;
  verifyQueue: Queue<VerifyJobPayload>;
};

const queueSubmissionTimeoutMs = Number(process.env.QUEUE_SUBMISSION_TIMEOUT_MS ?? 5_000);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Promotions Aggregator API', version: '1.0.0' },
  paths: {
    '/health': { get: { summary: 'Report API, database, and Redis health' } },
    '/promotions': { get: { summary: 'List promotions with search, filters, and pagination' } },
    '/promotions/{id}': { get: { summary: 'Get one promotion and its brand metadata' } },
    '/brands': { get: { summary: 'List brands with promotion counts' } },
    '/scrape': { post: { summary: 'Queue an asynchronous scrape' } },
    '/scrape/{jobId}': { get: { summary: 'Get scrape job progress and outcome' } },
    '/verify': { post: { summary: 'Queue an asynchronous verification' } },
    '/verify/{runId}': { get: { summary: 'Get verification progress and discrepancies' } },
  },
} as const;

async function enqueue(add: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      add(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Queue submission timed out after ${queueSubmissionTimeoutMs}ms`)), queueSubmissionTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type PromotionWithBrand = PromotionModel & { brand?: BrandModel };

function serializeBrand(brand: BrandModel) {
  return {
    id: brand.id,
    name: brand.name,
    normalizedName: brand.normalizedName,
    sourceUrl: brand.sourceUrl,
    websiteUrl: brand.websiteUrl,
    hours: brand.hours,
    socialLinks: brand.socialLinks,
    scrapedAt: brand.scrapedAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

function serializePromotion(promotion: PromotionWithBrand) {
  if (!promotion.brand) throw new Error(`Promotion ${promotion.id} is missing its brand association`);
  return {
    id: promotion.id,
    sourceKey: promotion.sourceKey,
    name: promotion.name,
    description: promotion.description,
    imageUrl: promotion.imageUrl,
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    canonicalUrl: promotion.canonicalUrl,
    sourcePortal: promotion.sourcePortal,
    scrapedAt: promotion.scrapedAt.toISOString(),
    lastVerifiedAt: promotion.lastVerifiedAt?.toISOString() ?? null,
    verificationStatus: promotion.verificationStatus,
    brand: serializeBrand(promotion.brand),
  };
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  app.get('/docs', (_req, res) => {
    res.type('html').send('<!doctype html><title>Promotions Aggregator API</title><h1>Promotions Aggregator API</h1><p><a href="/openapi.json">OpenAPI JSON</a></p>');
  });

  app.get('/health', async (_req, res) => {
    try {
      await deps.database.authenticate();
      const redisStatus = await deps.redisConnection.ping();
      res.json({ status: 'ok', database: 'ok', redis: redisStatus === 'PONG' ? 'ok' : 'degraded' });
    } catch (error: unknown) {
      res.status(503).json({ status: 'degraded', error: error instanceof Error ? error.message : 'Unknown health error' });
    }
  });

  app.get('/promotions', async (req, res, next) => {
    try {
      const parsed = promotionsQuerySchema.safeParse(req.query);
      if (!parsed.success) return void res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
      const { search, startDate, endDate, brand, page, pageSize } = parsed.data;
      const where: WhereOptions = {};
      const clauses: WhereOptions[] = [];
      if (search) clauses.push({ [Op.or]: [{ name: { [Op.iLike]: `%${search}%` } }, { '$brand.name$': { [Op.iLike]: `%${search}%` } }] });
      if (startDate) clauses.push({ [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: startDate } }] });
      if (endDate) clauses.push({ [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: endDate } }] });
      if (brand) clauses.push({ '$brand.name$': { [Op.iLike]: `%${brand}%` } });
      if (clauses.length) Object.assign(where, { [Op.and]: clauses });

      const { rows, count } = await PromotionModel.findAndCountAll({
        where,
        include: [{ association: 'brand', required: true }],
        distinct: true,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        order: [['name', 'ASC'], ['id', 'ASC']],
      });
      const items = (rows as PromotionWithBrand[]).map(serializePromotion);
      res.json({ items, pagination: { page, pageSize, totalItems: count, totalPages: count === 0 ? 0 : Math.ceil(count / pageSize) } });
    } catch (error: unknown) { next(error); }
  });

  app.get('/promotions/:id', async (req, res, next) => {
    try {
      if (!uuidPattern.test(req.params.id)) return void res.status(400).json({ error: 'Invalid promotion id' });
      const promotion = await PromotionModel.findByPk(req.params.id, { include: [{ association: 'brand', required: true }] }) as PromotionWithBrand | null;
      if (!promotion) return void res.status(404).json({ error: 'Promotion not found' });
      res.json(serializePromotion(promotion));
    } catch (error: unknown) { next(error); }
  });

  app.get('/brands', async (_req, res, next) => {
    try {
      const brands = await BrandModel.findAll({
        attributes: { include: [[fn('COUNT', col('promotions.id')), 'promotionCount']] },
        include: [{ association: 'promotions', attributes: [], required: false }],
        group: ['BrandModel.id'],
        order: [['name', 'ASC']],
      });
      res.json({ items: brands.map((brand) => ({ ...serializeBrand(brand), promotionCount: Number(brand.get('promotionCount') ?? 0) })) });
    } catch (error: unknown) { next(error); }
  });

  app.post('/scrape', async (_req, res, next) => {
    const runId = randomUUID();
    const jobId = runId;
    try {
      await ScrapeRunModel.create({ id: runId, jobId, state: 'queued', sourceHealth: 'unknown', errorSummary: null, startedAt: null, finishedAt: null });
      await enqueue(() => deps.scrapeQueue.add('scrape-portal', { runId }, { jobId }));
      res.status(202).json({ jobId, runId, state: 'queued' });
    } catch (error: unknown) {
      await ScrapeRunModel.update({ state: 'failed', errorSummary: error instanceof Error ? error.message : 'Queue submission failed', finishedAt: new Date() }, { where: { id: runId } }).catch(() => undefined);
      next(error);
    }
  });

  app.get('/scrape/:jobId', async (req, res, next) => {
    try {
      const run = await ScrapeRunModel.findOne({ where: { jobId: req.params.jobId } });
      if (!run) return void res.status(404).json({ error: 'Scrape job not found' });
      res.json(run.toJSON());
    } catch (error: unknown) { next(error); }
  });

  app.post('/verify', async (_req, res, next) => {
    const runId = randomUUID();
    const jobId = runId;
    try {
      await VerificationRunModel.create({ id: runId, jobId, state: 'queued', clean: false, errorSummary: null, startedAt: null, finishedAt: null });
      await enqueue(() => deps.verifyQueue.add('verify-portal', { runId }, { jobId }));
      res.status(202).json({ jobId, runId, state: 'queued' });
    } catch (error: unknown) {
      await VerificationRunModel.update({ state: 'failed', errorSummary: error instanceof Error ? error.message : 'Queue submission failed', finishedAt: new Date() }, { where: { id: runId } }).catch(() => undefined);
      next(error);
    }
  });

  app.get('/verify/:runId', async (req, res, next) => {
    try {
      const run = await VerificationRunModel.findByPk(req.params.runId, {
        include: [{ association: 'discrepancies', include: [{ association: 'promotion', attributes: ['id', 'name'] }] }],
      });
      if (!run) return void res.status(404).json({ error: 'Verification run not found' });
      const json = run.toJSON() as { discrepancies?: Array<{ promotion?: { name?: string }; [key: string]: unknown }> } & Record<string, unknown>;
      if (json.discrepancies) {
        json.discrepancies = json.discrepancies.map((discrepancy) => {
          const { promotion, ...result } = discrepancy;
          return { ...result, promotionName: promotion?.name ?? null };
        });
      }
      res.json(json);
    } catch (error: unknown) { next(error); }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
