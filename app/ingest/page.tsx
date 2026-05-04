'use client';

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CompanyStatus = 'idle' | 'running' | 'ingested' | 'review' | 'quarter-mismatch';

interface DivergentField {
  field: string;
  claudeValue: number | string | null;
  oaiValue: number | string | null;
  claudeQuote: string | null;
  oaiQuote: string | null;
}

interface QuarterMismatchData {
  extracted: string;
  selected: string;
  claudeData: Record<string, unknown>;
  oaiData: Record<string, unknown>;
  transcriptUrl: string;
}

interface CompanyState {
  ticker: string;
  name: string;
  type: 'vendor' | 'hyperscaler';
  sourceLabel: string;
  defaultUrl: string;
  status: CompanyStatus;
  urlOverride: string;
  transcriptUrl?: string;
  divergentFields?: DivergentField[];
  claudeData?: Record<string, unknown>;
  oaiData?: Record<string, unknown>;
  quarterMismatch?: QuarterMismatchData;
}

const QUARTERS = ['Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024'];
const COMPANY_ORDER = ['SSNLF', 'HXSCL', 'MU', 'SNDK', 'MSFT', 'GOOG', 'AMZN', 'META'];

const BASE_META: Record<string, { name: string; type: 'vendor' | 'hyperscaler' }> = {
  SNDK:  { name: 'SanDisk',   type: 'vendor' },
  MU:    { name: 'Micron',    type: 'vendor' },
  SSNLF: { name: 'Samsung',   type: 'vendor' },
  HXSCL: { name: 'SK Hynix', type: 'vendor' },
  MSFT:  { name: 'Microsoft', type: 'hyperscaler' },
  GOOG:  { name: 'Alphabet',  type: 'hyperscaler' },
  AMZN:  { name: 'Amazon',    type: 'hyperscaler' },
  META:  { name: 'Meta',      type: 'hyperscaler' },
};

function sourceLabel(ticker: string, defaultUrl: string): string {
  if (ticker === 'SSNLF') return 'Samsung IR PDF · auto-pattern';
  if (defaultUrl.includes('yahoo.com')) return 'Yahoo Finance';
  if (defaultUrl.includes('fool.com')) return 'Motley Fool';
  if (defaultUrl.includes('gurufocus')) return 'GuruFocus';
  if (defaultUrl) return 'URL';
  return '—';
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ status }: { status: CompanyStatus }) {
  const styles: Record<CompanyStatus, React.CSSProperties> = {
    idle:               { background: '#161410', color: 'var(--text-muted)', border: '0.5px solid var(--border)' },
    running:            { background: '#16120a', color: 'var(--gold)',       border: '0.5px solid rgba(201,168,76,0.27)' },
    ingested:           { background: '#0a160e', color: '#4a9a6a',           border: '0.5px solid rgba(74,154,106,0.27)' },
    review:             { background: '#16120a', color: 'var(--gold)',       border: '0.5px solid rgba(201,168,76,0.27)' },
    'quarter-mismatch': { background: '#160f08', color: '#c9784c',          border: '0.5px solid rgba(201,120,76,0.4)' },
  };
  const labels: Record<CompanyStatus, React.ReactNode> = {
    idle:               'idle',
    running:            <><AnimDot />running</>,
    ingested:           '✓ ingested',
    review:             '! review',
    'quarter-mismatch': '? quarter',
  };
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap', ...styles[status] }}>
      {labels[status]}
    </span>
  );
}

function AnimDot() {
  return <span style={{ display: 'inline-block', marginRight: 3, animation: 'pulseDot 1.2s ease-in-out infinite' }}>·</span>;
}

// ── Divergence panel ──────────────────────────────────────────────────────────

