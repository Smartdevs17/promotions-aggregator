import express, { type Express } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import type { Sequelize } from 'sequelize';
import type { Queue } from 'bullmq';
import { ScrapeRunModel, VerificationRunModel } from '@promotions/database';
import type { RedisConnection, ScrapeJobPayload, VerifyJobPayload } from '@promotions/jobs';

export type AppDependencies = {
  database: Sequelize;
  redisConnection: RedisConnection;
  scrapeQueue: Queue<ScrapeJobPayload>;
  verifyQueue: Queue<VerifyJobPayload>;
};

const queueSubmissionTimeoutMs = Number(process.env.QUEUE_SUBMISSION_TIMEOUT_MS ?? 5_000);

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

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await deps.database.authenticate();
      const redisStatus = await deps.redisConnection.ping();
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
