import { z } from 'zod';

export const socialLinksSchema = z.record(z.string(), z.url());

export const brandSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  sourceUrl: z.url().nullable(),
  websiteUrl: z.url().nullable(),
  hours: z.string().nullable(),
  socialLinks: socialLinksSchema,
  scrapedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const verificationStatusSchema = z.enum(['pending', 'verified', 'changed', 'missing', 'failed']);

export const promotionSchema = z.object({
  id: z.uuid(),
  sourceKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  imageUrl: z.url().nullable(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  canonicalUrl: z.url(),
  sourcePortal: z.url(),
  scrapedAt: z.iso.datetime(),
  lastVerifiedAt: z.iso.datetime().nullable(),
  verificationStatus: verificationStatusSchema,
  brand: brandSchema,
});

export const runStateSchema = z.enum(['queued', 'active', 'completed', 'failed', 'suspicious']);

export const scrapeRunSchema = z.object({
  id: z.uuid(),
  jobId: z.string().min(1),
  state: runStateSchema,
  attempted: z.number().int().nonnegative(),
  persisted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  errorSummary: z.string().nullable(),
  sourceHealth: z.enum(['unknown', 'healthy', 'suspicious', 'unreachable']),
});

export const discrepancyKindSchema = z.enum(['missing', 'changed', 'unverifiable']);

export const verificationDiscrepancySchema = z.object({
  promotionId: z.uuid(),
  promotionName: z.string(),
  kind: discrepancyKindSchema,
  field: z.string().nullable(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  reason: z.string().nullable(),
});

export const verificationReportSchema = z.object({
  id: z.uuid(),
  jobId: z.string().min(1),
  state: runStateSchema,
  clean: z.boolean(),
  checked: z.number().int().nonnegative(),
  discrepancies: z.array(verificationDiscrepancySchema),
  errorSummary: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const promotionsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  brand: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Brand = z.infer<typeof brandSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type ScrapeRun = z.infer<typeof scrapeRunSchema>;
export type VerificationReport = z.infer<typeof verificationReportSchema>;
export type VerificationDiscrepancy = z.infer<typeof verificationDiscrepancySchema>;
export type PromotionsQuery = z.infer<typeof promotionsQuerySchema>;

export * from './jobs.js';
