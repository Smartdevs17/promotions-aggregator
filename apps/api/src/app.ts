import express, { type Express } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type { Sequelize } from 'sequelize';
import type { Queue } from 'bullmq';
import { ScrapeRunModel, VerificationRunModel } from '@promotions/database';
import type { ScrapeJobPayload, VerifyJobPayload } from '@promotions/jobs';

export type AppDependencies = {
  database: Sequelize;
  scrapeQueue: Queue<ScrapeJobPayload>;
  verifyQueue: Queue<VerifyJobPayload>;
};

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await deps.database.authenticate();
      const redis = await deps.scrapeQueue.client;
      const redisStatus = await redis.ping();
      res.json({ status: 'ok', database: 'ok', redis: redisStatus === 'PONG' ? 'ok' : 'degraded' });
    } catch (error: unknown) {
      res.status(503).json({ status: 'degraded', error: error instanceof Error ? error.message : 'Unknown health error' });
    }
  });

  app.post('/scrape', async (_req, res, next) => {
    const runId = randomUUID();
    const jobId = runId;
    try {
      await ScrapeRunModel.create({ id: runId, jobId, state: 'queued', sourceHealth: 'unknown', errorSummary: null, startedAt: null, finishedAt: null });
      await deps.scrapeQueue.add('scrape-portal', { runId }, { jobId });
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
      await deps.verifyQueue.add('verify-portal', { runId }, { jobId });
      res.status(202).json({ jobId, runId, state: 'queued' });
    } catch (error: unknown) {
      await VerificationRunModel.update({ state: 'failed', errorSummary: error instanceof Error ? error.message : 'Queue submission failed', finishedAt: new Date() }, { where: { id: runId } }).catch(() => undefined);
      next(error);
    }
  });

  app.get('/verify/:runId', async (req, res, next) => {
    try {
      const run = await VerificationRunModel.findByPk(req.params.runId, { include: [{ association: 'discrepancies' }] });
      if (!run) return void res.status(404).json({ error: 'Verification run not found' });
      res.json(run.toJSON());
    } catch (error: unknown) { next(error); }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