function DivergencePanel({ ticker, name, fields, onUseClaude, onUseOAI }: {
  ticker: string;
  name: string;
  fields: DivergentField[];
  onUseClaude: (field: string) => void;
  onUseOAI: (field: string) => void;
}) {
  return (
    <div style={{ background: '#0f0e08', border: '0.5px solid rgba(201,168,76,0.2)', borderRadius: 8, padding: '14px 16px', marginTop: 12 }}>
      <div style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {name} ({ticker}) · resolve divergence
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6a6058' }}>Field</span>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>Claude</span>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a7fa5' }}>OpenAI</span>
      </div>
      {fields.map(f => (
        <div key={f.field} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#6a6058', paddingTop: 2 }}>{f.field}</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--gold)' }}>
              {f.claudeValue != null ? String(f.claudeValue) + (f.field.includes('pct') ? '%' : f.field === 'mgmt_tone_score' ? ' / 5' : '') : '—'}
            </div>
            {f.claudeQuote && (
              <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.53)', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '1.5px solid rgba(201,168,76,0.27)', paddingLeft: 6, marginTop: 2 }}>
                &ldquo;{f.claudeQuote.substring(0, 100)}{f.claudeQuote.length > 100 ? '…' : ''}&rdquo;
              </div>
            )}
            <button onClick={() => onUseClaude(f.field)} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', marginTop: 4, background: '#16120a', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)' }}>
              use Claude →
            </button>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#4a7fa5' }}>
              {f.oaiValue != null ? String(f.oaiValue) + (f.field.includes('pct') ? '%' : f.field === 'mgmt_tone_score' ? ' / 5' : '') : '—'}
            </div>
            {f.oaiQuote && (
              <div style={{ fontSize: 9, color: 'rgba(74,127,165,0.53)', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '1.5px solid rgba(74,127,165,0.27)', paddingLeft: 6, marginTop: 2 }}>
                &ldquo;{f.oaiQuote.substring(0, 100)}{f.oaiQuote.length > 100 ? '…' : ''}&rdquo;
              </div>
            )}
            <button onClick={() => onUseOAI(f.field)} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', marginTop: 4, background: '#0a0f16', color: '#4a7fa5', border: '0.5px solid rgba(74,127,165,0.27)' }}>
              use OpenAI →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IngestPage() {
  const [quarter, setQuarter] = useState('Q1 2026');
  const [selectedTicker, setSelectedTicker] = useState('all');
  const [companies, setCompanies] = useState<Record<string, CompanyState>>({});
  const [isLocal, setIsLocal] = useState(true);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const divergenceRef = useRef<HTMLDivElement>(null);
  const companiesRef = useRef<Record<string, CompanyState>>({});
  companiesRef.current = companies;

  useEffect(() => {
    setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);

  // Load config + check already-ingested on quarter change — also resets all state
  useEffect(() => {
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then(data => {
        const configMap: Record<string, string> = {};
        for (const row of data.config || []) {
          configMap[row.ticker] = row.default_url ?? '';
        }
        const ingestedTickers = new Set(
          (data.signals || [])
            .filter((s: Record<string, string>) => s.quarter === quarter)
            .map((s: Record<string, string>) => s.ticker)
        );
        const states: Record<string, CompanyState> = {};
        for (const ticker of COMPANY_ORDER) {
          const meta = BASE_META[ticker];
          const defaultUrl = configMap[ticker] ?? '';
          states[ticker] = {
            ticker, name: meta.name, type: meta.type,
            sourceLabel: sourceLabel(ticker, defaultUrl),
            defaultUrl,
            status: ingestedTickers.has(ticker) ? 'ingested' : 'idle',
            urlOverride: '',
          };
        }
        setCompanies(states);
        setResolveTarget(null);
      })
      .catch(() => {
        const states: Record<string, CompanyState> = {};
        for (const ticker of COMPANY_ORDER) {
          const meta = BASE_META[ticker];
          states[ticker] = {
            ticker, name: meta.name, type: meta.type,
            sourceLabel: sourceLabel(ticker, ''), defaultUrl: '',
            status: 'idle', urlOverride: '',
          };
        }
        setCompanies(states);
        setResolveTarget(null);
      });
  }, [quarter]);

  function update(ticker: string, patch: Partial<CompanyState>) {
    setCompanies(prev => ({ ...prev, [ticker]: { ...prev[ticker], ...patch } }));
  }

  async function runOne(ticker: string) {
    const c = companiesRef.current[ticker];
    if (!c || c.status === 'running') return;

    update(ticker, { status: 'running', quarterMismatch: undefined });

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, quarter, urlOverride: c.urlOverride || undefined }),
      });
      const data = await res.json();

      if (data.status === 'ingested') {
        update(ticker, { status: 'ingested', transcriptUrl: data.transcriptUrl });
      } else if (data.status === 'review') {
        update(ticker, {
          status: 'review',
          transcriptUrl: data.transcriptUrl,
          divergentFields: data.divergentFields,
          claudeData: data.claudeData,
          oaiData: data.oaiData,
        });
        setResolveTarget(ticker);
        setTimeout(() => divergenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else if (data.status === 'quarter-mismatch') {
        update(ticker, {
          status: 'quarter-mismatch',
          quarterMismatch: {
            extracted: data.extractedQuarter,
            selected: data.selectedQuarter,
            claudeData: data.claudeData,
            oaiData: data.oaiData,
            transcriptUrl: data.transcriptUrl,
          },
        });
      } else {
        update(ticker, { status: 'idle' });
      }
    } catch {
      update(ticker, { status: 'idle' });
    }
  }

  async function proceedAnyway(ticker: string) {
    const c = companiesRef.current[ticker];
    if (!c?.quarterMismatch) return;

    update(ticker, { status: 'running' });

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force-save',
          ticker,
          quarter,
          claudeData: c.quarterMismatch.claudeData,
          oaiData: c.quarterMismatch.oaiData,
          transcriptUrl: c.quarterMismatch.transcriptUrl,
        }),
      });
      const data = await res.json();

      if (data.status === 'ingested') {
        update(ticker, { status: 'ingested', transcriptUrl: data.transcriptUrl, quarterMismatch: undefined });
      } else if (data.status === 'review') {
        update(ticker, {
          status: 'review',
          transcriptUrl: data.transcriptUrl,
          divergentFields: data.divergentFields,
          claudeData: data.claudeData,
          oaiData: data.oaiData,
          quarterMismatch: undefined,
        });
        setResolveTarget(ticker);
        setTimeout(() => divergenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      } else {
        update(ticker, { status: 'idle', quarterMismatch: undefined });
      }
    } catch {
      update(ticker, { status: 'idle', quarterMismatch: undefined });
    }
  }

  function runAll() {
    COMPANY_ORDER
      .filter(t => companiesRef.current[t]?.status !== 'ingested')
      .forEach(t => runOne(t));
  }

  async function resolveField(ticker: string, field: string, source: 'claude' | 'oai') {
    const c = companies[ticker];
    if (!c?.divergentFields) return;
    const sourceData = source === 'claude' ? c.claudeData : c.oaiData;
    const merged = { ...(c.claudeData || {}), [field]: sourceData?.[field] };
    const remaining = c.divergentFields.filter(f => f.field !== field);

    if (remaining.length === 0) {
      try {
        await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resolve', ticker, quarter, fields: merged, transcriptUrl: c.transcriptUrl ?? '' }),
        });
      } catch { /* silent */ }
      update(ticker, { status: 'ingested', divergentFields: [] });
      setResolveTarget(null);
    } else {
      update(ticker, { claudeData: merged, divergentFields: remaining });
    }
  }

  const reviewCompany = resolveTarget ? companies[resolveTarget] : null;
  const anyRunning = Object.values(companies).some(c => c.status === 'running');

  function rowBorder(status: CompanyStatus) {
    if (status === 'ingested')           return 'rgba(74,154,106,0.2)';
    if (status === 'review')             return 'rgba(201,168,76,0.27)';
    if (status === 'quarter-mismatch')   return 'rgba(201,120,76,0.4)';
    return 'var(--border)';
  }

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{`@keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:.25} }`}</style>

      {/* Production banner */}
      {!isLocal && (
        <div style={{ background: '#16120a', border: '0.5px solid rgba(201,168,76,0.4)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#d4c090' }}>⚠ Ingest is disabled on Vercel — transcript sites block data center IPs.</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Run <code style={{ background: '#1e1c18', padding: '1px 5px', borderRadius: 3, fontSize: 10, color: 'var(--gold)' }}>scripts/start-ingest.sh</code> locally.
          </span>
        </div>
      )}

      {/* Run bar */}
      <div style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>Quarter</span>
        <select
          value={quarter}
          onChange={e => setQuarter(e.target.value)}
          style={{ background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5, color: '#f5f0e8', fontSize: 11, padding: '5px 8px', width: 95, outline: 'none' }}
        >
          {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginLeft: 8 }}>Company</span>
        <select
          value={selectedTicker}
          onChange={e => setSelectedTicker(e.target.value)}
          style={{ background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5, color: 'var(--gold)', fontSize: 11, padding: '5px 8px', width: 160, outline: 'none' }}
        >
          <option value="all">All 8 companies</option>
          {COMPANY_ORDER.map(t => <option key={t} value={t}>{companies[t]?.name ?? t} ({t})</option>)}
        </select>
        <button
          onClick={runAll}
          disabled={anyRunning}
          style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '6px 16px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const, background: '#1e1c18', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)' }}
        >
          Run all
        </button>
        <button
          onClick={() => selectedTicker === 'all' ? runAll() : runOne(selectedTicker)}
          disabled={anyRunning}
          style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '6px 16px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const, background: 'var(--gold)', color: '#0e0c09', border: 'none' }}
        >
          Run selected
        </button>
      </div>

      {/* Company list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {COMPANY_ORDER.map(ticker => {
          const c = companies[ticker];
          if (!c) return null;

          return (
            <div key={ticker} style={{ background: 'var(--bg-surface)', border: `0.5px solid ${rowBorder(c.status)}`, borderRadius: 8, padding: '10px 14px' }}>

              {/* Top line: ticker · name · source · badge · action */}
              <div style={{ display: 'grid', gridTemplateColumns: '72px 90px 1fr 105px 60px', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#d4c090', letterSpacing: '0.05em' }}>{ticker}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.name}</span>
                <span style={{ fontSize: 9, color: 'var(--text-ghost)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.sourceLabel}</span>
                <Badge status={c.status} />
                {c.status === 'ingested' && c.transcriptUrl
                  ? <button onClick={() => window.open(c.transcriptUrl, '_blank')} style={{ fontSize: 10, color: '#4a7fa5', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' as const }}>view →</button>
                  : c.status === 'review'
                  ? <button onClick={() => { setResolveTarget(ticker); setTimeout(() => divergenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' as const }}>resolve →</button>
                  : <span />
                }
              </div>

              {/* Quarter mismatch warning */}
              {c.status === 'quarter-mismatch' && c.quarterMismatch && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#160f08', border: '0.5px solid rgba(201,120,76,0.3)', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: '#c9784c', flex: 1 }}>
                    Transcript looks like <strong>{c.quarterMismatch.extracted}</strong> but you selected <strong>{c.quarterMismatch.selected}</strong> — proceed anyway?
                  </span>
                  <button
                    onClick={() => proceedAnyway(ticker)}
                    style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#1e1208', color: '#c9784c', border: '0.5px solid rgba(201,120,76,0.4)', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                  >
                    Proceed
                  </button>
                  <button
                    onClick={() => update(ticker, { status: 'idle', quarterMismatch: undefined })}
                    style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#161410', color: 'var(--text-muted)', border: '0.5px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Bottom line: open → · url input (placeholder = default url) · run → */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                {c.defaultUrl && (
                  <a href={c.defaultUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 9, color: '#4a7fa5', textDecoration: 'underline', whiteSpace: 'nowrap' as const }}>
                    open →
                  </a>
                )}
                <input
                  placeholder={c.defaultUrl || 'paste working URL here'}
                  value={c.urlOverride}
                  onChange={e => update(ticker, { urlOverride: e.target.value })}
                  style={{ flex: 1, background: '#161410', border: '0.5px solid #2a2520', borderRadius: 4, color: '#f5f0e8', fontSize: 10, padding: '4px 8px', outline: 'none' }}
                />
                <button
                  onClick={() => runOne(ticker)}
                  disabled={c.status === 'running'}
                  style={{ fontSize: 9, color: c.status === 'running' ? 'var(--text-ghost)' : 'var(--gold)', padding: '3px 10px', border: '0.5px solid rgba(201,168,76,0.27)', borderRadius: 3, background: '#16120a', cursor: c.status === 'running' ? 'default' : 'pointer', whiteSpace: 'nowrap' as const }}
                >
                  {c.status === 'running' ? '…' : 'run →'}
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Divergence panel */}
      {reviewCompany && reviewCompany.divergentFields && reviewCompany.divergentFields.length > 0 && (
        <div ref={divergenceRef}>
          <DivergencePanel
            ticker={reviewCompany.ticker}
            name={reviewCompany.name}
            fields={reviewCompany.divergentFields}
            onUseClaude={field => resolveField(reviewCompany.ticker, field, 'claude')}
            onUseOAI={field => resolveField(reviewCompany.ticker, field, 'oai')}
          />
        </div>
      )}
    </div>
  );
}
