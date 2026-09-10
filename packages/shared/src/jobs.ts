import { z } from 'zod';

export const scrapeJobPayloadSchema = z.object({
  runId: z.uuid(),
  requestedAt: z.iso.datetime(),
});

export const scrapeTriggerResponseSchema = z.object({
  runId: z.uuid(),
  jobId: z.string().min(1),
  state: z.literal('queued'),
});

export const jobStatusResponseSchema = z.object({
  runId: z.uuid(),
  jobId: z.string().min(1),
  state: z.enum(['queued', 'active', 'completed', 'failed', 'suspicious']),
  attempted: z.number().int().nonnegative(),
  persisted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  sourceHealth: z.enum(['unknown', 'healthy', 'suspicious', 'unreachable']),
  errorSummary: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export type ScrapeJobPayload = z.infer<typeof scrapeJobPayloadSchema>;
export type ScrapeTriggerResponse = z.infer<typeof scrapeTriggerResponseSchema>;
export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;

export const SCRAPE_QUEUE_NAME = 'scrape';
