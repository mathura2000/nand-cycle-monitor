'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import { sortQuarters } from '@/lib/quarter';

// ── Types ──────────────────────────────────────────────────────────────────

interface SignalRow {
  run_id: string; quarter: string; ingested_at: string;
  company: string; ticker: string; type: string;
  bit_growth_pct: string; capex_pct: string; asp_change_pct: string;
  inventory_days: string; mgmt_tone_score: string; node_transition_score: string; node_transition_note: string;
  bit_growth_quote: string; capex_quote: string; asp_quote: string;
  inventory_quote: string; mgmt_tone_quote: string; transcript_url: string;
  storage_score: string; storage_quote: string;
}

interface ConfigRow {
  ticker: string; company: string; type: string;
  default_url: string; last_updated: string; notes: string;
}

interface ApiData {
  signals: SignalRow[];
  config: ConfigRow[];
  latestQuarter: string;
  tfPricingByQuarter: Record<string, number | null>;
  latestTfPrice: number | null;
}

// ── Signal definitions ─────────────────────────────────────────────────────

const SUPPLY_SIGNALS = [
  { key: 'capex',     label: 'CapEx trending',   field: 'capex_pct',             quoteField: 'capex_quote',          valFmt: (v: number) => `+${v.toFixed(0)}% YoY` },
  { key: 'node',      label: 'Node transitions', field: 'node_transition_score',  quoteField: 'node_transition_note', valFmt: (v: number) => `${v.toFixed(1)} / 5` },
  { key: 'inventory', label: 'Inventory days',   field: 'inventory_days',         quoteField: 'inventory_quote',      valFmt: (v: number) => `${v.toFixed(0)} days` },
] as const;

const DEMAND_SIGNALS = [
  { key: 'spend',   label: 'Hyperscaler spend', field: 'capex_pct',       quoteField: 'capex_quote',       valFmt: (v: number) => `+${v.toFixed(0)}% YoY` },
  { key: 'storage', label: 'Storage hunger',    field: 'storage_score',   quoteField: 'storage_quote',     valFmt: (v: number) => `${v.toFixed(1)} / 5` },
  { key: 'ai',      label: 'AI demand',         field: 'mgmt_tone_score', quoteField: 'mgmt_tone_quote',   valFmt: (v: number) => `${v.toFixed(1)} / 5` },
] as const;

const NODE_SCORE_LABELS: Record<number, string> = {
  1: 'Cutting capacity',
  2: 'Restraining supply',
  3: 'Maintaining',
  4: 'Expanding aggressively',
  5: 'Maximum ramp',
};

const STORAGE_SCORE_LABELS: Record<number, string> = {
  1: 'No storage signal',
  2: 'Generic infra only',
  3: 'Storage mentioned',
  4: 'Explicit purchasing',
  5: 'Supply constraint',
};

