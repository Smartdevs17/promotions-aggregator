import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const SCRAPE_QUEUE = 'scrape';
export const VERIFY_QUEUE = 'verify';

export type ScrapeJobPayload = { runId: string };
export type VerifyJobPayload = { runId: string };

export function createRedisConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

export function createQueues(redisUrl: string): {
  scrapeQueue: Queue<ScrapeJobPayload>;
  verifyQueue: Queue<VerifyJobPayload>;
  connection: IORedis;
} {
  const connection = createRedisConnection(redisUrl);
  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  };

  return {
    scrapeQueue: new Queue<ScrapeJobPayload>(SCRAPE_QUEUE, { connection, defaultJobOptions }),
    verifyQueue: new Queue<VerifyJobPayload>(VERIFY_QUEUE, { connection, defaultJobOptions }),
    connection,
  };
}
