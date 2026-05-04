'use client';

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CompanyStatus = 'idle' | 'running' | 'ingested' | 'review' | 'needs-url' | 'quarter-mismatch';

interface DivergentField {
  field: string;
  claudeValue: number | string | null;
  oaiValue: number | string | null;
  claudeQuote: string | null;
  oaiQuote: string | null;
}

interface CompanyState {
  ticker: string;
  name: string;
  type: 'vendor' | 'hyperscaler';
  sourceLabel: string;
  defaultUrl: string;
  status: CompanyStatus;
  urlOverride: string;
  showUrlInput: boolean;
  transcriptUrl?: string;
  transcriptQuarter?: string;       // quarter detected in the transcript
  divergentFields?: DivergentField[];
  claudeData?: Record<string, unknown>;
  oaiData?: Record<string, unknown>;
}

const CURRENT_QUARTER = 'Q1 2026';

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
  if (ticker === 'SSNLF') return 'Morningstar · manual url';
  if (ticker === 'HXSCL') return 'Morningstar · manual url';
  if (defaultUrl.includes('fool.com')) return 'Motley Fool · default';
  if (defaultUrl) return 'URL · default';
  return 'No URL configured';
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  page: { background: 'var(--bg-base)', minHeight: '100vh' } as React.CSSProperties,

  runBar: {
    background: 'var(--bg-surface)', border: '0.5px solid var(--border)',
    borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center',
    gap: 10, marginBottom: 14,
  } as React.CSSProperties,

  rbLabel: {
    fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  quarterInput: {
    background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5,
    color: '#f5f0e8', fontSize: 11, padding: '5px 8px', width: 80, outline: 'none',
  } as React.CSSProperties,

  companySelect: {
    background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5,
    color: 'var(--gold)', fontSize: 11, padding: '5px 8px', width: 160, outline: 'none',
  } as React.CSSProperties,

  btnAll: {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    padding: '6px 16px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    background: '#1e1c18', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)',
  } as React.CSSProperties,

  btnSel: {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    padding: '6px 16px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    background: 'var(--gold)', color: '#0e0c09', border: 'none',
  } as React.CSSProperties,

  coList: { display: 'flex', flexDirection: 'column' as const, gap: 5 } as React.CSSProperties,

  coRow: (status: CompanyStatus) => ({
    background: (status === 'needs-url' || status === 'quarter-mismatch') ? '#110d08' : 'var(--bg-surface)',
    border: `0.5px solid ${
      status === 'needs-url'        ? 'rgba(201,120,76,0.33)'
      : status === 'quarter-mismatch' ? 'rgba(201,120,76,0.33)'
      : status === 'review'         ? 'rgba(201,168,76,0.27)'
      : status === 'ingested'       ? 'rgba(74,154,106,0.2)'
      : 'var(--border)'
    }`,
    borderRadius: (status === 'needs-url' || status === 'quarter-mismatch') ? '8px 8px 0 0' : 8,
    padding: '10px 14px',
    display: 'grid',
    gridTemplateColumns: '72px 90px 1fr 90px 80px',
    alignItems: 'center',
    gap: 10,
  }) as React.CSSProperties,

  coTicker: { fontSize: 11, fontWeight: 500, color: '#d4c090', letterSpacing: '0.05em' } as React.CSSProperties,
  coName: { fontSize: 10, color: 'var(--text-muted)' } as React.CSSProperties,
  coSource: (warn: boolean) => ({
    fontSize: 9, color: warn ? 'rgba(201,120,76,0.53)' : 'var(--text-ghost)',
    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
  }) as React.CSSProperties,
};

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ status }: { status: CompanyStatus }) {
  const styles: Record<CompanyStatus, React.CSSProperties> = {
    idle:               { background: '#161410', color: 'var(--text-muted)', border: '0.5px solid var(--border)' },
    running:            { background: '#16120a', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)' },
    ingested:           { background: '#0a160e', color: '#4a9a6a', border: '0.5px solid rgba(74,154,106,0.27)' },
    review:             { background: '#16120a', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)' },
    'needs-url':        { background: '#16100a', color: '#c9784c', border: '0.5px solid rgba(201,120,76,0.27)' },
    'quarter-mismatch': { background: '#16100a', color: '#c9784c', border: '0.5px solid rgba(201,120,76,0.27)' },
  };
  const labels: Record<CompanyStatus, React.ReactNode> = {
    idle:               'idle',
    running:            <><AnimDot />running</>,
    ingested:           '✓ ingested',
    review:             '! review',
    'needs-url':        'needs url',
    'quarter-mismatch': '! mismatch',
  };
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap', textAlign: 'center', ...styles[status] }}>
      {labels[status]}
    </span>
  );
}