const URGENCY_SCORE_LABELS: Record<number, string> = {
  1: 'No urgency',
  2: 'Comfortable supply',
  3: 'Demand accelerating',
  4: 'Capacity pressured',
  5: 'Hard constraint',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function num(s: string): number { return parseFloat(s) || 0; }

function badge(val: number, field: string, isSupply: boolean): { text: string; isAlert: boolean } {
  if (field === 'capex_pct') {
    if (isSupply) {
      if (val > 30) return { text: '↑↑ outlier', isAlert: true };
      if (val > 15) return { text: '↑ watch', isAlert: true };
      return { text: '→ stable', isAlert: false };
    } else {
      if (val > 40) return { text: '↑↑ strongest', isAlert: false };
      if (val > 20) return { text: '↑ healthy', isAlert: false };
      if (val > 10) return { text: '→ stable', isAlert: false };
      return { text: '→ watch', isAlert: true };
    }
  }
  if (field === 'inventory_days') {
    if (val > 90) return { text: '↑↑ elevated', isAlert: true };
    if (val > 70) return { text: '↑ watch', isAlert: true };
    return { text: '→ stable', isAlert: false };
  }
  if (field === 'storage_score') {
    if (val >= 4.5) return { text: '↑↑ constraint', isAlert: false };
    if (val >= 3.5) return { text: '↑ active', isAlert: false };
    if (val >= 2.5) return { text: '→ moderate', isAlert: false };
    return { text: '→ low', isAlert: false };
  }
  if (field === 'mgmt_tone_score') {
    if (isSupply) {
      if (val >= 4.5) return { text: '↑↑ aggressive', isAlert: true };
      if (val >= 3.5) return { text: '↑ constructive', isAlert: true };
      return { text: '→ neutral', isAlert: false };
    } else {
      if (val >= 4.5) return { text: '↑↑ hard constraint', isAlert: false };
      if (val >= 3.5) return { text: '↑ capacity pressured', isAlert: false };
      if (val >= 2.5) return { text: '→ accelerating', isAlert: false };
      return { text: '→ stable', isAlert: false };
    }
  }
  if (field === 'asp_change_pct') {
    if (val > 3) return { text: '↑ rising', isAlert: false };
    if (val >= 0) return { text: '→ holding', isAlert: false };
    return { text: '↓ softening', isAlert: true };
  }
  if (field === 'node_transition_score') {
    if (val >= 4.5) return { text: '↑↑ aggressive', isAlert: true };
    if (val >= 4)   return { text: '↑ active ramp', isAlert: true };
    if (val >= 3)   return { text: '→ moderate', isAlert: false };
    if (val >= 2)   return { text: '↓ managed', isAlert: false };
    return          { text: '↓↓ cutting', isAlert: false };
  }
  return { text: '→', isAlert: false };
}

const VENDOR_ORDER = ['SSNLF', 'SNDK', 'MU', 'HXSCL'];
const VENDOR_COLORS = ['#c9a84c', '#b8965a', '#8a7040', '#5a5040'];
const VENDOR_WIDTHS = [2, 1.5, 1.5, 1.5];
const VENDOR_OPACITIES = [1, 0.7, 0.6, 0.5];

const HYPERSCALER_ORDER = ['AMZN', 'GOOG', 'META', 'MSFT'];
const DEMAND_BLUE_COLORS = ['#4a7fa5', '#3a6a8a', '#2a5070'];
const DEMAND_GOLD = '#c9a84c';

// ── Per-company chart data builder ────────────────────────────────────────

function buildCompanyChart(
  signals: SignalRow[],
  quarters: string[],
  field: keyof SignalRow,
  companies: string[],
): Array<Record<string, string | number>> {
  return quarters.map(q => {
    const qRows = signals.filter(r => r.quarter === q);
    const point: Record<string, string | number> = { quarter: q };
    for (const ticker of companies) {
      const row = qRows.find(r => r.ticker === ticker);
      if (row && row[field]) point[ticker] = num(row[field] as string);
    }
    return point;
  });
}

// ── Evidence row ───────────────────────────────────────────────────────────

function EvidenceRow({
  row, field, quoteField, valFmt, isSupply, transcriptUrl,
}: {
  row: SignalRow;
  field: string;
  quoteField: string;
  valFmt: (v: number) => string;
  isSupply: boolean;
  transcriptUrl: string;
}) {
  const isNodeSignal = field === 'node_transition_score';
  const rawVal = row[field as keyof SignalRow];
  const hasValue = rawVal != null && rawVal !== '';
  const val = hasValue ? num(rawVal as string) : 0;

  let badgeText: string;
  let isAlert: boolean;

  if (!hasValue) {
    badgeText = '—'; isAlert = false;
  } else if (isNodeSignal) {
    const labelKey = Math.round(val);
    badgeText = NODE_SCORE_LABELS[labelKey] ?? `Score ${val.toFixed(1)}`;
    isAlert = val >= 4;
  } else {
    ({ text: badgeText, isAlert } = badge(val, field, isSupply));
  }

  const quote = row[quoteField as keyof SignalRow] as string;
  const isModeratingDemand = !isSupply && isAlert;
  const valColor = isSupply
    ? (isAlert ? '#c9a84c' : '#3a3528')
    : (isAlert ? '#c9a84c' : '#4a7fa5');

  return (
    <div style={{ padding: '11px 0', borderBottom: '0.5px solid #1a1812' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isNodeSignal ? 8 : 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#d4c090', letterSpacing: '0.05em' }}>
            {row.ticker}
          </span>
          <span style={{ fontSize: 10, color: '#7a6e58' }}>{row.company}</span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3,
            background: isModeratingDemand ? '#16120a' : (isAlert ? '#16120a' : '#111009'),
            color: isModeratingDemand ? '#c9a84c' : (isAlert ? (isSupply ? '#c9a84c' : '#4a7fa5') : '#7a6e58'),
            border: `0.5px solid ${isModeratingDemand ? '#c9a84c33' : (isAlert ? (isSupply ? '#c9a84c33' : '#4a7fa533') : '#1e1c18')}`,
          }}>
            {badgeText}
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: valColor }}>
          {hasValue ? valFmt(val) : '—'}
        </span>
      </div>
      {quote && (
        <p style={{
          fontSize: 10, color: '#7a6e58', lineHeight: 1.6,
          fontStyle: isNodeSignal ? 'normal' : 'italic',
          borderLeft: `1.5px solid ${isAlert ? (isSupply ? '#c9a84c33' : '#4a7fa533') : '#1e1c18'}`,
          paddingLeft: 8, margin: '0 0 5px',
        }}>
          {isNodeSignal ? quote : `"${quote}"`}
        </p>
      )}
      {transcriptUrl && !isNodeSignal && (
        <a
          href={transcriptUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 9, color: '#6a6050', letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none' }}
        >
          View transcript →
        </a>
      )}
    </div>
  );
}

