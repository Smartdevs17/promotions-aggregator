import { Worker } from 'bullmq';
import { createDatabase } from '@promotions/database';
import { createRedisConnection, SCRAPE_QUEUE, VERIFY_QUEUE, type ScrapeJobPayload, type VerifyJobPayload } from '@promotions/jobs';
import { processScrape, processVerification } from './processors.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('DATABASE_URL and REDIS_URL are required');
const database = createDatabase({ url: databaseUrl });
const connection = createRedisConnection(redisUrl);

const scrapeWorker = new Worker<ScrapeJobPayload>(SCRAPE_QUEUE, async (job) => {
  console.log(JSON.stringify({ event: 'scrape_started', jobId: job.id, runId: job.data.runId }));
  await processScrape(job.data.runId);
}, { connection, concurrency: 1, lockDuration: 15 * 60_000 });

const verifyWorker = new Worker<VerifyJobPayload>(VERIFY_QUEUE, async (job) => {
  console.log(JSON.stringify({ event: 'verify_started', jobId: job.id, runId: job.data.runId }));
  await processVerification(job.data.runId);
}, { connection, concurrency: 1, lockDuration: 15 * 60_000 });

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
