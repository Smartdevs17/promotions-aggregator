import { expect, test, type Page } from '@playwright/test';

const brands = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Altar’d State', normalizedName: 'altar’d state', sourceUrl: 'https://mall.test/stores/altar', websiteUrl: 'https://www.altardstate.com/', hours: 'Mon–Sat 10am–8pm', socialLinks: {}, scrapedAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z', promotionCount: 6 },
  { id: '10000000-0000-4000-8000-000000000002', name: 'lululemon', normalizedName: 'lululemon', sourceUrl: 'https://mall.test/stores/lululemon', websiteUrl: 'https://shop.lululemon.com/', hours: 'Mon–Sun 10am–8pm', socialLinks: {}, scrapedAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z', promotionCount: 6 },
];

const promotions = Array.from({ length: 12 }, (_, index) => {
  const brand = brands[index % brands.length]!;
  return {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sourceKey: `source-${index + 1}`,
    name: index === 0 ? 'Summer Essentials Sale' : `${brand.name} Offer ${index + 1}`,
    description: index === 1 ? null : 'A current offer from the mall source.',
    imageUrl: index % 3 === 0 ? null : `https://images.example.com/promotion-${index + 1}.jpg`,
    startDate: null,
    endDate: index === 2 ? null : '2026-09-30',
    canonicalUrl: `https://mall.test/deals/${index + 1}`,
    sourcePortal: 'https://mall.test/sales',
    scrapedAt: '2026-09-10T10:00:00.000Z',
    lastVerifiedAt: null,
    verificationStatus: index === 3 ? 'changed' : 'pending',
    brand,
  };
});

async function mockApi(page: Page) {
  await page.route('http://localhost:4000/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/brands') return route.fulfill({ json: { items: brands } });
    if (request.method() === 'GET' && url.pathname === '/promotions') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const selectedBrand = url.searchParams.get('brand') ?? '';
      const filtered = promotions.filter((promotion) => (!search || `${promotion.name} ${promotion.brand.name}`.toLowerCase().includes(search)) && (!selectedBrand || promotion.brand.name === selectedBrand));
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 8);
      return route.fulfill({ json: { items: filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), pagination: { page: pageNumber, pageSize, totalItems: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) } } });
    }
    if (request.method() === 'POST' && ['/scrape', '/verify'].includes(url.pathname)) return route.fulfill({ status: 202, json: { jobId: 'job-1', runId: 'run-1', state: 'queued' } });
    if (request.method() === 'GET' && url.pathname === '/scrape/job-1') return route.fulfill({ json: { id: '30000000-0000-4000-8000-000000000001', jobId: 'job-1', state: 'completed', attempted: 12, persisted: 4, updated: 8, skipped: 0, failed: 0, sourceHealth: 'healthy', errorSummary: null, startedAt: null, finishedAt: null } });
    if (request.method() === 'GET' && url.pathname === '/verify/run-1') return route.fulfill({ json: { id: '40000000-0000-4000-8000-000000000001', jobId: 'job-1', state: 'completed', checked: 12, discrepancyCount: 1, clean: false, discrepancies: [], errorSummary: null, startedAt: null, finishedAt: null } });
    return route.continue();
  });
}

test.describe('promotions dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Promotions Aggregator' })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(8);
  });

  test('searches, filters, paginates, groups, and links to sources', async ({ page }) => {
    await page.getByLabel('Search promotions').fill('summer essentials');
    await expect(page.locator('.card')).toHaveCount(1);
    await page.getByLabel('Search promotions').fill('');
    await page.getByLabel('Filter by brand').selectOption({ label: 'lululemon (6)' });
    await expect(page.locator('.card')).toHaveCount(6);
    await page.getByLabel('Search promotions').fill('LuLuLeMoN');
    await expect(page.locator('.card')).toHaveCount(6);
    await page.getByLabel('Search promotions').fill('');
    await expect(page.locator('.card')).toHaveCount(6);
    await page.getByLabel('Filter by brand').selectOption('');
    await expect(page.locator('.card')).toHaveCount(8);
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Group by brand' }).click();
    await expect(page.getByRole('heading', { name: 'Altar’d State', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Source ↗' }).first()).toHaveAttribute('href', /\/deals\//);
  });

  test('shows asynchronous scrape and verification status without freezing', async ({ page }) => {
    await page.getByRole('button', { name: 'Run scrape' }).click();
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    await expect(page.getByText('completed', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Attempted', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Verify data' }).click();
    await expect(page.getByText('Discrepancies', { exact: true })).toBeVisible();
    await expect(page.getByText('Clean', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('no', { exact: true })).toBeVisible();
  });
});
