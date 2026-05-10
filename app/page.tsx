'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────

interface SignalRow {
  run_id: string; quarter: string; ingested_at: string;
  company: string; ticker: string; type: string;
  bit_growth_pct: string; capex_pct: string; asp_change_pct: string;
  inventory_days: string; mgmt_tone_score: string; node_transition_note: string;
  bit_growth_quote: string; capex_quote: string; asp_quote: string;
  inventory_quote: string; mgmt_tone_quote: string; transcript_url: string;
}

interface ApiData {
  signals: SignalRow[];
  latestQuarter: string;
  sourcesCount: number;
  supplyByQuarter: Record<string, { leading: number | null; trailing: number | null }>;
  supplyIndexByQuarter: Record<string, number | null>;
  demandByQuarter: Record<string, number | null>;
  demandIndexByQuarter: Record<string, number | null>;
  inventoryByQuarter: Record<string, number | null>;
  storageByQuarter: Record<string, number | null>;
  urgencyByQuarter: Record<string, number | null>;
  tfPricingByQuarter: Record<string, number | null>;
  latestTfPrice: number | null;
  narratives: Record<string, string>;
  narrativesMom: Record<string, string>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const QUARTER_ORDER = ['Q2 2024','Q3 2024','Q4 2024','Q1 2025','Q2 2025','Q3 2025','Q4 2025','Q1 2026'];
function quarterIndex(q: string): number {
  const idx = QUARTER_ORDER.indexOf(q);
  return idx >= 0 ? idx : 999;
}

function num(s: string): number { return parseFloat(s) || 0; }

function avg(rows: SignalRow[], field: keyof SignalRow): number {
  const vals = rows.map(r => num(r[field] as string)).filter(v => !isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// Build sparkline SVG polyline points from an array of values
function sparkPoints(values: number[]): string {
  if (values.length === 0) return '40,9 40,9';
  if (values.length === 1) return `0,9 80,9`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * 80;
    const y = 3 + (1 - (v - min) / range) * 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function lastPoint(values: number[]): [number, number] {
  if (values.length === 0) return [40, 9];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const last = values[values.length - 1];
  const y = 3 + (1 - (last - min) / range) * 12;
  return [80, y];
}

// ── Supply signal thresholds ───────────────────────────────────────────────

type Dir = { label: string; cls: 'watch' | 'ok' | 'stable' };

function capexDir(v: number): Dir {
  if (v > 25) return { label: '↑ watch', cls: 'watch' };
  if (v > 10) return { label: '→ moderate', cls: 'stable' };
  return { label: '→ ok', cls: 'stable' };
}
function nodeDir(hasNote: boolean): Dir {
  return hasNote ? { label: '↑ watch', cls: 'watch' } : { label: '→ stable', cls: 'stable' };
}
function invDir(v: number): Dir {
  if (v > 80) return { label: '↑ elevated', cls: 'watch' };
  if (v < 55) return { label: '→ lean', cls: 'ok' };
  return { label: '→ ok', cls: 'stable' };
}
function toneDir(v: number): Dir {
  if (v >= 4) return { label: '→ constructive', cls: 'ok' };
  if (v < 2.5) return { label: '↑ cautious', cls: 'watch' };
  return { label: '→ neutral', cls: 'stable' };
}
function aspDir(v: number): Dir {
  if (v > 2) return { label: '→ holding', cls: 'ok' };
  if (v >= 0) return { label: '→ firm', cls: 'stable' };
  return { label: '↑ watch', cls: 'watch' };
}
function demandSpendDir(v: number): Dir {
  if (v > 20) return { label: '↑ healthy', cls: 'ok' };
  if (v > 5) return { label: '→ stable', cls: 'stable' };
  return { label: '→ flat', cls: 'stable' };
}
function demandToneDir(v: number): Dir {
  if (v >= 4) return { label: '↑ healthy', cls: 'ok' };
  if (v >= 3) return { label: '→ stable', cls: 'stable' };
  return { label: '→ cooling', cls: 'watch' };
}

// ── Chart tooltip ─────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  narratives: Record<string, string>;
  narrativesMom: Record<string, string>;
  chartView: 'gap' | 'mom';
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <span key={i} style={{ color: '#c9a84c', fontWeight: 700 }}>{part}</span>
      : part
  );
}

function ChartTooltip({ active, payload, label, narratives, narrativesMom, chartView }: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const narrative = (chartView === 'mom' ? narrativesMom : narratives)[label];
  const bullets = narrative
    ? narrative.trim().replace(/\.$/, '').split(/\.\s+/).filter(Boolean)
    : [];
  const labelMap: Record<string, string> = {
    supplyIndex: 'Leading supply (index)', demand: 'Demand (index)',
    leadingSupply: 'Leading supply', trailingSupply: 'Trailing supply (bit growth)', demandYoY: 'Demand YoY%',
    inventoryDays: 'Inventory days', tfPrice: 'NAND price QoQ%',
    aiUrgency: 'AI urgency (norm.)', storageHunger: 'Storage hunger (norm.)',
  };
  return (
    <div style={{ background: '#0b0906', border: '0.5px solid #2a2518', borderRadius: 6, padding: '10px 12px', maxWidth: 290 }}>
      <div style={{ fontSize: 9, color: '#6a6050', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      {bullets.length > 0 && (
        <>
          <div style={{ marginBottom: 6 }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ color: '#4a4030', fontSize: 11, flexShrink: 0, marginTop: 1 }}>·</span>
                <span style={{ fontSize: 11, color: '#a09070', lineHeight: 1.5 }}>{parseBold(b)}</span>
              </div>
            ))}
          </div>
          <a
            href={`/signals?quarter=${label.replace(' ', '+')}&tab=supply`}
            style={{ fontSize: 10, color: '#c9a84c', textDecoration: 'none', display: 'block', marginBottom: 8 }}
          >
            drill in →
          </a>
        </>
      )}
      <div style={{ borderTop: '0.5px solid #1e1c18', marginBottom: 5 }} />
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 1 }}>
          <span style={{ fontSize: 9, color: '#4a4030' }}>{labelMap[p.name] ?? p.name}</span>
          <span style={{ fontSize: 9, color: '#5a5040' }}>
            {p.name === 'inventoryDays'
              ? `${p.value.toFixed(0)}d`
              : p.name === 'tfPrice'
              ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%`
              : `${p.value.toFixed(1)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Sparkline component ────────────────────────────────────────────────────

function Spark({ values, color }: { values: number[]; color: string }) {
  const pts = sparkPoints(values);
  const [lx, ly] = lastPoint(values);
  return (
    <svg viewBox="0 0 80 18" style={{ flex: 1, height: 18, margin: '0 10px' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

// ── Gap bar ────────────────────────────────────────────────────────────────

function GapBar({
  supplyLeadingByQuarter,
  demandByQuarter,
  gapQ,
}: {
  supplyLeadingByQuarter: Record<string, number | null>;
  demandByQuarter: Record<string, number | null>;
  gapQ: string;
}) {
  const allGaps = Object.keys(supplyLeadingByQuarter)
    .map(q => {
      const s = supplyLeadingByQuarter[q];
      const d = demandByQuarter[q];
      return s != null && d != null ? d - s : null;
    })
    .filter((v): v is number => v !== null);

  const leadingSupply = supplyLeadingByQuarter[gapQ] ?? null;
  const demand = demandByQuarter[gapQ] ?? null;
  const gapDiff = leadingSupply != null && demand != null ? demand - leadingSupply : null;

  let position = 50;
  if (gapDiff !== null && allGaps.length > 1) {
    const minGap = Math.min(...allGaps);
    const maxGap = Math.max(...allGaps);
    const range = maxGap - minGap || 1;
    position = Math.round(5 + ((gapDiff - minGap) / range) * 90);
  }

  let statusText = 'No data';
  if (gapDiff !== null) {
    if (position > 66) statusText = 'Demand absorbing supply · safe';
    else if (position > 33) statusText = 'Balanced · monitor';
    else statusText = 'Supply pressure building · act';
  }

  const S: Record<string, React.CSSProperties> = {
    card: {
      background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10,
      padding: '12px 22px', marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 14,
    },
    label: { fontSize: 9, color: '#6a6050', letterSpacing: '0.07em', textTransform: 'uppercase', width: 85, lineHeight: 1.5 } as React.CSSProperties,
    track: { flex: 1, height: 3, background: '#252318', borderRadius: 2, position: 'relative' } as React.CSSProperties,
    fill: { height: '100%', borderRadius: 2, width: `${position}%`, background: '#c9a84c', opacity: 0.4 } as React.CSSProperties,
    marker: { position: 'absolute', left: `${position}%`, top: -5, width: 1.5, height: 13, background: '#c9a84c', borderRadius: 1 } as React.CSSProperties,
    status: { fontSize: 11, color: '#c9a84c', fontWeight: 500, whiteSpace: 'nowrap' } as React.CSSProperties,
  };

  return (
    <div style={S.card}>
      <span style={S.label}>Gap closed · act now</span>
      <div style={S.track}>
        <div style={S.fill} />
        <div style={S.marker} />
      </div>
      <span style={{ ...S.label, textAlign: 'right' }}>Gap wide · safe territory</span>
      <span style={S.status}>· {statusText}</span>
      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#111009', color: '#4a4030', border: '0.5px solid #2a2518', whiteSpace: 'nowrap' }}>
        Absorption gap · always
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showTfPrice, setShowTfPrice] = useState(false);
  const [showAiUrgency, setShowAiUrgency] = useState(false);
  const [showStorageHunger, setShowStorageHunger] = useState(false);
  const [hoveredQuarter, setHoveredQuarter] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'gap' | 'mom'>('gap');

  useEffect(() => {
    setMounted(true);
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ signals: [], latestQuarter: '', sourcesCount: 0, supplyByQuarter: {}, supplyIndexByQuarter: {}, demandByQuarter: {}, demandIndexByQuarter: {}, inventoryByQuarter: {}, storageByQuarter: {}, urgencyByQuarter: {}, tfPricingByQuarter: {}, latestTfPrice: null, narratives: {}, narrativesMom: {} }));
  }, []);

  if (!data) {
    return (
      <div style={{ color: '#3a3528', fontSize: 12, paddingTop: 40, textAlign: 'center' }}>
        Loading…
      </div>
    );
  }

  const { signals } = data;

  if (signals.length === 0) {
    return (
      <div style={{ color: '#3a3528', fontSize: 12, paddingTop: 60, textAlign: 'center' }}>
        No data ingested yet —{' '}
        <a href="/ingest" style={{ color: '#7a6e54', textDecoration: 'underline' }}>go to Ingest</a>
      </div>
    );
  }

  // ── Partition data ───────────────────────────────────────────────────────
  const quarters = [...new Set(signals.map(r => r.quarter))].sort((a, b) => quarterIndex(a) - quarterIndex(b));
  const latestQ = quarters.at(-1)!;
  const latestRows = signals.filter(r => r.quarter === latestQ);
  const vendors = latestRows.filter(r => r.type === 'vendor');
  const hyperscalers = latestRows.filter(r => r.type === 'hyperscaler');

  // ── Hero chart data ──────────────────────────────────────────────────────
  const allChartQuarters = [...new Set([
    ...Object.keys(data.supplyByQuarter),
    ...Object.keys(data.demandIndexByQuarter ?? data.demandByQuarter),
  ])].sort((a, b) => quarterIndex(a) - quarterIndex(b));

  const normalizeScore = (score: number | null): number | null =>
    score != null ? Math.round((score - 1) * 25 * 10) / 10 : null;

  // Normalize demand index to growth-from-base: (index - 100), so Q2 2024 = 0%
  const demandNormByQuarter: Record<string, number | null> = {};
  for (const [q, idx] of Object.entries(data.demandIndexByQuarter ?? {})) {
    demandNormByQuarter[q] = idx != null ? Math.round((idx - 100) * 10) / 10 : null;
  }

  const chartData = allChartQuarters.map(q => ({
    quarter: q,
    // Gap view
    supplyIndex: data.supplyIndexByQuarter?.[q] ?? null,
    demand: demandNormByQuarter[q] ?? null,
    // Momentum view
    leadingSupply: data.supplyByQuarter[q]?.leading ?? null,
    trailingSupply: data.supplyByQuarter[q]?.trailing ?? null,
    demandYoY: data.demandByQuarter[q] ?? null,
    // Shared overlays
    inventoryDays: data.inventoryByQuarter?.[q] ?? null,
    tfPrice: data.tfPricingByQuarter?.[q] ?? null,
    aiUrgency: normalizeScore(data.urgencyByQuarter?.[q] ?? null),
    storageHunger: normalizeScore(data.storageByQuarter?.[q] ?? null),
  }));

  const gapQ = hoveredQuarter ?? latestQ;
  const latestTfPrice = data.latestTfPrice ?? null;

  // ── Sparkline series (per-quarter averages) ──────────────────────────────
  const qVendors = (q: string) => signals.filter(r => r.quarter === q && r.type === 'vendor');
  const qHypers = (q: string) => signals.filter(r => r.quarter === q && r.type === 'hyperscaler');

  const sparkCapex = quarters.map(q => avg(qVendors(q), 'capex_pct'));
  const sparkBitGrowth = quarters.map(q => avg(qVendors(q), 'bit_growth_pct'));
  const sparkInv = quarters.map(q => avg(qVendors(q), 'inventory_days'));
  const sparkTone = quarters.map(q => avg(qVendors(q), 'mgmt_tone_score'));
  const sparkAsp = quarters.map(q => avg(qVendors(q), 'asp_change_pct'));
  const sparkHCapex = quarters.map(q => avg(qHypers(q), 'capex_pct'));
  const sparkHTone = quarters.map(q => avg(qHypers(q), 'mgmt_tone_score'));
  const sparkTfPrice = quarters.map(q => data.tfPricingByQuarter?.[q] ?? 0);

  // ── Supply signal directions ─────────────────────────────────────────────
  function tfPriceDir(v: number | null): Dir {
    if (v === null) return { label: '—', cls: 'stable' };
    if (v > 30) return { label: '↑↑ surging', cls: 'ok' };
    if (v > 0) return { label: '↑ rising', cls: 'ok' };
    if (v > -10) return { label: '→ softening', cls: 'stable' };
    return { label: '↓ declining', cls: 'watch' };
  }

  const avgCapex = avg(vendors, 'capex_pct');
  const hasNodeNote = vendors.some(r => r.node_transition_note?.trim());
  const avgInv = avg(vendors, 'inventory_days');
  const avgTone = avg(vendors, 'mgmt_tone_score');
  const avgAsp = avg(vendors, 'asp_change_pct');
  const avgHCapex = avg(hyperscalers, 'capex_pct');
  const avgHTone = avg(hyperscalers, 'mgmt_tone_score');

  const supplySignals: Array<{ name: string; spark: number[]; dir: Dir; color: string; attribution?: string }> = [
    { name: 'CapEx trending',   spark: sparkCapex,    dir: capexDir(avgCapex),       color: avgCapex > 25 ? '#c9a84c' : '#3a3528' },
    { name: 'Node transitions', spark: sparkBitGrowth, dir: nodeDir(hasNodeNote),    color: hasNodeNote ? '#c9a84c' : '#3a3528' },
    { name: 'Inventory days',   spark: sparkInv,       dir: invDir(avgInv),          color: avgInv > 80 ? '#c9a84c' : '#3a3528' },
    { name: 'Mgmt tone',        spark: sparkTone,      dir: toneDir(avgTone),        color: avgTone < 2.5 ? '#c9a84c' : '#3a3528' },
    { name: 'ASP trajectory',   spark: sparkAsp,       dir: aspDir(avgAsp),          color: avgAsp > 0 ? '#4a7fa5' : '#c9a84c' },
    { name: 'NAND Contract Price', spark: sparkTfPrice, dir: tfPriceDir(latestTfPrice), color: latestTfPrice !== null && latestTfPrice > 0 ? '#5dcaa5' : '#3a3528', attribution: 'TrendForce' },
  ];

  const demandSignals: Array<{ name: string; spark: number[]; dir: Dir; color: string }> = [
    { name: 'Hyperscaler spend', spark: sparkHCapex, dir: demandSpendDir(avgHCapex), color: avgHCapex > 20 ? '#4a7fa5' : '#3a3528' },
    { name: 'Storage hunger',    spark: sparkHTone,   dir: demandToneDir(avgHTone),  color: avgHTone >= 4 ? '#4a7fa5' : '#3a3528' },
    { name: 'AI demand',         spark: sparkHTone,   dir: demandToneDir(avgHTone),  color: avgHTone >= 4 ? '#4a7fa5' : '#3a3528' },
  ];

  // ── Styles ───────────────────────────────────────────────────────────────
  const S: Record<string, React.CSSProperties> = {
    chartCard: {
      background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10,
      padding: '20px 22px 14px', marginBottom: 10,
    },
    chartLabel: { fontSize: 9, color: '#7a6e58', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 },
    chartTitle: { fontSize: 14, fontWeight: 500, color: '#d4c090', marginBottom: 2 },
    chartSub: { fontSize: 10, color: '#7a6e58', marginBottom: 14 },
    legend: { display: 'flex', gap: 18, marginBottom: 12 },
    legItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#8a7e68' },
    legDot: { width: 8, height: 8, borderRadius: '50%' },
    panel: {
      background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10,
      padding: '16px 18px', cursor: 'pointer',
    },
    panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    sigRow: { display: 'flex', alignItems: 'center', marginBottom: 10 },
    sigName: { fontSize: 11, color: '#a09080', width: 110, flexShrink: 0 },
    sigStatus: { fontSize: 10, minWidth: 72, textAlign: 'right' },
  };

  const dirColor = (cls: Dir['cls']) =>
    cls === 'watch' ? '#c9a84c' : cls === 'ok' ? '#4a7fa5' : '#3a3528';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Hero chart ──────────────────────────────────────────────────── */}
      <div style={S.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
          <div>
            <div style={S.chartLabel as React.CSSProperties}>Primary signal</div>
            <div style={S.chartTitle as React.CSSProperties}>
              {chartView === 'gap' ? 'Demand Absorption Gap' : 'YoY Cycle Momentum'}
            </div>
            <div style={S.chartSub as React.CSSProperties}>
              {chartView === 'gap'
                ? 'Leading supply vs hyperscaler capex · Q2 2024 baseline'
                : 'Supply and demand acceleration quarter by quarter · YoY %'}
            </div>
          </div>
          <select
            value={chartView}
            onChange={e => setChartView(e.target.value as 'gap' | 'mom')}
            style={{
              background: '#111009', color: '#8a7e60', fontSize: 10,
              border: '0.5px solid #2a2518', borderRadius: 4, padding: '3px 8px',
              cursor: 'pointer', fontFamily: 'var(--font-sans)', marginTop: 2, flexShrink: 0,
            }}
          >
            <option value="gap">Demand Absorption Gap</option>
            <option value="mom">YoY Cycle Momentum</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 10, color: '#6a6050', display: 'flex', gap: 5, cursor: 'pointer', alignItems: 'center' }}>
            <input type="checkbox" checked={showInventory} onChange={e => setShowInventory(e.target.checked)} style={{ accentColor: '#d4537e' }} />
            Inventory Days
          </label>
          <label style={{ fontSize: 10, color: '#6a6050', display: 'flex', gap: 5, cursor: 'pointer', alignItems: 'center' }}>
            <input type="checkbox" checked={showTfPrice} onChange={e => setShowTfPrice(e.target.checked)} style={{ accentColor: '#5dcaa5' }} />
            NAND Price QoQ%
          </label>
          {chartView === 'gap' && (
            <label style={{ fontSize: 10, color: '#6a6050', display: 'flex', gap: 5, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={showAiUrgency} onChange={e => setShowAiUrgency(e.target.checked)} style={{ accentColor: '#4a7fa5' }} />
              AI urgency
            </label>
          )}
          {chartView === 'gap' && (
            <label style={{ fontSize: 10, color: '#6a6050', display: 'flex', gap: 5, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={showStorageHunger} onChange={e => setShowStorageHunger(e.target.checked)} style={{ accentColor: '#c87a30' }} />
              Storage hunger
            </label>
          )}
        </div>
        <div style={S.legend as React.CSSProperties}>
          {chartView === 'gap' ? (
            <>
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="2" /></svg>
                Leading supply (index)
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <div style={{ ...S.legDot, background: '#4a7fa5' }} />
                Demand (index)
              </div>
              {showAiUrgency && (
                <div style={S.legItem as React.CSSProperties}>
                  <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#4a7fa5" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                  AI urgency (norm. 0–100%)
                </div>
              )}
              {showStorageHunger && (
                <div style={S.legItem as React.CSSProperties}>
                  <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c87a30" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                  Storage hunger (norm. 0–100%)
                </div>
              )}
            </>
          ) : (
            <>
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="2" /></svg>
                Leading supply
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                Trailing supply (bit growth)
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <div style={{ ...S.legDot, background: '#4a7fa5' }} />
                Demand YoY%
              </div>
            </>
          )}
          {showInventory && (
            <div style={S.legItem as React.CSSProperties}>
              <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#d4537e" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
              Inventory Days (right)
            </div>
          )}
          {showTfPrice && (
            <div style={S.legItem as React.CSSProperties}>
              <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#5dcaa5" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
              NAND Price QoQ% (right)
            </div>
          )}
        </div>

        {mounted ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              onMouseMove={(e) => { if (e.activeLabel) setHoveredQuarter(e.activeLabel as string); }}
              onMouseLeave={() => setHoveredQuarter(null)}
            >
              <CartesianGrid stroke="#1a1812" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="quarter"
                tick={{ fill: '#6a6050', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="y"
                tick={{ fill: '#6a6050', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                label={{ value: chartView === 'gap' ? '% Δ from Q2 2024' : 'Year-over-year % (supply vs demand growth)', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 7, fill: '#4a4030', fontFamily: 'var(--font-sans)' } }}
                width={52}
              />
              {showInventory && (
                <YAxis
                  yAxisId="inv"
                  orientation="right"
                  domain={[100, 180]}
                  tick={{ fill: '#993556', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}d`}
                  width={34}
                />
              )}
              {showTfPrice && (
                <YAxis
                  yAxisId="tf"
                  orientation="right"
                  tick={{ fill: '#3a8a6a', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                  width={38}
                />
              )}
              <Tooltip
                content={<ChartTooltip narratives={data.narratives ?? {}} narrativesMom={data.narrativesMom ?? {}} chartView={chartView} />}
                wrapperStyle={{ pointerEvents: 'auto' }}
              />
              {chartView === 'gap' ? (
                <>
                  <Line
                    dataKey="supplyIndex" name="supplyIndex" yAxisId="y"
                    stroke="#c9a84c" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#c9a84c' }}
                    connectNulls
                  />
                  <Line
                    dataKey="demand" name="demand" yAxisId="y"
                    stroke="#4a7fa5" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#4a7fa5' }}
                    connectNulls
                  />
                  {showAiUrgency && (
                    <Line
                      dataKey="aiUrgency" name="aiUrgency" yAxisId="y"
                      stroke="#4a7fa5" strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.7}
                      dot={false} activeDot={{ r: 3, fill: '#4a7fa5' }}
                      connectNulls
                    />
                  )}
                  {showStorageHunger && (
                    <Line
                      dataKey="storageHunger" name="storageHunger" yAxisId="y"
                      stroke="#c87a30" strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.7}
                      dot={false} activeDot={{ r: 3, fill: '#c87a30' }}
                      connectNulls
                    />
                  )}
                </>
              ) : (
                <>
                  <Line
                    dataKey="leadingSupply" name="leadingSupply" yAxisId="y"
                    stroke="#c9a84c" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#c9a84c' }}
                    connectNulls
                  />
                  <Line
                    dataKey="trailingSupply" name="trailingSupply" yAxisId="y"
                    stroke="#c9a84c" strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.6}
                    dot={false} activeDot={{ r: 3, fill: '#c9a84c' }}
                    connectNulls
                  />
                  <Line
                    dataKey="demandYoY" name="demandYoY" yAxisId="y"
                    stroke="#4a7fa5" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#4a7fa5' }}
                    connectNulls
                  />
                </>
              )}
              {showInventory && (
                <Line
                  dataKey="inventoryDays" name="inventoryDays" yAxisId="inv"
                  stroke="#d4537e" strokeWidth={1.5} strokeDasharray="3 3"
                  dot={false} activeDot={{ r: 3, fill: '#d4537e' }}
                  connectNulls={false}
                />
              )}
              {showTfPrice && (
                <Line
                  dataKey="tfPrice" name="tfPrice" yAxisId="tf"
                  stroke="#5dcaa5" strokeWidth={1.5} strokeDasharray="2 3"
                  dot={false} activeDot={{ r: 3, fill: '#5dcaa5' }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </div>

      {/* ── Gap bar ──────────────────────────────────────────────────────── */}
      <GapBar supplyLeadingByQuarter={data.supplyIndexByQuarter ?? {}} demandByQuarter={demandNormByQuarter} gapQ={gapQ} />

      {/* ── Signal panels ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>

        {/* Supply panel */}
        <div
          style={{
            ...S.panel,
            transition: 'border-color 0.15s',
          }}
          onClick={() => router.push('/signals?tab=supply')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#c9a84c44')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e1c18')}
        >
          <div style={S.panelHead as React.CSSProperties}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#c9a84c', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              Supply pressure signals
            </span>
            <span style={{ fontSize: 10, color: '#6a6050' }}>drill in →</span>
          </div>
          {supplySignals.map(sig => (
            <div key={sig.name} style={S.sigRow as React.CSSProperties}>
              <span style={S.sigName as React.CSSProperties}>
                {sig.name}
                {sig.attribution && (
                  <span style={{ display: 'block', fontSize: 9, color: '#555', letterSpacing: '0.04em' }}>{sig.attribution}</span>
                )}
              </span>
              <Spark values={sig.spark} color={sig.color} />
              <span style={{ ...S.sigStatus, color: dirColor(sig.dir.cls) } as React.CSSProperties}>
                {sig.dir.label}
              </span>
            </div>
          ))}
        </div>

        {/* Demand panel */}
        <div
          style={{ ...S.panel, transition: 'border-color 0.15s' }}
          onClick={() => router.push('/signals?tab=demand')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#4a7fa544')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e1c18')}
        >
          <div style={S.panelHead as React.CSSProperties}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#4a7fa5', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
              Demand health signals
            </span>
            <span style={{ fontSize: 10, color: '#6a6050' }}>drill in →</span>
          </div>
          {demandSignals.map(sig => (
            <div key={sig.name} style={S.sigRow as React.CSSProperties}>
              <span style={S.sigName as React.CSSProperties}>{sig.name}</span>
              <Spark values={sig.spark} color={sig.color} />
              <span style={{ ...S.sigStatus, color: dirColor(sig.dir.cls) } as React.CSSProperties}>
                {sig.dir.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
