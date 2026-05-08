'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────

interface SignalRow {
  run_id: string; quarter: string; ingested_at: string;
  company: string; ticker: string; type: string;
  bit_growth_pct: string; capex_pct: string; asp_change_pct: string;
  inventory_days: string; mgmt_tone_score: string; node_transition_score: string; node_transition_note: string;
  bit_growth_quote: string; capex_quote: string; asp_quote: string;
  inventory_quote: string; mgmt_tone_quote: string; transcript_url: string;
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
  { key: 'capex',     label: 'CapEx trending',    field: 'capex_pct',         quoteField: 'capex_quote',         valFmt: (v: number) => `+${v.toFixed(0)}% YoY` },
  { key: 'node',      label: 'Node transitions',  field: 'node_transition_score', quoteField: 'node_transition_note', valFmt: (v: number) => `${v.toFixed(1)} / 5` },
  { key: 'inventory', label: 'Inventory days',    field: 'inventory_days',    quoteField: 'inventory_quote',     valFmt: (v: number) => `${v.toFixed(0)} days` },
  { key: 'tone',      label: 'Mgmt tone',         field: 'mgmt_tone_score',   quoteField: 'mgmt_tone_quote',     valFmt: (v: number) => `${v.toFixed(1)} / 5` },
  { key: 'asp',       label: 'ASP trajectory',    field: 'asp_change_pct',    quoteField: 'asp_quote',           valFmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% QoQ` },
] as const;

const DEMAND_SIGNALS = [
  { key: 'spend',   label: 'Hyperscaler spend', field: 'capex_pct',       quoteField: 'capex_quote',     valFmt: (v: number) => `+${v.toFixed(0)}% YoY` },
  { key: 'storage', label: 'Storage hunger',    field: 'mgmt_tone_score', quoteField: 'mgmt_tone_quote', valFmt: (v: number) => `${v.toFixed(1)} / 5` },
  { key: 'ai',      label: 'AI demand',         field: 'mgmt_tone_score', quoteField: 'mgmt_tone_quote', valFmt: (v: number) => `${v.toFixed(1)} / 5` },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

const QUARTER_ORDER = ['Q2 2024','Q3 2024','Q4 2024','Q1 2025','Q2 2025','Q3 2025','Q4 2025','Q1 2026'];
function quarterIndex(q: string): number {
  const idx = QUARTER_ORDER.indexOf(q);
  return idx >= 0 ? idx : 999;
}

function num(s: string): number { return parseFloat(s) || 0; }

// Determine badge for a value and whether it's a "supply" context
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
      return { text: '→ watch', isAlert: true }; // moderating demand
    }
  }
  if (field === 'inventory_days') {
    if (val > 90) return { text: '↑↑ elevated', isAlert: true };
    if (val > 70) return { text: '↑ watch', isAlert: true };
    return { text: '→ stable', isAlert: false };
  }
  if (field === 'mgmt_tone_score') {
    if (isSupply) {
      if (val >= 4.5) return { text: '↑↑ aggressive', isAlert: true };
      if (val >= 3.5) return { text: '↑ constructive', isAlert: true };
      return { text: '→ neutral', isAlert: false };
    } else {
      if (val >= 4) return { text: '↑ healthy', isAlert: false };
      if (val >= 3) return { text: '→ stable', isAlert: false };
      return { text: '→ cooling', isAlert: true };
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

// Supply vendor colors (gold family, Samsung brightest)
const VENDOR_ORDER = ['SSNLF', 'SNDK', 'MU', 'HXSCL'];
const VENDOR_COLORS = ['#c9a84c', '#b8965a', '#8a7040', '#5a5040'];
const VENDOR_WIDTHS = [2, 1.5, 1.5, 1.5];
const VENDOR_OPACITIES = [1, 0.7, 0.6, 0.5];

// Demand hyperscaler colors assigned by rank (blue family, strongest brightest)
const DEMAND_BLUE_COLORS = ['#4a7fa5', '#3a6a8a', '#2a5070'];
const DEMAND_GOLD = '#c9a84c'; // for moderating/lowest spender

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
  const rawVal = row[field as keyof SignalRow];
  const hasValue = rawVal != null && rawVal !== '';
  const val = hasValue ? num(rawVal as string) : 0;
  const { text: badgeText, isAlert } = hasValue ? badge(val, field, isSupply) : { text: '—', isAlert: false };
  const quote = row[quoteField as keyof SignalRow] as string;

  // For demand tab, flag moderating spenders gold
  const isModeratingDemand = !isSupply && isAlert;
  const valColor = isSupply
    ? (isAlert ? '#c9a84c' : '#3a3528')
    : (isAlert ? '#c9a84c' : '#4a7fa5');

  const displayVal = hasValue ? valFmt(val) : '—';

  return (
    <div style={{ padding: '11px 0', borderBottom: '0.5px solid #1a1812' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
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
          {displayVal}
        </span>
      </div>
      {quote && (
        <p style={{
          fontSize: 10, color: '#7a6e58', lineHeight: 1.6, fontStyle: 'italic',
          borderLeft: `1.5px solid ${isAlert ? (isSupply ? '#c9a84c33' : '#4a7fa533') : '#1e1c18'}`,
          paddingLeft: 8, marginBottom: 5,
        }}>
          "{quote}"
        </p>
      )}
      {transcriptUrl && (
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = use(searchParams);
  const activeTab = (params.tab === 'demand' ? 'demand' : 'supply') as 'supply' | 'demand';
  const router = useRouter();

  const [data, setData] = useState<ApiData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeSignal, setActiveSignal] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then((d: ApiData) => {
        setData(d);
        // default signal = first in current tab
        const sig = activeTab === 'supply' ? SUPPLY_SIGNALS[0].key : DEMAND_SIGNALS[0].key;
        setActiveSignal(sig);
      })
      .catch(() => setData({ signals: [], config: [], latestQuarter: '', tfPricingByQuarter: {}, latestTfPrice: null }));
  }, []);

  // Reset active signal when tab changes
  useEffect(() => {
    const sig = activeTab === 'supply' ? SUPPLY_SIGNALS[0].key : DEMAND_SIGNALS[0].key;
    setActiveSignal(sig);
  }, [activeTab]);

  const switchTab = (tab: 'supply' | 'demand') => {
    router.push(`/signals?tab=${tab}`);
  };

  // ── Empty / loading states ─────────────────────────────────────────────

  if (!data) {
    return (
      <div style={{ color: '#3a3528', fontSize: 12, paddingTop: 40, textAlign: 'center' }}>Loading…</div>
    );
  }

  const { signals, config } = data;

  // Build transcript URL lookup from config
  const urlByTicker: Record<string, string> = {};
  for (const row of config) {
    if (row.ticker && row.default_url) urlByTicker[row.ticker] = row.default_url;
  }
  // Also use transcript_url from signals rows if available
  for (const row of signals) {
    if (row.ticker && row.transcript_url) urlByTicker[row.ticker] = row.transcript_url;
  }

  const quarters = [...new Set(signals.map(r => r.quarter))].sort((a, b) => quarterIndex(a) - quarterIndex(b));
  const latestQ = quarters.at(-1) ?? '';
  const latestRows = signals.filter(r => r.quarter === latestQ);

  // ── Determine companies to chart ─────────────────────────────────────

  const isSupply = activeTab === 'supply';
  const typeFilter = isSupply ? 'vendor' : 'hyperscaler';

  // All tickers of the active type across all quarters
  const typeTickers = [...new Set(signals.filter(r => r.type === typeFilter).map(r => r.ticker))];

  // For supply: Samsung first (gold hero), fixed order
  let orderedTickers: string[];
  if (isSupply) {
    orderedTickers = VENDOR_ORDER.filter(t => typeTickers.includes(t));
    // append any additional vendors not in the fixed order
    typeTickers.forEach(t => { if (!orderedTickers.includes(t)) orderedTickers.push(t); });
  } else {
    // Demand: sort by latest capex_pct descending
    const latest = latestRows.filter(r => r.type === 'hyperscaler');
    orderedTickers = [...typeTickers].sort((a, b) => {
      const aRow = latest.find(r => r.ticker === a);
      const bRow = latest.find(r => r.ticker === b);
      return num(bRow?.capex_pct ?? '0') - num(aRow?.capex_pct ?? '0');
    });
  }

  // ── Chart data ────────────────────────────────────────────────────────

  const chartField: keyof SignalRow = isSupply ? 'bit_growth_pct' : 'capex_pct';
  const companyChartData = buildCompanyChart(signals, quarters, chartField, orderedTickers);

  // ── Signals list and evidence ─────────────────────────────────────────

  const signalDefs = isSupply ? SUPPLY_SIGNALS : DEMAND_SIGNALS;
  const activeSigDef = signalDefs.find(s => s.key === activeSignal) ?? signalDefs[0];

  // Evidence: latest-quarter rows for this type, sorted by signal value desc
  const evidenceRows = latestRows
    .filter(r => r.type === typeFilter)
    .sort((a, b) => {
      const field = activeSigDef.field as keyof SignalRow;
      return num(b[field] as string) - num(a[field] as string);
    });

  // ── Signal list direction for display ─────────────────────────────────

  function sigDir(key: string): string {
    const allSigs = [...SUPPLY_SIGNALS, ...DEMAND_SIGNALS];
    const def = allSigs.find(s => s.key === key);
    if (!def) return '';
    const rows = latestRows.filter(r => r.type === typeFilter);
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

  // ── Line colors ──────────────────────────────────────────────────────

  function lineColor(ticker: string, idx: number): string {
    if (isSupply) return VENDOR_COLORS[idx] ?? '#5a5040';
    // Demand: flag the lowest/worst spender gold
    if (idx === orderedTickers.length - 1 && orderedTickers.length >= 2) return DEMAND_GOLD;
    return DEMAND_BLUE_COLORS[idx] ?? '#2a5070';
  }
  function lineWidth(idx: number): number {
    if (isSupply) return VENDOR_WIDTHS[idx] ?? 1.5;
    return idx === 0 ? 2 : 1.5;
  }
  function lineOpacity(idx: number): number {
    if (isSupply) return VENDOR_OPACITIES[idx] ?? 0.5;
    return idx === 0 ? 1 : idx === 1 ? 0.85 : 0.7;
  }

  // ── Render ───────────────────────────────────────────────────────────

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

  const chartLabel = isSupply
    ? 'Per-vendor bit growth % YoY'
    : 'Per-hyperscaler CapEx % YoY';
  const chartTitle = isSupply
    ? 'Vendor supply growth — individual lines'
    : 'Hyperscaler demand — individual lines';

  return (
    <div>
      {/* Back link */}
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          style={activeTab === 'supply' ? tabActive('supply') : tabBase}
          onClick={() => switchTab('supply')}
        >
          Supply pressure signals
        </button>
        <button
          style={activeTab === 'demand' ? tabActive('demand') : tabBase}
          onClick={() => switchTab('demand')}
        >
          Demand health signals
        </button>
      </div>

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
                  strokeOpacity={lineOpacity(idx)}
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
                <span style={{ fontSize: 11, color: isActive ? accentColor : '#9a8e78' }}>
                  {sig.label}
                </span>
                <span style={{ fontSize: 10, color: sigDirColor(sig.key) }}>
                  {sigDir(sig.key)}
                </span>
              </div>
            );
          })}
          {isSupply && (() => {
            const tfVal = data.tfPricingByQuarter?.[latestQ] ?? null;
            if (tfVal === null) return null;
            const tfColor = tfVal > 0 ? '#5dcaa5' : '#c9a84c';
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 5, marginTop: 4, borderTop: '0.5px solid #1a1812' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#9a8e78' }}>NAND Contract Price</span>
                  <span style={{ display: 'block', fontSize: 9, color: '#555', letterSpacing: '0.04em' }}>TrendForce</span>
                </div>
                <span style={{ fontSize: 10, color: tfColor }}>{tfVal > 0 ? '+' : ''}{tfVal.toFixed(1)}%</span>
              </div>
            );
          })()}
        </div>

        {/* Evidence panel */}
        <div style={{ background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: 9, color: '#8a7e68', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>
            {activeSigDef.label} — strongest first
          </div>

          {evidenceRows.length === 0 ? (
            <div style={{ color: '#3a3528', fontSize: 11, paddingTop: 20, textAlign: 'center' }}>
              No data ingested yet —{' '}
              <a href="/ingest" style={{ color: '#7a6e54', textDecoration: 'underline' }}>go to Ingest</a>
            </div>
          ) : (
            evidenceRows.map(row => (
              <EvidenceRow
                key={row.ticker}
                row={row}
                field={activeSigDef.field}
                quoteField={activeSigDef.quoteField}
                valFmt={activeSigDef.valFmt}
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
