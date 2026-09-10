'use client';

import { useEffect, useMemo, useState } from 'react';
import { brandsResponseSchema, promotionsPageSchema, scrapeRunSchema, verificationReportSchema, type BrandSummary, type Promotion, type PromotionsPage, type ScrapeRun, type VerificationReport } from '@promotions/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Run = Partial<ScrapeRun & VerificationReport> & { id?: string; runId?: string; jobId: string };
type Toast = { tone: 'info' | 'success' | 'warning' | 'error'; message: string };

function friendlyError(message: string | null | undefined, action: 'scrape' | 'verify' | 'api' = 'api'): string {
  const value = message?.toLowerCase() ?? '';
  if (value.includes('source portal was unreachable')) {
    return `The mall website could not be reached. Check your internet or DNS connection, then try ${action === 'verify' ? 'verification' : 'the scrape'} again.`;
  }
  if (value.includes('failed to fetch') || value.includes('request failed') || value.includes('trigger failed')) {
    return 'The API could not be reached. Make sure the backend is running, then try again.';
  }
  return message ?? 'Something went wrong. Please try again.';
}

async function getJson<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return parse(await response.json());
}

export default function HomePage() {
  const [data, setData] = useState<PromotionsPage>({ items: [], pagination: { page: 1, pageSize: 8, totalItems: 0, totalPages: 0 } });
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const [grouped, setGrouped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [activeKind, setActiveKind] = useState<'scrape' | 'verify' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const triggering = activeKind !== null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5_000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function loadPromotions(nextPage = page): Promise<void> {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(nextPage), pageSize: '8' });
    if (search.trim()) params.set('search', search.trim());
    if (brand) params.set('brand', brand);
    try { setData(await getJson(`/promotions?${params}`, (value) => promotionsPageSchema.parse(value))); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load promotions'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void getJson('/brands', (value) => brandsResponseSchema.parse(value)).then((value) => setBrands(value.items)).catch(() => setBrands([])); }, []);
  useEffect(() => { const timer = setTimeout(() => void loadPromotions(page), 250); return () => clearTimeout(timer); }, [page, search, brand]);

  const groups = useMemo(() => {
    const map = new Map<string, Promotion[]>();
    for (const promotion of data.items) map.set(promotion.brand.name, [...(map.get(promotion.brand.name) ?? []), promotion]);
    return [...map.entries()];
  }, [data.items]);

  async function trigger(kind: 'scrape' | 'verify'): Promise<void> {
    const label = kind === 'scrape' ? 'Scrape' : 'Verification';
    setError(null); setActiveKind(kind); setToast({ tone: 'info', message: `${label} started. The worker is processing it in the background.` });
    try {
      const response = await fetch(`${API_URL}/${kind}`, { method: 'POST' });
      if (!response.ok) throw new Error(`${kind} trigger failed (${response.status})`);
      const initial = await response.json() as Run;
      setRun(initial);
      const id = kind === 'scrape' ? initial.jobId : (initial.runId ?? initial.id ?? initial.jobId);
      let terminal = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const latest = await getJson<Run>(`/${kind}/${id}`, (value) => kind === 'scrape' ? scrapeRunSchema.parse(value) : verificationReportSchema.parse(value));
        setRun(latest);
        if (latest.state !== undefined && ['completed', 'failed', 'suspicious'].includes(latest.state)) {
          terminal = true;
          if (kind === 'scrape' && latest.state !== 'failed') { setPage(1); await loadPromotions(1); }
          if (latest.state === 'completed') {
            const detail = kind === 'scrape' ? `${latest.persisted ?? 0} saved, ${latest.failed ?? 0} failed` : `${latest.discrepancyCount ?? 0} discrepancies found`;
            setToast({ tone: 'success', message: `${label} completed — ${detail}.` });
          } else if (latest.state === 'suspicious') {
            setToast({ tone: 'warning', message: `${label} completed with a suspicious source result.` });
          } else {
            const message = friendlyError(latest.errorSummary, kind);
            setToast({ tone: 'error', message: `${label} failed — ${message}` });
          }
          break;
        }
      }
      if (!terminal) {
        const message = `${kind} did not finish before the polling timeout`;
        setError(message); setToast({ tone: 'error', message });
      }
    } catch (err) {
      const message = friendlyError(err instanceof Error ? err.message : `Unable to run ${kind}`, kind);
      setError(message); setToast({ tone: 'error', message });
    }
    finally { setActiveKind(null); }
  }

  return <main>
    <header className="hero"><div><p className="eyebrow">SINGLE-MALL MVP</p><h1>Promotions Aggregator</h1><p className="lede">Live offers from The Promenade Shops at Briargate, enriched with store metadata and verification status.</p></div><div className="actions"><button disabled={triggering} aria-busy={activeKind === 'scrape'} onClick={() => void trigger('scrape')}>{activeKind === 'scrape' && <span className="spinner" aria-hidden="true"/>}{activeKind === 'scrape' ? 'Starting…' : 'Run scrape'}</button><button disabled={triggering} aria-busy={activeKind === 'verify'} className="secondary" onClick={() => void trigger('verify')}>{activeKind === 'verify' && <span className="spinner" aria-hidden="true"/>}{activeKind === 'verify' ? 'Starting…' : 'Verify data'}</button></div></header>
    {toast && <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} aria-live="polite"><span className="toast-dot" aria-hidden="true"/>{toast.message}<button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div>}
    {run && <section className="run-panel" aria-live="polite"><div><span>Job</span><strong>{run.jobId.slice(0, 8)}…</strong></div><div><span>Status</span><strong>{run.state}</strong></div>{run.sourceHealth && <div><span>Source</span><strong>{run.sourceHealth}</strong></div>}{run.attempted !== undefined && <div><span>Attempted</span><strong>{run.attempted}</strong></div>}{run.persisted !== undefined && <div><span>Persisted</span><strong>{run.persisted}</strong></div>}{run.updated !== undefined && <div><span>Updated</span><strong>{run.updated}</strong></div>}{run.failed !== undefined && <div><span>Failed</span><strong>{run.failed}</strong></div>}{run.checked !== undefined && <div><span>Checked</span><strong>{run.checked}</strong></div>}{run.discrepancyCount !== undefined && <div><span>Discrepancies</span><strong>{run.discrepancyCount}</strong></div>}{run.clean !== undefined && <div><span>Clean</span><strong>{run.clean ? 'yes' : 'no'}</strong></div>}{run.errorSummary && <p className="error">{friendlyError(run.errorSummary, run.checked !== undefined ? 'verify' : 'scrape')}</p>}</section>}
    <section className="toolbar"><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search promotion or brand…" aria-label="Search promotions"/><select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} aria-label="Filter by brand"><option value="">All brands</option>{brands.map((item) => <option key={item.id} value={item.name}>{item.name} ({item.promotionCount})</option>)}</select><button className="toggle" aria-pressed={grouped} onClick={() => setGrouped((value) => !value)}>{grouped ? 'Flat view' : 'Group by brand'}</button></section>
    <div className="summary"><strong>{data.pagination.totalItems}</strong> promotions found</div>
    {error && <p className="error banner">{error}</p>}
    {loading ? <p className="empty">Loading promotions…</p> : data.items.length === 0 ? <p className="empty">No promotions match these filters.</p> : grouped ? <div className="groups">{groups.map(([name, promotions]) => <section className="brand-group" key={name}><div className="brand-head"><div><h2>{name}</h2><p>{promotions[0]?.brand.hours ?? 'Hours unavailable'}</p></div>{promotions[0]?.brand.websiteUrl && <a href={promotions[0].brand.websiteUrl} target="_blank" rel="noreferrer">Store website ↗</a>}</div><div className="grid">{promotions.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion}/>)}</div></section>)}</div> : <div className="grid">{data.items.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion}/>)}</div>}
    <nav className="pagination" aria-label="Pagination"><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>← Previous</button><span>Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</span><button aria-label="Next page" disabled={page >= data.pagination.totalPages} onClick={() => setPage((v) => v + 1)}>Next →</button></nav>
  </main>;
}

function PromotionCard({ promotion }: { promotion: Promotion }) {
  return <article className="card"><div className="image-wrap">{promotion.imageUrl ? <img src={promotion.imageUrl} alt=""/> : <div className="image-placeholder">No image</div>}<span className={`status ${promotion.verificationStatus}`}>{promotion.verificationStatus}</span></div><div className="card-body"><p className="brand">{promotion.brand.name}</p><h3>{promotion.name}</h3><p className="description">{promotion.description ?? 'No description provided by source.'}</p><div className="meta"><span>{promotion.endDate ? `Ends ${promotion.endDate}` : 'End date unavailable'}</span><a href={promotion.canonicalUrl} target="_blank" rel="noreferrer">Source ↗</a></div></div></article>;
}
