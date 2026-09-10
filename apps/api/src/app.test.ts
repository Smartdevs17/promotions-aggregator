import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const models = vi.hoisted(() => ({
  scrapeCreate: vi.fn(), scrapeUpdate: vi.fn(), scrapeFindOne: vi.fn(),
  verifyCreate: vi.fn(), verifyUpdate: vi.fn(), verifyFindByPk: vi.fn(),
}));

vi.mock('@promotions/database', () => ({
  ScrapeRunModel: { create: models.scrapeCreate, update: models.scrapeUpdate, findOne: models.scrapeFindOne },
  VerificationRunModel: { create: models.verifyCreate, update: models.verifyUpdate, findByPk: models.verifyFindByPk },
}));

function dependencies() {
  return {
    database: { authenticate: vi.fn().mockResolvedValue(undefined) } as never,
    redisConnection: { ping: vi.fn().mockResolvedValue('PONG') } as never,
    scrapeQueue: { add: vi.fn().mockResolvedValue(undefined) } as never,
    verifyQueue: { add: vi.fn().mockResolvedValue(undefined) } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  models.scrapeCreate.mockResolvedValue(undefined);
  models.verifyCreate.mockResolvedValue(undefined);
  models.scrapeFindOne.mockResolvedValue(null);
  models.verifyFindByPk.mockResolvedValue(null);
});

describe('async API contract', () => {
  it('enqueues scrape and returns without waiting', async () => {
    const response = await request(createApp(dependencies())).post('/scrape');
    expect(response.status).toBe(202);
    expect(response.body.jobId).toBe(response.body.runId);
    expect(response.body.state).toBe('queued');
  });

  it('enqueues verification and returns 202', async () => {
    const response = await request(createApp(dependencies())).post('/verify');
    expect(response.status).toBe(202);
    expect(response.body.runId).toBeTypeOf('string');
  });

  it('returns 404 for unknown jobs and verification runs', async () => {
    const app = createApp(dependencies());
    expect((await request(app).get('/scrape/unknown')).status).toBe(404);
    expect((await request(app).get('/verify/unknown')).status).toBe(404);
  });

  it('reports health degradation without taking down the API', async () => {
    const deps = dependencies();
    (deps.redisConnection as { ping: ReturnType<typeof vi.fn> }).ping.mockRejectedValue(new Error('redis unavailable'));
    const response = await request(createApp(deps)).get('/health');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
  });
});