// ── Inventory evidence panel ───────────────────────────────────────────────

function InventoryPanel({ signals }: { signals: SignalRow[] }) {
  const INV_TICKERS = ['MU', 'SNDK'];
  const quarters = sortQuarters([...new Set(signals.map(r => r.quarter))]);

  const rows = quarters.map((q, qi) => {
    const qRows = signals.filter(r => r.quarter === q && r.type === 'vendor');
    const vals: Record<string, number | null> = {};
    for (const t of INV_TICKERS) {
      const row = qRows.find(r => r.ticker === t);
      const raw = row?.inventory_days;
      vals[t] = raw != null && raw !== '' ? parseFloat(raw) : null;
    }

    // Direction based on MU vs prior quarter
    let dirText = '—';
    let dirColor = '#3a3528';
    let dirBg = '#111009';
    let dirBorder = '#1e1c18';
    const muVal = vals['MU'];
    if (muVal !== null) {
      const prevQ = quarters[qi - 1];
      if (prevQ) {
        const prevMuRow = signals.find(r => r.quarter === prevQ && r.ticker === 'MU');
        const prevRaw = prevMuRow?.inventory_days;
        const prevVal = prevRaw != null && prevRaw !== '' ? parseFloat(prevRaw) : null;
        if (prevVal !== null) {
          if (muVal > prevVal + 1) {
            dirText = '↑ Building'; dirColor = '#c9a84c'; dirBg = '#16120a'; dirBorder = '#c9a84c33';
          } else if (muVal < prevVal - 1) {
            dirText = '↓ Drawing down'; dirColor = '#5dcaa5'; dirBg = '#0a1610'; dirBorder = '#5dcaa533';
          } else {
            dirText = '→ Stable'; dirColor = '#6a6050'; dirBg = '#111009'; dirBorder = '#1e1c18';
          }
        }
      }
    } else {
      dirText = 'No data'; dirColor = '#3a3528';
    }

    return { q, vals, dirText, dirColor, dirBg, dirBorder };
  });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 90px 1fr', gap: 0, marginBottom: 4 }}>
        {['Quarter', 'MU (days)', 'SNDK (days)', 'Direction'].map(h => (
          <span key={h} style={{ fontSize: 9, color: '#4a4030', letterSpacing: '0.07em', textTransform: 'uppercase', paddingBottom: 6 }}>
            {h}
          </span>
        ))}
      </div>
      {rows.map(({ q, vals, dirText, dirColor, dirBg, dirBorder }) => (
        <div key={q} style={{ display: 'grid', gridTemplateColumns: '60px 80px 90px 1fr', alignItems: 'center', padding: '8px 0', borderTop: '0.5px solid #1a1812' }}>
          <span style={{ fontSize: 11, color: '#a09080' }}>{q}</span>
          <span style={{ fontSize: 11, color: vals['MU'] !== null ? '#d4c090' : '#3a3528' }}>
            {vals['MU'] !== null ? `${vals['MU']!.toFixed(0)}` : '—'}
          </span>
          <span style={{ fontSize: 11, color: vals['SNDK'] !== null ? '#d4c090' : '#3a3528' }}>
            {vals['SNDK'] !== null ? `${vals['SNDK']!.toFixed(0)}` : '—'}
          </span>
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 3, width: 'fit-content',
            background: dirBg, color: dirColor, border: `0.5px solid ${dirBorder}`,
          }}>
            {dirText}
          </span>
        </div>
      ))}
      <p style={{ fontSize: 9, color: '#4a4030', lineHeight: 1.6, marginTop: 14 }}>
        Inventory days sourced from MU and SNDK earnings reports. Used as industry proxy — MU is the most transparent reporter. HXSCL and SSNLF do not report inventory days.
      </p>
    </div>
  );
}

