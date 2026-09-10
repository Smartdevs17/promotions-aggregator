import { Worker } from 'bullmq';
import { createDatabase, ScrapeRunModel, VerificationRunModel } from '@promotions/database';
import { createRedisConnection, SCRAPE_QUEUE, VERIFY_QUEUE, type ScrapeJobPayload, type VerifyJobPayload } from '@promotions/jobs';
import { processScrape, processVerification } from './processors.js';
import { withJobTimeout } from './timeout.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('DATABASE_URL and REDIS_URL are required');
const database = createDatabase({ url: databaseUrl });
const connection = createRedisConnection(redisUrl);
const jobTimeoutMs = Number(process.env.JOB_TIMEOUT_MS ?? 10 * 60_000);
if (!Number.isFinite(jobTimeoutMs) || jobTimeoutMs <= 0) throw new Error('JOB_TIMEOUT_MS must be a positive number');

async function markRunFailed(kind: 'scrape' | 'verify', runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown worker failure';
  if (kind === 'scrape') {
    await ScrapeRunModel.update({ state: 'failed', errorSummary: message, finishedAt: new Date() }, { where: { id: runId } });
  } else {
    await VerificationRunModel.update({ state: 'failed', clean: false, errorSummary: message, finishedAt: new Date() }, { where: { id: runId } });
  }
}

const scrapeWorker = new Worker<ScrapeJobPayload>(SCRAPE_QUEUE, async (job) => {
  console.log(JSON.stringify({ event: 'scrape_started', jobId: job.id, runId: job.data.runId }));
  try { await withJobTimeout(processScrape(job.data.runId), jobTimeoutMs); }
  catch (error: unknown) { await markRunFailed('scrape', job.data.runId, error); throw error; }
}, { connection, concurrency: 1, lockDuration: 60_000, stalledInterval: 15_000 });

const verifyWorker = new Worker<VerifyJobPayload>(VERIFY_QUEUE, async (job) => {
  console.log(JSON.stringify({ event: 'verify_started', jobId: job.id, runId: job.data.runId }));
  try { await withJobTimeout(processVerification(job.data.runId), jobTimeoutMs); }
  catch (error: unknown) { await markRunFailed('verify', job.data.runId, error); throw error; }
}, { connection, concurrency: 1, lockDuration: 60_000, stalledInterval: 15_000 });

for (const worker of [scrapeWorker, verifyWorker]) {
  worker.on('completed', (job) => console.log(JSON.stringify({ event: 'job_completed', queue: worker.name, jobId: job.id })));
  worker.on('failed', (job, error) => console.error(JSON.stringify({ event: 'job_failed', queue: worker.name, jobId: job?.id, error: error.message })));
  worker.on('error', (error) => console.error(JSON.stringify({ event: 'worker_error', queue: worker.name, error: error.message })));
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down workers`);
  await Promise.allSettled([scrapeWorker.close(), verifyWorker.close(), connection.quit(), database.close()]);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
