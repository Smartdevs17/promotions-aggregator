'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrandSummary, Promotion } from '@promotions/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type PageResponse = {
  items: Promotion[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

type Run = {
  id?: string;
  runId?: string;
  jobId: string;
  state: string;
  attempted?: number;
  persisted?: number;
  updated?: number;
  failed?: number;
  sourceHealth?: string;
  checked?: number;
  discrepancyCount?: number;
  clean?: boolean;
  errorSummary?: string | null;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export default function HomePage() {
  const [data, setData] = useState<PageResponse>({ items: [], pagination: { page: 1, pageSize: 8, totalItems: 0, totalPages: 0 } });
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const [grouped, setGrouped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);

  async function loadPromotions(nextPage = page): Promise<void> {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: '8' });
    if (search.trim()) params.set('search', search.trim());
    if (brand) params.set('brand', brand);
    try {
      setData(await getJson<PageResponse>(`/promotions?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load promotions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void getJson<BrandSummary[]>('/brands').then(setBrands).catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadPromotions(page), 250);
    return () => clearTimeout(timer);
  }, [page, search, brand]);

  const groups = useMemo(() => {
    const map = new Map<string, Promotion[]>();
    for (const promotion of data.items) {
      const current = map.get(promotion.brand.name) ?? [];
      current.push(promotion);
      map.set(promotion.brand.name, current);
    }
    return [...map.entries()];
  }, [data.items]);

  async function trigger(kind: 'scrape' | 'verify'): Promise<void> {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/${kind}`, { method: 'POST' });
      if (!response.ok) throw new Error(`${kind} trigger failed (${response.status})`);
      const initial = await response.json() as Run;
      setRun(initial);
      const id = kind === 'scrape' ? initial.jobId : (initial.runId ?? initial.id ?? initial.jobId);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const latest = await getJson<Run>(`/${kind}/${id}`);
        setRun(latest);
        if (['completed', 'failed', 'suspicious'].includes(latest.state)) {
          if (kind === 'scrape' && latest.state !== 'failed') await loadPromotions(1);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to run ${kind}`);
    }
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">SINGLE-MALL MVP</p>
          <h1>Promotions Aggregator</h1>
          <p className="lede">Live offers from The Promenade Shops at Briargate, enriched with store metadata and verification status.</p>
        </div>
        <div className="actions">
          <button onClick={() => void trigger('scrape')}>Run scrape</button>
          <button className="secondary" onClick={() => void trigger('verify')}>Verify data</button>
        </div>
      </header>

      {run && (
        <section className="run-panel">
          <div><span>Job</span><strong>{run.jobId.slice(0, 8)}…</strong></div>
          <div><span>Status</span><strong>{run.state}</strong></div>
          {run.sourceHealth && <div><span>Source</span><strong>{run.sourceHealth}</strong></div>}
          {run.attempted !== undefined && <div><span>Attempted</span><strong>{run.attempted}</strong></div>}
          {run.updated !== undefined && <div><span>Updated</span><strong>{run.updated}</strong></div>}
          {run.discrepancyCount !== undefined && <div><span>Discrepancies</span><strong>{run.discrepancyCount}</strong></div>}
          {run.errorSummary && <p className="error">{run.errorSummary}</p>}
        </section>
      )}

      <section className="toolbar">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search promotion or brand…" aria-label="Search promotions" />
        <select value={brand} onChange={(event) => { setBrand(event.target.value); setPage(1); }} aria-label="Filter by brand">
          <option value="">All brands</option>
          {brands.map((item) => <option key={item.id} value={item.name}>{item.name} ({item.promotionCount})</option>)}
        </select>
        <button className="toggle" aria-pressed={grouped} onClick={() => setGrouped((value) => !value)}>{grouped ? 'Flat view' : 'Group by brand'}</button>
      </section>

      <div className="summary"><strong>{data.pagination.totalItems}</strong> promotions found</div>
      {error && <p className="error banner">{error}</p>}
      {loading ? <p className="empty">Loading promotions…</p> : data.items.length === 0 ? <p className="empty">No promotions match these filters.</p> : grouped ? (
        <div className="groups">
          {groups.map(([name, promotions]) => (
            <section className="brand-group" key={name}>
              <div className="brand-head">
                <div><h2>{name}</h2><p>{promotions[0]?.brand.hours ?? 'Hours unavailable'}</p></div>
                {promotions[0]?.brand.websiteUrl && <a href={promotions[0].brand.websiteUrl} target="_blank" rel="noreferrer">Store website ↗</a>}
              </div>
              <div className="grid">{promotions.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} />)}</div>
            </section>
          ))}
        </div>
      ) : <div className="grid">{data.items.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} />)}</div>}

      <nav className="pagination" aria-label="Pagination">
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button>
        <span>Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</span>
        <button disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next →</button>
      </nav>
    </main>
  );
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  return (
    <article className="card">
      <div className="image-wrap">
        {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" /> : <div className="image-placeholder">No image</div>}
        <span className={`status ${promotion.verificationStatus}`}>{promotion.verificationStatus}</span>
      </div>
      <div className="card-body">
        <p className="brand">{promotion.brand.name}</p>
        <h3>{promotion.name}</h3>
        <p className="description">{promotion.description ?? 'No description provided by source.'}</p>
        <div className="meta"><span>{promotion.endDate ? `Ends ${promotion.endDate}` : 'End date unavailable'}</span><a href={promotion.canonicalUrl} target="_blank" rel="noreferrer">Source ↗</a></div>
      </div>
    </article>
  );
}