// ── TF Pricing evidence panel ──────────────────────────────────────────────

function TfPricingPanel({ tfPricingByQuarter }: { tfPricingByQuarter: Record<string, number | null> }) {
  const quarters = sortQuarters(Object.keys(tfPricingByQuarter)).filter(q => tfPricingByQuarter[q] != null);
  return (
    <div>
      {quarters.map(q => {
        const val = tfPricingByQuarter[q]!;
        const isPositive = val > 0;
        const badgeText = val > 30 ? '↑↑ surging' : isPositive ? '↑ rising' : '↓ falling';
        const accentColor = isPositive ? '#5dcaa5' : '#d4537e';
        return (
          <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid #1a1812' }}>
            <span style={{ fontSize: 11, color: '#a09080', width: 60, flexShrink: 0 }}>{q}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: accentColor, width: 60 }}>
              {val > 0 ? '+' : ''}{val.toFixed(1)}%
            </span>
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 3,
              background: isPositive ? '#0a1610' : '#160a0e',
              color: accentColor,
              border: `0.5px solid ${accentColor}33`,
            }}>
              {badgeText}
            </span>
          </div>
        );
      })}
      <p style={{ fontSize: 9, color: '#4a4030', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 14 }}>
        Source: TrendForce press releases
      </p>
    </div>
  );
}

// ── Shared score grid helpers ─────────────────────────────────────────────

function storageScoreStyle(score: number): { bg: string; color: string; border: string } {
  if (score >= 4.5) return { bg: '#16120a', color: '#c9a84c', border: '#c9a84c33' };
  if (score >= 3.5) return { bg: '#150e04', color: '#c87a30', border: '#c87a3033' };
  if (score >= 2.5) return { bg: '#111009', color: '#7a6e58', border: '#1e1c18' };
  return { bg: '#0e0d0a', color: '#4a4030', border: '#1a1812' };
}

function urgencyScoreStyle(score: number): { bg: string; color: string; border: string } {
  if (score >= 4.5) return { bg: '#16120a', color: '#c9a84c', border: '#c9a84c33' };
  if (score >= 3.5) return { bg: '#0a1610', color: '#5dcaa5', border: '#5dcaa533' };
  if (score >= 2.5) return { bg: '#111009', color: '#7a6e58', border: '#1e1c18' };
  return { bg: '#0e0d0a', color: '#4a4030', border: '#1a1812' };
}

// ── Storage hunger evidence panel ─────────────────────────────────────────

