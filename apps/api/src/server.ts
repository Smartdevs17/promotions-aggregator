import { createDatabase } from '@promotions/database';
import { createQueues } from '@promotions/jobs';
import { createApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('DATABASE_URL and REDIS_URL are required');

const database = createDatabase({ url: databaseUrl });
const queues = createQueues(redisUrl);
const app = createApp({ database, redisConnection: queues.connection, scrapeQueue: queues.scrapeQueue, verifyQueue: queues.verifyQueue });
const port = Number(process.env.API_PORT ?? 4000);
const server = app.listen(port, () => console.log(`API listening on :${port}`));

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down API`);
  server.close();
  await Promise.allSettled([queues.scrapeQueue.close(), queues.verifyQueue.close(), queues.connection.quit(), database.close()]);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
