import { describe, expect, it } from 'vitest';
import { normalizeComparableValue } from './processors.js';

describe('verification comparison normalization', () => {
  it('ignores whitespace and canonical URL differences', () => {
    expect(normalizeComparableValue('name', '  Summer   Sale ')).toBe('Summer Sale');
    expect(normalizeComparableValue('canonicalUrl', 'https://EXAMPLE.com/deal/?utm_source=x#top')).toBe('https://example.com/deal');
  });

  it('ignores image CDN query churn and social object ordering', () => {
    expect(normalizeComparableValue('imageUrl', 'https://cdn.example/image.jpg?v=1')).toBe('https://cdn.example/image.jpg');
    expect(normalizeComparableValue('imageUrl', 'https://cdn.example/image.jpg?v=2')).toBe('https://cdn.example/image.jpg');
    expect(normalizeComparableValue('brand.socialLinks', '{"facebook":"https://facebook.com/x","instagram":"https://instagram.com/x"}'))
      .toBe(normalizeComparableValue('brand.socialLinks', '{"instagram":"https://instagram.com/x","facebook":"https://facebook.com/x"}'));
  });

  it('preserves meaningful changes', () => {
    expect(normalizeComparableValue('description', '10% off')).not.toBe(normalizeComparableValue('description', '20% off'));
  });
});
