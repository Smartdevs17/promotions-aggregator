import { describe, expect, it } from 'vitest';
import { discoverPromotionLinks, parseBrandDetail, parsePromotionDetail } from './parser.js';
import { canonicalizeUrl, makeSourceKey } from './normalize.js';

const listingUrl = 'https://www.thepromenadeshopsatbriargate.com/sales';

describe('scraper parsing', () => {
  it('discovers unique same-origin promotion detail links', () => {
    const html = `
      <a href="/sales">Sales</a>
      <a href="/sales/summer-style">Summer Style</a>
      <a href="/deals/3434190/">Live deal</a>
      <a href="/deals/3434190/?utm_source=test#details">Duplicate live deal</a>
      <a href="https://www.thepromenadeshopsatbriargate.com/sales/summer-style?utm_source=test">Duplicate</a>
      <a href="https://example.com/sales/external">External</a>
    `;
    expect(discoverPromotionLinks(html, listingUrl)).toEqual([
      'https://www.thepromenadeshopsatbriargate.com/sales/summer-style',
      'https://www.thepromenadeshopsatbriargate.com/deals/3434190',
    ]);
  });

  it('parses a promotion detail with brand link, dates, image and canonical identity', () => {
    const pageUrl = `${listingUrl}/summer-style?utm_campaign=x`;
    const html = `
      <html><head>
        <link rel="canonical" href="/sales/summer-style" />
        <meta name="description" content="Save 25% on selected styles" />
        <meta property="og:image" content="/images/sale.jpg?utm_source=x" />
      </head><body>
        <main>
          <h1>Summer Style Event</h1>
          <div class="tenant"><a href="/stores/example-store">Example Store</a></div>
          <time itemprop="validFrom" datetime="2026-09-01"></time>
          <time itemprop="validThrough" datetime="2026-09-30"></time>
        </main>
      </body></html>
    `;
    const result = parsePromotionDetail(html, pageUrl, listingUrl);
    expect(result.name).toBe('Summer Style Event');
    expect(result.brandName).toBe('Example Store');
    expect(result.brandSourceUrl).toBe('https://www.thepromenadeshopsatbriargate.com/stores/example-store');
    expect(result.startDate).toBe('2026-09-01');
    expect(result.endDate).toBe('2026-09-30');
    expect(result.canonicalUrl).toBe('https://www.thepromenadeshopsatbriargate.com/sales/summer-style');
    expect(result.sourceKey).toBe(makeSourceKey(result.canonicalUrl));
  });

  it('extracts brand website, social links and hours', () => {
    const html = `
      <main><div class="store-container-component">
        <h1>Example Store</h1>
        <ul class="opening-hours"><li>Monday - Saturday 10 AM - 9 PM</li><li>Sunday 11 AM - 6 PM</li></ul>
        <a class="external_link ext_retailer" href="https://example-store.com/?utm_source=mall">View Website</a>
        <a href="https://instagram.com/example-store">Instagram</a>
        <a href="https://facebook.com/example-store">Facebook</a>
      </div><footer><a href="https://instagram.com/mall">Mall Instagram</a></footer></main>
    `;
    const brand = parseBrandDetail(html, 'https://www.thepromenadeshopsatbriargate.com/stores/example-store', 'Fallback');
    expect(brand.name).toBe('Example Store');
    expect(brand.normalizedName).toBe('example store');
    expect(brand.websiteUrl).toBe('https://example-store.com/');
    expect(brand.hours).toContain('Monday - Saturday');
    expect(brand.socialLinks.instagram).toBe('https://instagram.com/example-store');
    expect(brand.socialLinks.facebook).toBe('https://facebook.com/example-store');
  });

  it('uses the live portal store link instead of navigation links for promotion brands', () => {
    const html = `
      <main>
        <nav><a href="/directory-map/">Directory Map</a></nav>
        <div class="deal-detail-info">
          <h1>Sample live deal</h1>
          <a class="store-link" href="/stores/1036000-bath-and-body-works/">Bath &amp; Body Works</a>
        </div>
      </main>
    `;
    const result = parsePromotionDetail(html, 'https://www.thepromenadeshopsatbriargate.com/deals/3434190/', listingUrl);
    expect(result.brandName).toBe('Bath & Body Works');
    expect(result.brandSourceUrl).toBe('https://www.thepromenadeshopsatbriargate.com/stores/1036000-bath-and-body-works');
  });
});

describe('canonical identity', () => {
  it('drops tracking parameters and hash but preserves meaningful query parameters deterministically', () => {
    const url = canonicalizeUrl('HTTPS://WWW.ThePromenadeShopsAtBriargate.com/sales/item/?utm_source=x&b=2&a=1#details');
    expect(url).toBe('https://www.thepromenadeshopsatbriargate.com/sales/item?a=1&b=2');
    expect(makeSourceKey(url)).toHaveLength(64);
  });
});