function AnimDot() {
  return <span style={{ display: 'inline-block', marginRight: 4, animation: 'pulseDot 1.2s ease-in-out infinite' }}>·</span>;
}

// ── Action cell ───────────────────────────────────────────────────────────────

function Action({ status, onRun, onResolve, onFix, onView }: {
  status: CompanyStatus;
  onRun: () => void;
  onResolve: () => void;
  onFix: () => void;
  onView: () => void;
}) {
  const base: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', cursor: 'pointer', background: 'none', border: 'none' };
  if (status === 'idle')             return <button style={{ ...base, color: 'var(--gold)' }} onClick={onRun}>run →</button>;
  if (status === 'running')          return <span style={{ ...base, color: 'var(--text-ghost)' }}>—</span>;
  if (status === 'ingested')         return <button style={{ ...base, color: '#4a7fa5' }} onClick={onView}>view →</button>;
  if (status === 'review')           return <button style={{ ...base, color: 'var(--gold)' }} onClick={onResolve}>resolve →</button>;
  if (status === 'needs-url')        return <button style={{ ...base, color: 'var(--gold)' }} onClick={onFix}>fix →</button>;
  if (status === 'quarter-mismatch') return <span style={{ ...base, color: 'var(--text-ghost)' }}>—</span>;
  return null;
}

// ── URL expansion panel ───────────────────────────────────────────────────────