function StoragePanel({ signals, viewingQuarter, selectedCompany }: {
  signals: SignalRow[]; viewingQuarter: string | null; selectedCompany: string;
}) {
  const TICKERS = HYPERSCALER_ORDER;
  const activeTickers = selectedCompany === 'all' ? TICKERS : [selectedCompany];
  const quarters = sortQuarters([...new Set(signals.map(r => r.quarter))]);

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedCompany === 'all' ? '60px repeat(4, 1fr)' : '60px 1fr',
        gap: 0, marginBottom: 4,
      }}>
        {['Quarter', ...activeTickers].map(h => (
          <span key={h} style={{ fontSize: 9, color: '#4a4030', letterSpacing: '0.07em', textTransform: 'uppercase', paddingBottom: 6 }}>
            {h}
          </span>
        ))}
      </div>

      {quarters.map(q => {
        const qRows = signals.filter(r => r.quarter === q && r.type === 'hyperscaler');
        const isViewing = q === (viewingQuarter ?? quarters[quarters.length - 1]);
        return (
          <div key={q} style={{
            borderTop: '0.5px solid #1a1812',
            borderLeft: isViewing ? '1.5px solid #c9a84c33' : '1.5px solid transparent',
            paddingLeft: isViewing ? 6 : 0,
            paddingTop: 8, paddingBottom: 8,
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: selectedCompany === 'all' ? '60px repeat(4, 1fr)' : '60px 1fr',
              alignItems: 'start', gap: 0,
            }}>
              <span style={{ fontSize: 11, color: '#a09080', paddingTop: 2 }}>{q}</span>
              {activeTickers.map(ticker => {
                const row = qRows.find(r => r.ticker === ticker);
                const rawScore = row?.storage_score;
                const score = rawScore != null && rawScore !== '' ? parseFloat(rawScore) : null;
                const label = score != null ? (STORAGE_SCORE_LABELS[Math.round(score)] ?? `${score.toFixed(0)}/5`) : '—';
                const style = score != null ? storageScoreStyle(score) : { bg: '#0e0d0a', color: '#4a4030', border: '#1a1812' };
                const quote = row?.storage_quote;
                return (
                  <div key={ticker} style={{ paddingRight: 6 }}>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3, display: 'inline-block',
                      background: style.bg, color: style.color, border: `0.5px solid ${style.border}`,
                    }}>
                      {label}
                    </span>
                    {selectedCompany !== 'all' && quote && score != null && score > 1 && (
                      <p style={{ fontSize: 10, color: '#7a6e58', lineHeight: 1.6, fontStyle: 'italic', marginTop: 5, marginBottom: 0, borderLeft: '1.5px solid #c9a84c33', paddingLeft: 8 }}>
                        &ldquo;{quote}&rdquo;
                      </p>
                    )}
                    {selectedCompany !== 'all' && (!quote || score === 1) && (
                      <p style={{ fontSize: 10, color: '#3a3528', marginTop: 5, marginBottom: 0 }}>No storage signal</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 9, color: '#4a4030', lineHeight: 1.6, marginTop: 14 }}>
        Storage hunger scored from explicit flash/NVMe/memory purchasing language in earnings transcripts. Score 1 = no mention, 5 = supply constraint. Only AMZN has shown explicit memory constraint language to date.
      </p>
    </div>
  );
}

// ── AI urgency evidence panel ─────────────────────────────────────────────

function AiUrgencyPanel({ signals, viewingQuarter, selectedCompany }: {
  signals: SignalRow[]; viewingQuarter: string | null; selectedCompany: string;
}) {
  const TICKERS = HYPERSCALER_ORDER;
  const activeTickers = selectedCompany === 'all' ? TICKERS : [selectedCompany];
  const quarters = sortQuarters([...new Set(signals.map(r => r.quarter))]);

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedCompany === 'all' ? '60px repeat(4, 1fr)' : '60px 1fr',
        gap: 0, marginBottom: 4,
      }}>
        {['Quarter', ...activeTickers].map(h => (
          <span key={h} style={{ fontSize: 9, color: '#4a4030', letterSpacing: '0.07em', textTransform: 'uppercase', paddingBottom: 6 }}>
            {h}
          </span>
        ))}
      </div>

      {quarters.map(q => {
        const qRows = signals.filter(r => r.quarter === q && r.type === 'hyperscaler');
        const isViewing = q === (viewingQuarter ?? quarters[quarters.length - 1]);
        return (
          <div key={q} style={{
            borderTop: '0.5px solid #1a1812',
            borderLeft: isViewing ? '1.5px solid #5dcaa533' : '1.5px solid transparent',
            paddingLeft: isViewing ? 6 : 0,
            paddingTop: 8, paddingBottom: 8,
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: selectedCompany === 'all' ? '60px repeat(4, 1fr)' : '60px 1fr',
              alignItems: 'start', gap: 0,
            }}>
              <span style={{ fontSize: 11, color: '#a09080', paddingTop: 2 }}>{q}</span>
              {activeTickers.map(ticker => {
                const row = qRows.find(r => r.ticker === ticker);
                const rawScore = row?.mgmt_tone_score;
                const score = rawScore != null && rawScore !== '' ? parseFloat(rawScore) : null;
                const label = score != null ? (URGENCY_SCORE_LABELS[Math.round(score)] ?? `${score.toFixed(0)}/5`) : '—';
                const style = score != null ? urgencyScoreStyle(score) : { bg: '#0e0d0a', color: '#4a4030', border: '#1a1812' };
                const quote = row?.mgmt_tone_quote;
                return (
                  <div key={ticker} style={{ paddingRight: 6 }}>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 3, display: 'inline-block',
                      background: style.bg, color: style.color, border: `0.5px solid ${style.border}`,
                    }}>
                      {label}
                    </span>
                    {selectedCompany !== 'all' && quote && (
                      <p style={{ fontSize: 10, color: '#7a6e58', lineHeight: 1.6, fontStyle: 'italic', marginTop: 5, marginBottom: 0, borderLeft: '1.5px solid #5dcaa533', paddingLeft: 8 }}>
                        &ldquo;{quote}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 9, color: '#4a4030', lineHeight: 1.6, marginTop: 14 }}>
        AI urgency scored on concrete capacity constraint language only — not general optimism. Score 1 = no urgency, 5 = explicit demand exceeding supply.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; quarter?: string }>;
}) {
  const params = use(searchParams);
  const activeTab = (params.tab === 'demand' ? 'demand' : 'supply') as 'supply' | 'demand';
  const paramQuarter = params.quarter
    ? decodeURIComponent(params.quarter.replace(/\+/g, ' '))
    : null;
  const router = useRouter();

  const [data, setData] = useState<ApiData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeSignal, setActiveSignal] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [viewingQuarter, setViewingQuarter] = useState<string | null>(paramQuarter);

  useEffect(() => {
    setMounted(true);
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then((d: ApiData) => {
        setData(d);
        const sig = activeTab === 'supply' ? SUPPLY_SIGNALS[0].key : DEMAND_SIGNALS[0].key;
        setActiveSignal(sig);
      })
      .catch(() => setData({ signals: [], config: [], latestQuarter: '', tfPricingByQuarter: {}, latestTfPrice: null }));
  }, []);

  useEffect(() => {
    const sig = activeTab === 'supply' ? SUPPLY_SIGNALS[0].key : DEMAND_SIGNALS[0].key;
    setActiveSignal(sig);
    setSelectedCompany('all');
  }, [activeTab]);

  useEffect(() => {
    setViewingQuarter(paramQuarter);
  }, [paramQuarter]);

  const switchTab = (tab: 'supply' | 'demand') => {
    const q = viewingQuarter ? `&quarter=${viewingQuarter.replace(/ /g, '+')}` : '';
    router.push(`/signals?tab=${tab}${q}`);
  };

  const dismissQuarter = () => {
    setViewingQuarter(null);
    router.push(`/signals?tab=${activeTab}`);
  };

  if (!data) {
    return (
      <div style={{ color: '#3a3528', fontSize: 12, paddingTop: 40, textAlign: 'center' }}>Loading…</div>
    );
  }

  const { signals, config } = data;

  const urlByTicker: Record<string, string> = {};
  for (const row of config) {
    if (row.ticker && row.default_url) urlByTicker[row.ticker] = row.default_url;
  }
  for (const row of signals) {
    if (row.ticker && row.transcript_url) urlByTicker[row.ticker] = row.transcript_url;
  }

  const quarters = sortQuarters([...new Set(signals.map(r => r.quarter))]);
  const latestQ = quarters.at(-1) ?? '';
  const activeQ = viewingQuarter ?? latestQ;
  const activeRows = signals.filter(r => r.quarter === activeQ);

  const isSupply = activeTab === 'supply';
  const typeFilter = isSupply ? 'vendor' : 'hyperscaler';
  const typeTickers = [...new Set(signals.filter(r => r.type === typeFilter).map(r => r.ticker))];

  let orderedTickers: string[];
  if (isSupply) {
    orderedTickers = VENDOR_ORDER.filter(t => typeTickers.includes(t));
    typeTickers.forEach(t => { if (!orderedTickers.includes(t)) orderedTickers.push(t); });
  } else {
    orderedTickers = HYPERSCALER_ORDER.filter(t => typeTickers.includes(t));
    typeTickers.forEach(t => { if (!orderedTickers.includes(t)) orderedTickers.push(t); });
  }

  const chartField: keyof SignalRow = isSupply ? 'bit_growth_pct' : 'capex_pct';
  const companyChartData = buildCompanyChart(signals, quarters, chartField, orderedTickers);

  const signalDefs = isSupply ? SUPPLY_SIGNALS : DEMAND_SIGNALS;
  const isTfSignal = activeSignal === 'tf';
  const isInventorySignal = activeSignal === 'inventory';
  const isStorageSignal = activeSignal === 'storage';
  const isAiSignal = activeSignal === 'ai';
  const activeSigDef = (isTfSignal || isStorageSignal || isAiSignal) ? null : (signalDefs.find(s => s.key === activeSignal) ?? signalDefs[0]);

  let evidenceRows = activeRows
    .filter(r => r.type === typeFilter)
    .filter(r => selectedCompany === 'all' || r.ticker === selectedCompany);

  if (activeSigDef && !isStorageSignal && !isAiSignal) {
    const field = activeSigDef.field as keyof SignalRow;
    evidenceRows = evidenceRows.sort((a, b) => num(b[field] as string) - num(a[field] as string));
  }

  // For node signal: sort by score desc
  if (activeSigDef?.key === 'node') {
    evidenceRows = [...evidenceRows].sort((a, b) =>
      num(b.node_transition_score) - num(a.node_transition_score)
    );
  }

  function sigDir(key: string): string {
    const allSigs = [...SUPPLY_SIGNALS, ...DEMAND_SIGNALS];
    const def = allSigs.find(s => s.key === key);
    if (!def) return '';
    const rows = activeRows.filter(r => r.type === typeFilter);
    if (rows.length === 0) return '—';
    const field = def.field as keyof SignalRow;
    const validRows = rows.filter(r => r[field] != null && r[field] !== '');
    if (validRows.length === 0) return '—';
    const avg = validRows.reduce((s, r) => s + num(r[field] as string), 0) / validRows.length;
    const { text } = badge(avg, field, isSupply);
    return text;
  }

  function sigDirColor(key: string): string {
    const dir = sigDir(key);
    if (dir.startsWith('↑')) return isSupply ? '#c9a84c' : '#4a7fa5';
    if (dir.startsWith('→ watch') || dir.startsWith('→ cooling')) return '#c9a84c';
    return '#3a3528';
  }

  function lineColor(ticker: string, idx: number): string {
    if (isSupply) return VENDOR_COLORS[idx] ?? '#5a5040';
    if (idx === orderedTickers.length - 1 && orderedTickers.length >= 2) return DEMAND_GOLD;
    return DEMAND_BLUE_COLORS[idx] ?? '#2a5070';
  }
  function lineWidth(idx: number): number {
    if (isSupply) return VENDOR_WIDTHS[idx] ?? 1.5;
    return idx === 0 ? 2 : 1.5;
  }
  function lineOpacity(ticker: string, idx: number): number {
    if (selectedCompany !== 'all') return ticker === selectedCompany ? 1 : 0.2;
    if (isSupply) return VENDOR_OPACITIES[idx] ?? 0.5;
    return idx === 0 ? 1 : idx === 1 ? 0.85 : 0.7;
  }

  const tabBase: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '5px 14px', borderRadius: 4, border: '0.5px solid #2a2820',
    background: 'transparent', color: '#6a6050', cursor: 'pointer',
  };
  const tabActive = (tab: 'supply' | 'demand'): React.CSSProperties => ({
    ...tabBase,
    border: `0.5px solid ${tab === 'supply' ? '#c9a84c44' : '#4a7fa544'}`,
    color: tab === 'supply' ? '#c9a84c' : '#4a7fa5',
    background: tab === 'supply' ? '#16120a' : '#0a0f16',
  });

  const chartLabel = isSupply ? 'Per-vendor bit growth % YoY' : 'Per-hyperscaler CapEx % YoY';
  const chartTitle = isSupply ? 'Vendor supply growth — individual lines' : 'Hyperscaler demand — individual lines';
  const allLabel = isSupply ? 'All vendors' : 'All companies';
  const evidencePanelTitle = isTfSignal
    ? 'NAND Contract Price — all quarters'
    : isStorageSignal
    ? 'Storage hunger — all quarters'
    : isAiSignal
    ? 'AI demand urgency — all quarters'
    : `${activeSigDef?.label ?? ''} — strongest first`;

  return (
    <div>
      <a
        href="/"
        style={{
          fontSize: 10, color: '#6a6050', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 14, display: 'block',
          textDecoration: 'none',
        }}
      >
        ← Overview
      </a>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button style={activeTab === 'supply' ? tabActive('supply') : tabBase} onClick={() => switchTab('supply')}>
          Supply pressure signals
        </button>
        <button style={activeTab === 'demand' ? tabActive('demand') : tabBase} onClick={() => switchTab('demand')}>
          Demand health signals
        </button>
      </div>

      {viewingQuarter && viewingQuarter !== latestQ && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, color: '#7a6e58', marginBottom: 10,
          background: '#111009', border: '0.5px solid #2a2518',
          borderRadius: 5, padding: '5px 10px', width: 'fit-content',
        }}>
          <span>Viewing {viewingQuarter} · not latest</span>
          <button
            onClick={dismissQuarter}
            style={{ fontSize: 12, color: '#5a5040', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Chart card */}
      <div style={{
        background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10,
        padding: '18px 20px 12px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 9, color: '#8a7e68', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          {chartLabel} · {quarters.length > 0 ? `${quarters.length} quarter${quarters.length !== 1 ? 's' : ''}` : 'no data'}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#d4c090', marginBottom: 12 }}>
          {chartTitle}
        </div>

        {signals.length === 0 ? (
          <div style={{ height: 148, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3528', fontSize: 11 }}>
            No data ingested yet
          </div>
        ) : mounted ? (
          <ResponsiveContainer width="100%" height={148}>
            <LineChart data={companyChartData} margin={{ top: 8, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a1812" strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="quarter"
                tick={{ fill: '#6a6050', fontSize: 8, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6a6050', fontSize: 8, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={32}
              />
              <Tooltip
                contentStyle={{ background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 6, fontSize: 10 }}
                labelStyle={{ color: '#7a6e54' }}
                formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)}%`, String(name)]}
              />
              {orderedTickers.map((ticker, idx) => (
                <Line
                  key={ticker}
                  dataKey={ticker}
                  stroke={lineColor(ticker, idx)}
                  strokeWidth={lineWidth(idx)}
                  strokeOpacity={lineOpacity(ticker, idx)}
                  dot={false}
                  activeDot={{ r: 3, fill: lineColor(ticker, idx) }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 148 }} />
        )}
      </div>

      {/* Bottom split */}
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 10 }}>

        {/* Signal list */}
        <div style={{ background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 9, color: '#8a7e68', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Signals — click to view evidence
          </div>
          {signalDefs.map(sig => {
            const isActive = activeSignal === sig.key;
            const accentColor = isSupply ? '#c9a84c' : '#4a7fa5';
            return (
              <div
                key={sig.key}
                onClick={() => setActiveSignal(sig.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 5, marginBottom: 4, cursor: 'pointer',
                  background: isActive ? (isSupply ? '#16120a' : '#0a0f16') : 'transparent',
                  border: isActive ? `0.5px solid ${accentColor}33` : '0.5px solid transparent',
                }}
              >
                <span style={{ fontSize: 11, color: isActive ? accentColor : '#9a8e78' }}>{sig.label}</span>
                <span style={{ fontSize: 10, color: sigDirColor(sig.key) }}>{sigDir(sig.key)}</span>
              </div>
            );
          })}
          {isSupply && (() => {
            const tfVal = data.tfPricingByQuarter?.[activeQ] ?? null;
            const isActive = activeSignal === 'tf';
            const tfColor = tfVal !== null ? (tfVal > 0 ? '#5dcaa5' : '#d4537e') : '#6a6050';
            return (
              <div
                onClick={() => setActiveSignal('tf')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 5, marginTop: 4, cursor: 'pointer',
                  background: isActive ? '#0a1610' : 'transparent',
                  borderTop: '0.5px solid #1a1812',
                  borderRight: isActive ? '0.5px solid #5dcaa533' : '0.5px solid transparent',
                  borderBottom: isActive ? '0.5px solid #5dcaa533' : '0.5px solid transparent',
                  borderLeft: isActive ? '0.5px solid #5dcaa533' : '0.5px solid transparent',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: isActive ? '#5dcaa5' : '#9a8e78' }}>NAND Contract Price</span>
                  <span style={{ display: 'block', fontSize: 9, color: '#555', letterSpacing: '0.04em' }}>TrendForce</span>
                </div>
                {tfVal !== null && (
                  <span style={{ fontSize: 10, color: tfColor }}>{tfVal > 0 ? '+' : ''}{tfVal.toFixed(1)}%</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Evidence panel */}
        <div style={{ background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: '#8a7e68', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {evidencePanelTitle}
            </div>
            <select
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value)}
              style={{
                fontSize: 10, color: '#7a6e58', background: '#111009',
                border: '0.5px solid #2a2820', borderRadius: 4,
                padding: '3px 8px', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="all">{allLabel}</option>
              {orderedTickers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {isTfSignal ? (
            <TfPricingPanel tfPricingByQuarter={data.tfPricingByQuarter} />
          ) : isInventorySignal ? (
            <InventoryPanel signals={signals} />
          ) : isStorageSignal ? (
            <StoragePanel signals={signals} viewingQuarter={viewingQuarter} selectedCompany={selectedCompany} />
          ) : isAiSignal ? (
            <AiUrgencyPanel signals={signals} viewingQuarter={viewingQuarter} selectedCompany={selectedCompany} />
          ) : evidenceRows.length === 0 ? (
            <div style={{ color: '#3a3528', fontSize: 11, paddingTop: 20, textAlign: 'center' }}>
              No data ingested yet —{' '}
              <a href="/ingest" style={{ color: '#7a6e54', textDecoration: 'underline' }}>go to Ingest</a>
            </div>
          ) : (
            evidenceRows.map(row => (
              <EvidenceRow
                key={row.ticker}
                row={row}
                field={activeSigDef!.field}
                quoteField={activeSigDef!.quoteField}
                valFmt={activeSigDef!.valFmt}
                isSupply={isSupply}
                transcriptUrl={urlByTicker[row.ticker] ?? ''}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
