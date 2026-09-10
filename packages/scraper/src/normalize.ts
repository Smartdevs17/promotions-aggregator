import { createHash } from 'node:crypto';

const TRACKING_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid']);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeBrandName(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase('en-US');
}

export function canonicalizeUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  const sorted = [...url.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, val] of sorted) url.searchParams.append(key, val);
  return url.toString();
}

export function makeSourceKey(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  const identity = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
  return createHash('sha256').update(identity).digest('hex');
}

export function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && normalizeWhitespace(value)) return normalizeWhitespace(value);
  }
  return null;
}