function UrlPanel({ defaultUrl, urlOverride, onChange, onRetry, quarter }: {
  defaultUrl: string;
  urlOverride: string;
  onChange: (v: string) => void;
  onRetry: () => void;
  quarter: string;
}) {
  return (
    <div style={{
      background: '#110d08', border: '0.5px solid rgba(201,120,76,0.2)',
      borderTop: 'none', borderRadius: '0 0 8px 8px',
      padding: '8px 14px', marginTop: 0, marginBottom: 0,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 9, color: '#c9784c', whiteSpace: 'nowrap' }}>Working URL:</span>
      <input
        style={{
          background: '#161410', border: '0.5px solid rgba(201,120,76,0.27)',
          borderRadius: 4, color: '#f5f0e8', fontSize: 10, padding: '4px 8px', flex: 1, outline: 'none',
        }}
        placeholder={defaultUrl ? 'override transcript URL' : `Paste transcript URL for ${quarter}`}
        value={urlOverride}
        onChange={e => onChange(e.target.value)}
      />
      {defaultUrl && (
        <a
          href={defaultUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 9, color: '#4a7fa5', textDecoration: 'underline', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          open source in browser →
        </a>
      )}
      <button
        onClick={onRetry}
        style={{
          fontSize: 9, color: 'var(--gold)', padding: '3px 10px',
          border: '0.5px solid rgba(201,168,76,0.27)', borderRadius: 3,
          background: '#16120a', cursor: 'pointer',
        }}
      >
        retry
      </button>
    </div>
  );
}

// ── Quarter mismatch panel ────────────────────────────────────────────────────

function QuarterMismatchPanel({ selectedQuarter, transcriptQuarter, onProceed, onCancel }: {
  selectedQuarter: string;
  transcriptQuarter: string;
  onProceed: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      background: '#110d08', border: '0.5px solid rgba(201,120,76,0.2)',
      borderTop: 'none', borderRadius: '0 0 8px 8px',
      padding: '10px 14px', marginTop: 0, marginBottom: 0,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 11, color: '#c9784c' }}>⚠</span>
      <span style={{ fontSize: 10, color: '#d4c090', flex: 1 }}>
        Transcript looks like <strong style={{ color: '#c9784c' }}>{transcriptQuarter}</strong> but you selected <strong style={{ color: 'var(--gold)' }}>{selectedQuarter}</strong> — proceed anyway?
      </span>
      <button
        onClick={onProceed}
        style={{
          fontSize: 9, padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
          background: '#16120a', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)',
          whiteSpace: 'nowrap',
        }}
      >
        Proceed
      </button>
      <button
        onClick={onCancel}
        style={{
          fontSize: 9, padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
          background: 'transparent', color: '#c9784c', border: '0.5px solid rgba(201,120,76,0.27)',
          whiteSpace: 'nowrap',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

// ── Divergence panel ──────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  bit_growth_pct: 'bit_growth_pct',
  capex_pct: 'capex_pct',
  asp_change_pct: 'asp_change_pct',
  inventory_days: 'inventory_days',
  mgmt_tone_score: 'mgmt_tone_score',
};

function DivergencePanel({ ticker, name, fields, onUseClaude, onUseOAI }: {
  ticker: string;
  name: string;
  fields: DivergentField[];
  onUseClaude: (field: string) => void;
  onUseOAI: (field: string) => void;
}) {
  return (
    <div style={{
      background: '#0f0e08', border: '0.5px solid rgba(201,168,76,0.2)',
      borderRadius: 8, padding: '14px 16px', marginTop: 12,
    }}>
      <div style={{ fontSize: 9, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {name} ({ticker}) · resolve divergence
      </div>

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6a6058' }}>Field</span>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>Claude</span>
        <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4a7fa5' }}>OpenAI</span>
      </div>

      {fields.map(f => (
        <div key={f.field} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: '#6a6058', paddingTop: 2 }}>{FIELD_LABELS[f.field] ?? f.field}</span>

          {/* Claude column */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--gold)' }}>
              {f.claudeValue != null ? String(f.claudeValue) + (f.field.includes('pct') ? '%' : f.field === 'mgmt_tone_score' ? ' / 5' : '') : '—'}
            </div>
            {f.claudeQuote && (
              <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.53)', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '1.5px solid rgba(201,168,76,0.27)', paddingLeft: 6, marginTop: 2 }}>
                &ldquo;{f.claudeQuote.substring(0, 100)}{f.claudeQuote.length > 100 ? '…' : ''}&rdquo;
              </div>
            )}
            <button
              onClick={() => onUseClaude(f.field)}
              style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', marginTop: 4, background: '#16120a', color: 'var(--gold)', border: '0.5px solid rgba(201,168,76,0.27)' }}
            >
              use Claude →
            </button>
          </div>

          {/* OpenAI column */}
          <div>
            <div style={{ fontSize: 10, color: '#4a7fa5' }}>
              {f.oaiValue != null ? String(f.oaiValue) + (f.field.includes('pct') ? '%' : f.field === 'mgmt_tone_score' ? ' / 5' : '') : '—'}
            </div>
            {f.oaiQuote && (
              <div style={{ fontSize: 9, color: 'rgba(74,127,165,0.53)', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '1.5px solid rgba(74,127,165,0.27)', paddingLeft: 6, marginTop: 2 }}>
                &ldquo;{f.oaiQuote.substring(0, 100)}{f.oaiQuote.length > 100 ? '…' : ''}&rdquo;
              </div>
            )}
            <button
              onClick={() => onUseOAI(f.field)}
              style={{ fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', marginTop: 4, background: '#0a0f16', color: '#4a7fa5', border: '0.5px solid rgba(74,127,165,0.27)' }}
            >
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
  const [quarter, setQuarter] = useState(CURRENT_QUARTER);
  const [selectedTicker, setSelectedTicker] = useState('all');
  const [companies, setCompanies] = useState<Record<string, CompanyState>>({});
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(true);
  const divergenceRef = useRef<HTMLDivElement>(null);

  // Cache config URLs from the first successful load so quarter changes don't
  // restore the current-quarter URLs when ingesting historical data.
  const configUrlsRef = useRef<Record<string, string>>({});

  // Detect environment on mount
  useEffect(() => {
    setIsLocal(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);

  // Reload company states whenever the quarter changes.
  // For non-current quarters, defaultUrl is cleared so the config URL (which
  // always points to the latest transcript) can never silently supply wrong data.
  useEffect(() => {
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then(data => {
        // Seed the ref once; subsequent calls use the cached values.
        if (Object.keys(configUrlsRef.current).length === 0) {
          for (const row of data.config || []) {
            configUrlsRef.current[row.ticker] = row.default_url ?? '';
          }
        }

        const ingestedTickers = new Set(
          (data.signals || [])
            .filter((s: Record<string, string>) => s.quarter === quarter)
            .map((s: Record<string, string>) => s.ticker)
        );

        const isHistorical = quarter !== CURRENT_QUARTER;
        const states: Record<string, CompanyState> = {};
        for (const ticker of COMPANY_ORDER) {
          const meta = BASE_META[ticker];
          const configUrl = configUrlsRef.current[ticker] ?? '';
          // Historical quarters have no pre-filled URL — user must paste one.
          const effectiveUrl = isHistorical ? '' : configUrl;

          states[ticker] = {
            ticker,
            name: meta.name,
            type: meta.type,
            sourceLabel: isHistorical
              ? 'manual url required'
              : sourceLabel(ticker, configUrl),
            defaultUrl: effectiveUrl,
            status: ingestedTickers.has(ticker) ? 'ingested' : 'idle',
            urlOverride: '',
            showUrlInput: false,
          };
        }
        setCompanies(states);
      })
      .catch(() => {
        // Fallback: build states from static meta
        const states: Record<string, CompanyState> = {};
        for (const ticker of COMPANY_ORDER) {
          const meta = BASE_META[ticker];
          states[ticker] = {
            ticker, name: meta.name, type: meta.type,
            sourceLabel: sourceLabel(ticker, ''), defaultUrl: '',
            status: 'idle', urlOverride: '', showUrlInput: false,
          };
        }
        setCompanies(states);
      });
  }, [quarter]);

  function update(ticker: string, patch: Partial<CompanyState>) {
    setCompanies(prev => ({ ...prev, [ticker]: { ...prev[ticker], ...patch } }));
  }

  async function runOne(ticker: string, opts: { proceedOnMismatch?: boolean } = {}) {
    const c = companies[ticker];
    if (!c || c.status === 'running') return;

    update(ticker, {
      status: 'running',
      sourceLabel: c.sourceLabel.replace(/·.*$/, '· fetching…'),
    });

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          quarter,
          urlOverride: c.urlOverride || undefined,
          ...(opts.proceedOnMismatch ? { proceedOnMismatch: true } : {}),
        }),
      });
      const data = await res.json();

      if (data.status === 'ingested') {
        update(ticker, {
          status: 'ingested',
          transcriptUrl: data.transcriptUrl,
          sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'fetched ok'),
        });
      } else if (data.status === 'quarter-mismatch') {
        // Blocking: user must explicitly click Proceed or Cancel.
        update(ticker, {
          status: 'quarter-mismatch',
          transcriptQuarter: data.transcriptQuarter ?? '?',
          transcriptUrl: data.transcriptUrl,
          claudeData: data.claudeData,
          oaiData: data.oaiData,
          divergentFields: data.divergentFields,
          sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'quarter mismatch'),
        });
      } else if (data.status === 'review') {
        update(ticker, {
          status: 'review',
          transcriptUrl: data.transcriptUrl,
          divergentFields: data.divergentFields,
          claudeData: data.claudeData,
          oaiData: data.oaiData,
          sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'fetched ok'),
        });
        setResolveTarget(ticker);
      } else if (data.status === 'needs-url') {
        update(ticker, {
          status: 'needs-url',
          sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'IP blocked'),
          showUrlInput: true,
        });
      } else {
        update(ticker, {
          status: 'needs-url',
          sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'fetch failed'),
          showUrlInput: true,
        });
      }
    } catch {
      update(ticker, {
        status: 'needs-url',
        sourceLabel: sourceLabel(ticker, c.defaultUrl).replace('default', 'error'),
        showUrlInput: true,
      });
    }
  }

  function proceedWithMismatch(ticker: string) {
    runOne(ticker, { proceedOnMismatch: true });
  }

  function cancelMismatch(ticker: string) {
    const c = companies[ticker];
    if (!c) return;
    update(ticker, {
      status: 'idle',
      transcriptQuarter: undefined,
      transcriptUrl: undefined,
      claudeData: undefined,
      oaiData: undefined,
      divergentFields: undefined,
      sourceLabel: quarter !== CURRENT_QUARTER
        ? 'manual url required'
        : sourceLabel(ticker, c.defaultUrl),
    });
  }

  function runAll() {
    const toRun = COMPANY_ORDER.filter(t => companies[t]?.status !== 'ingested');
    toRun.forEach(t => runOne(t));
  }

  function runSelected() {
    if (selectedTicker === 'all') {
      runAll();
    } else {
      runOne(selectedTicker);
    }
  }

  function scrollToResolve(ticker: string) {
    setResolveTarget(ticker);
    setTimeout(() => {
      divergenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  async function resolveField(ticker: string, field: string, source: 'claude' | 'oai') {
    const c = companies[ticker];
    if (!c?.divergentFields) return;

    const sourceData = source === 'claude' ? c.claudeData : c.oaiData;
    const merged = { ...(c.claudeData || {}), [field]: sourceData?.[field] };

    const updatedFields = c.divergentFields.filter(f => f.field !== field);

    if (updatedFields.length === 0) {
      try {
        await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resolve',
            ticker,
            quarter,
            fields: merged,
            transcriptUrl: c.transcriptUrl ?? '',
          }),
        });
        update(ticker, { status: 'ingested', divergentFields: [] });
        setResolveTarget(null);
      } catch {
        update(ticker, { status: 'ingested', divergentFields: [] });
        setResolveTarget(null);
      }
    } else {
      update(ticker, {
        claudeData: merged,
        divergentFields: updatedFields,
      });
    }
  }

  const reviewCompany = resolveTarget ? companies[resolveTarget] : null;
  const anyRunning = Object.values(companies).some(c => c.status === 'running');

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>

      {/* Production banner — shown on Vercel, hidden on localhost */}
      {!isLocal && (
        <div style={{
          background: '#16120a', border: '0.5px solid rgba(201,168,76,0.4)',
          borderRadius: 8, padding: '12px 16px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12, color: 'var(--gold)' }}>⚠</span>
          <span style={{ fontSize: 11, color: '#d4c090' }}>
            Ingest is disabled on Vercel — transcript sites block data center IPs.
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Run <code style={{ background: '#1e1c18', padding: '1px 5px', borderRadius: 3, fontSize: 10, color: 'var(--gold)' }}>scripts/start-ingest.sh</code> on your local machine to ingest.
          </span>
        </div>
      )}

      {/* Run bar */}
      <div style={S.runBar}>
        <span style={S.rbLabel}>Quarter</span>
        <input
          style={S.quarterInput}
          value={quarter}
          onChange={e => setQuarter(e.target.value)}
        />
        <span style={{ ...S.rbLabel, marginLeft: 8 }}>Company</span>
        <select
          style={S.companySelect}
          value={selectedTicker}
          onChange={e => setSelectedTicker(e.target.value)}
        >
          <option value="all">All 8 companies</option>
          {COMPANY_ORDER.map(t => (
            <option key={t} value={t}>{companies[t]?.name ?? t} ({t})</option>
          ))}
        </select>
        <button style={S.btnAll} onClick={runAll} disabled={anyRunning}>Run all</button>
        <button style={S.btnSel} onClick={runSelected} disabled={anyRunning}>Run selected</button>
      </div>

      {/* Company list */}
      <div style={S.coList}>
        {COMPANY_ORDER.map(ticker => {
          const c = companies[ticker];
          if (!c) return null;
          const isBlocked = c.sourceLabel.includes('blocked') || c.sourceLabel.includes('failed') || c.sourceLabel.includes('error');

          return (
            <div key={ticker}>
              <div style={S.coRow(c.status)}>
                <span style={S.coTicker}>{ticker}</span>
                <span style={S.coName}>{c.name}</span>
                <span style={S.coSource(isBlocked)}>{c.sourceLabel}</span>
                <Badge status={c.status} />
                <Action
                  status={c.status}
                  onRun={() => runOne(ticker)}
                  onResolve={() => scrollToResolve(ticker)}
                  onFix={() => update(ticker, { showUrlInput: !c.showUrlInput })}
                  onView={() => { if (c.transcriptUrl) window.open(c.transcriptUrl, '_blank'); }}
                />
              </div>
              {c.status === 'quarter-mismatch' && c.transcriptQuarter && (
                <QuarterMismatchPanel
                  selectedQuarter={quarter}
                  transcriptQuarter={c.transcriptQuarter}
                  onProceed={() => proceedWithMismatch(ticker)}
                  onCancel={() => cancelMismatch(ticker)}
                />
              )}
              {c.status !== 'quarter-mismatch' && (c.status === 'needs-url' || c.showUrlInput) && (
                isLocal ? (
                  <UrlPanel
                    defaultUrl={c.defaultUrl}
                    urlOverride={c.urlOverride}
                    onChange={v => update(ticker, { urlOverride: v })}
                    onRetry={() => runOne(ticker)}
                    quarter={quarter}
                  />
                ) : null
              )}
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
