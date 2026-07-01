'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { Inter } from 'next/font/google';
import { quarterAdd, sortQuarters } from '@/lib/quarter';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

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
  narrativesForecast: Record<string, string>;
  narrativesForecastMom: Record<string, string>;
  forecastSupplyIndex: Record<string, number | null>;
  forecastDemandIndex: Record<string, number | null>;
  forecastMeta: Record<string, { confidence: number; basis: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
  payload?: unknown[];
  label?: string;
  narratives: Record<string, string>;
  narrativesMom: Record<string, string>;
  narrativesForecast: Record<string, string>;
  narrativesForecastMom: Record<string, string>;
  chartView: 'gap' | 'mom';
  forecastMeta: Record<string, { confidence: number; basis: string }>;
}


// Extract bullets from HTML <li> format or fall back to semicolon/period split
function extractBullets(text: string): string[] {
  const liMatches = [...text.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].trim());
  if (liMatches.length > 0) return liMatches;
  return text.trim().replace(/\.$/, '').split(/[.;]\s+/).filter(Boolean);
}

// Render inline text handling both <b>...</b> HTML and **...** markdown
function renderBulletText(text: string): React.ReactNode {
  const parts = text.split(/(<b>[\s\S]*?<\/b>|\*\*[\s\S]+?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('<b>') && part.endsWith('</b>'))
      return <span key={i} style={{ color: '#c9a84c', fontWeight: 700 }}>{part.slice(3, -4)}</span>;
    if (part.startsWith('**') && part.endsWith('**'))
      return <span key={i} style={{ color: '#c9a84c', fontWeight: 700 }}>{part.slice(2, -2)}</span>;
    return part;
  });
}

function ChartTooltip({ active, payload, label, narratives, narrativesMom, narrativesForecast, narrativesForecastMom, chartView, forecastMeta }: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const forecast = forecastMeta[label];
  const forecastNarrative = chartView === 'mom'
    ? (narrativesForecastMom[label] || narrativesForecast[label])
    : narrativesForecast[label];
  const narrative = forecast
    ? (forecastNarrative || forecast.basis)
    : (chartView === 'mom' ? narrativesMom : narratives)[label];
  const bullets = narrative ? extractBullets(narrative) : [];

  return (
    <div style={{ background: '#0b0906', border: '0.5px solid #2a2518', borderRadius: 6, padding: '10px 12px', maxWidth: 290 }}>
      <div style={{ fontSize: 9, color: '#6a6050', letterSpacing: '0.08em', marginBottom: 8 }}>
        {label}
        {forecast && <span style={{ marginLeft: 6, color: '#c9973a', fontSize: 8, letterSpacing: '0.06em' }}>PROJECTED</span>}
      </div>
      {bullets.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ color: '#4a4030', fontSize: 11, flexShrink: 0, marginTop: 1 }}>·</span>
              <span style={{ fontSize: 11, color: '#a09070', lineHeight: 1.5 }}>{renderBulletText(b)}</span>
            </div>
          ))}
        </div>
      )}
      {!forecast && (
        <a
          href={`/signals?quarter=${label.replace(' ', '+')}&tab=supply`}
          style={{ fontSize: 10, color: '#c9a84c', textDecoration: 'none', display: 'block' }}
        >
          drill in →
        </a>
      )}
      {forecast && (() => {
        const confidence = forecastMeta[label]?.confidence ?? 0.5;
        const W = 120;
        const barX = Math.round(confidence * W);
        return (
          <div style={{ borderTop: '0.5px solid #1e1c18', paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: '#4a4030', marginBottom: 5 }}>forecast confidence</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 7, color: '#c9973a', opacity: 0.55, flexShrink: 0 }}>low</span>
              <svg style={{ flex: 1 }} height="16" viewBox={`0 0 ${W} 16`} preserveAspectRatio="none">
                <polygon points={`0,14 ${W},14 ${W},0`} fill="#c9973a" opacity="0.25" />
                <rect x={barX - 1} y={0} width={2.5} height={14} fill="#c9973a" opacity={0.9} rx={1} />
              </svg>
              <span style={{ fontSize: 7, color: '#c9973a', opacity: 0.55, flexShrink: 0 }}>high</span>
            </div>
          </div>
        );
      })()}
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
  forecastMeta,
}: {
  supplyLeadingByQuarter: Record<string, number | null>;
  demandByQuarter: Record<string, number | null>;
  gapQ: string;
  forecastMeta: Record<string, { confidence: number; basis: string }>;
}) {
  const isForecast = !!forecastMeta[gapQ];
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
  if (isForecast) statusText = `${statusText} (projected)`;

  const markerOpacity = isForecast ? 0.4 : 0.75;

  const S: Record<string, React.CSSProperties> = {
    card: {
      background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10,
      padding: '12px 22px', marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 14,
      opacity: isForecast ? 0.7 : 1,
    },
    label: { fontSize: 9, color: '#6a6050', letterSpacing: '0.07em', textTransform: 'uppercase', width: 85, lineHeight: 1.5 } as React.CSSProperties,
    track: { flex: 1, height: 3, background: '#252318', borderRadius: 2, position: 'relative' } as React.CSSProperties,
    fill: { height: '100%', borderRadius: 2, width: `${position}%`, background: '#c9a84c', opacity: markerOpacity } as React.CSSProperties,
    marker: { position: 'absolute', left: `${position}%`, top: -5, width: 1.5, height: 13, background: '#c9a84c', borderRadius: 1, opacity: markerOpacity } as React.CSSProperties,
    status: { fontSize: 11, color: isForecast ? '#9a7830' : '#c9a84c', fontWeight: 500, whiteSpace: 'nowrap' } as React.CSSProperties,
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
      .catch(() => setData({ signals: [], latestQuarter: '', sourcesCount: 0, supplyByQuarter: {}, supplyIndexByQuarter: {}, demandByQuarter: {}, demandIndexByQuarter: {}, inventoryByQuarter: {}, storageByQuarter: {}, urgencyByQuarter: {}, tfPricingByQuarter: {}, latestTfPrice: null, narratives: {}, narrativesMom: {}, narrativesForecast: {}, narrativesForecastMom: {}, forecastSupplyIndex: {}, forecastDemandIndex: {}, forecastMeta: {} }));
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
  const quarters = sortQuarters([...new Set(signals.map(r => r.quarter))]);
  const latestQ = quarters.at(-1)!;
  const latestRows = signals.filter(r => r.quarter === latestQ);
  const vendors = latestRows.filter(r => r.type === 'vendor');
  const hyperscalers = latestRows.filter(r => r.type === 'hyperscaler');

  // ── Hero chart data ──────────────────────────────────────────────────────
  // Current quarter per methodology's "current_quarter" decision: MAX(quarter)
  // WHERE ticker='MU' AND is_forecast is not true — derived fresh each render.
  const muActualQuarters = sortQuarters([...new Set(signals.filter(r => r.ticker === 'MU').map(r => r.quarter))]);
  const currentQuarter = muActualQuarters.at(-1) ?? latestQ;
  const forecastQuarters = sortQuarters(Object.keys(data.forecastMeta ?? {}));
  const allChartQuarters = sortQuarters([...new Set([...quarters, ...forecastQuarters])]);

  const normalizeScore = (score: number | null): number | null =>
    score != null ? Math.round((score - 1) * 25 * 10) / 10 : null;

  // Normalize demand index to growth-from-base: (index - 100), so Q2 2024 = 0%
  const demandNormByQuarter: Record<string, number | null> = {};
  for (const [q, idx] of Object.entries(data.demandIndexByQuarter ?? {})) {
    demandNormByQuarter[q] = idx != null ? Math.round((idx - 100) * 10) / 10 : null;
  }
  // Forecast demand norm
  const forecastDemandNorm: Record<string, number | null> = {};
  for (const [q, idx] of Object.entries(data.forecastDemandIndex ?? {})) {
    forecastDemandNorm[q] = idx != null ? Math.round((idx - 100) * 10) / 10 : null;
  }

  const bandWidth = (value: number, confidence: number, quartersOut: number) => {
    const timeMultiplier = quartersOut === 1 ? 1.0 : 1.6;
    return Math.abs(value) * (1 - confidence) * 0.3 * timeMultiplier;
  };

  // Momentum view: absolute supply scale base for forecast line continuity
  const baseLeadingSupply = (data.supplyByQuarter?.['Q2 2024'] as { leading?: number } | undefined)?.leading ?? 0;

  const chartData = allChartQuarters.map((q, qi) => {
    const isForecastQ = !!data.forecastMeta?.[q];
    const isAnchor = q === currentQuarter;
    const forecastIdx = forecastQuarters.indexOf(q);
    const quartersOut = forecastIdx >= 0 ? forecastIdx + 1 : 0;
    const conf = data.forecastMeta?.[q]?.confidence ?? 0.85;

    const supplyForecastVal = isForecastQ
      ? (data.forecastSupplyIndex?.[q] ?? null)
      : isAnchor ? (data.supplyIndexByQuarter?.[q] ?? null) : null;

    const demandForecastVal = isForecastQ
      ? (forecastDemandNorm[q] ?? null)
      : isAnchor ? (demandNormByQuarter[q] ?? null) : null;

    // Confidence bands: [low, high] tuple range on a single non-stacked Area.
    // NOT a stacked base+spread pair — Recharts' stack accumulator hardcodes
    // null contributions to 0 regardless of connectNulls, which collapsed an
    // all-null forecast quarter (e.g. a fresh rolling placeholder) down to the
    // zero baseline instead of leaving a genuine gap. A tuple range doesn't
    // stack, so a null point is skipped entirely.
    let supplyBand: [number, number] | null = null;
    let demandBand: [number, number] | null = null;

    const MIN_BAND = 5;
    if (isAnchor) {
      // Zero-width anchor so the band starts pinned to the actual line
      if (supplyForecastVal != null) supplyBand = [supplyForecastVal, supplyForecastVal];
      if (demandForecastVal != null) demandBand = [demandForecastVal, demandForecastVal];
    } else if (isForecastQ && supplyForecastVal != null) {
      const bw = Math.max(MIN_BAND, bandWidth(supplyForecastVal, conf, quartersOut));
      supplyBand = [supplyForecastVal - bw, supplyForecastVal + bw];
    }
    if (isForecastQ && demandForecastVal != null) {
      const bw = Math.max(MIN_BAND, bandWidth(demandForecastVal, conf, quartersOut));
      demandBand = [demandForecastVal - bw, demandForecastVal + bw];
    }

    // Momentum forecast values (as variables for band reuse)
    const supplyForecastMomVal: number | null = (() => {
      if (isAnchor) return data.supplyByQuarter[q]?.leading ?? null;
      if (!isForecastQ) return null;
      const fsi = data.forecastSupplyIndex?.[q];
      return fsi != null ? Math.round((fsi + baseLeadingSupply) * 10) / 10 : null;
    })();
    const demandForecastMomVal: number | null = (() => {
      if (isAnchor) return data.demandByQuarter[q] ?? null;
      if (!isForecastQ) return null;
      const fdi = data.forecastDemandIndex?.[q];
      const priorQ = quarterAdd(q, -4); // same quarter, prior year
      const priorIdx = data.demandIndexByQuarter?.[priorQ] ?? null;
      if (fdi == null || priorIdx == null || priorIdx === 0) return null;
      return Math.round((fdi / priorIdx - 1) * 1000) / 10;
    })();
    const timeMult = quartersOut === 1 ? 1.0 : 1.6;
    const supplyMomBw = (!isForecastQ || isAnchor || supplyForecastMomVal == null)
      ? 0 : Math.max(MIN_BAND, Math.abs(supplyForecastMomVal) * (1 - conf) * 0.3 * timeMult);
    const demandMomBw = (!isForecastQ || isAnchor || demandForecastMomVal == null)
      ? 0 : Math.max(MIN_BAND, Math.abs(demandForecastMomVal) * (1 - conf) * 0.3 * timeMult);
    const supplyBandMom: [number, number] | null = (isForecastQ || isAnchor) && supplyForecastMomVal != null
      ? [supplyForecastMomVal - supplyMomBw, supplyForecastMomVal + supplyMomBw] : null;
    const demandBandMom: [number, number] | null = (isForecastQ || isAnchor) && demandForecastMomVal != null
      ? [demandForecastMomVal - demandMomBw, demandForecastMomVal + demandMomBw] : null;

    return {
      quarter: q,
      qi,
      // Gap view actuals (null for forecast quarters)
      supplyIndex: isForecastQ ? null : (data.supplyIndexByQuarter?.[q] ?? null),
      demand: isForecastQ ? null : (demandNormByQuarter[q] ?? null),
      // Gap view forecast (null except anchor + forecast quarters)
      supplyForecast: supplyForecastVal,
      demandForecast: demandForecastVal,
      // Confidence bands
      supplyBand,
      demandBand,
      // Momentum view actuals
      leadingSupply: isForecastQ ? null : (data.supplyByQuarter[q]?.leading ?? null),
      trailingSupply: isForecastQ ? null : (data.supplyByQuarter[q]?.trailing ?? null),
      demandYoY: isForecastQ ? null : (data.demandByQuarter[q] ?? null),
      // Momentum view forecast (anchor at LAST_ACTUAL, then dotted into forecast quarters)
      supplyForecastMom: supplyForecastMomVal,
      demandForecastMom: demandForecastMomVal,
      // Momentum confidence bands (same formula, momentum scale)
      supplyBandMom,
      demandBandMom,
      // Shared overlays
      inventoryDays: data.inventoryByQuarter?.[q] ?? null,
      tfPrice: data.tfPricingByQuarter?.[q] ?? null,
      aiUrgency: normalizeScore(data.urgencyByQuarter?.[q] ?? null),
      storageHunger: normalizeScore(data.storageByQuarter?.[q] ?? null),
    };
  });

  const gapQ = hoveredQuarter ?? latestQ;

  // Merged supply/demand for gap bar — includes both actuals and forecast
  const mergedSupplyForGap: Record<string, number | null> = {
    ...data.supplyIndexByQuarter,
    ...data.forecastSupplyIndex,
  };
  const mergedDemandForGap: Record<string, number | null> = {
    ...demandNormByQuarter,
    ...forecastDemandNorm,
  };
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
    chartTitle: { fontSize: 14, fontWeight: 700, color: '#c9a84c', marginBottom: 2, fontFamily: inter.style.fontFamily },
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
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 3" opacity={0.75} /></svg>
                Supply projected
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <div style={{ ...S.legDot, background: '#4a7fa5' }} />
                Demand (index)
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#4a7fa5" strokeWidth="1.5" strokeDasharray="5 3" opacity={0.75} /></svg>
                Demand projected
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
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 3" opacity={0.75} /></svg>
                Supply projected
              </div>
              <div style={S.legItem as React.CSSProperties}>
                <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#4a7fa5" strokeWidth="1.5" strokeDasharray="5 3" opacity={0.75} /></svg>
                Demand projected
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
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                onMouseMove={(e) => { if (e.activeLabel) setHoveredQuarter(e.activeLabel as string); }}
                onMouseLeave={() => setHoveredQuarter(null)}
              >
                <defs></defs>
                <CartesianGrid stroke="#1a1812" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="quarter"
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                  tick={((props: any) => (
                    <text x={props.x} y={props.y + 10} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fill={data.forecastMeta?.[props.payload?.value] ? '#7a6a40' : '#6a6050'}>
                      {props.payload?.value}
                    </text>
                  )) as any}
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
                  content={<ChartTooltip narratives={data.narratives ?? {}} narrativesMom={data.narrativesMom ?? {}} narrativesForecast={data.narrativesForecast ?? {}} narrativesForecastMom={data.narrativesForecastMom ?? {}} chartView={chartView} forecastMeta={data.forecastMeta ?? {}} />}
                  wrapperStyle={{ pointerEvents: 'auto' }}
                />
                {/* Current-quarter marker — context only, subordinate to the gap scrubber below */}
                <ReferenceLine
                  yAxisId="y"
                  x={currentQuarter}
                  stroke="#4a4030"
                  strokeDasharray="2 2"
                  strokeOpacity={0.6}
                  label={{ value: `Current: ${currentQuarter}`, position: 'insideTopLeft', fill: '#4a4030', fontSize: 8 }}
                />
                {/* Confidence bands — rendered before lines so lines sit on top.
                    [low, high] tuple range on a single non-stacked Area — NOT a
                    stacked base+spread pair, which collapses a null (all-null
                    forecast) quarter down to the zero baseline regardless of
                    connectNulls. See lib note in chartData above. */}
                {chartView === 'gap' && (
                  <>
                    <Area dataKey="supplyBand" yAxisId="y" stroke="none" fill="rgba(201,168,76,0.20)" legendType="none" tooltipType="none" dot={false} activeDot={false} connectNulls />
                    <Area dataKey="demandBand" yAxisId="y" stroke="none" fill="rgba(74,127,165,0.25)" legendType="none" tooltipType="none" dot={false} activeDot={false} connectNulls />
                  </>
                )}
                {chartView === 'mom' && (
                  <>
                    <Area dataKey="supplyBandMom" yAxisId="y" stroke="none" fill="rgba(201,168,76,0.20)" legendType="none" tooltipType="none" dot={false} activeDot={false} connectNulls />
                    <Area dataKey="demandBandMom" yAxisId="y" stroke="none" fill="rgba(74,127,165,0.25)" legendType="none" tooltipType="none" dot={false} activeDot={false} connectNulls />
                  </>
                )}
                {chartView === 'gap' ? (
                  <>
                    <Line
                      dataKey="supplyIndex" name="supplyIndex" yAxisId="y"
                      stroke="#c9a84c" strokeWidth={2}
                      dot={false} activeDot={{ r: 4, fill: '#c9a84c' }}
                      connectNulls={false}
                    />
                    <Line
                      dataKey="supplyForecast" name="supplyForecast" yAxisId="y"
                      stroke="#c9a84c" strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75}
                      dot={(props: { cx?: number; cy?: number; payload?: { quarter?: string; supplyForecast?: number | null } }) => {
                        if (!props.payload?.quarter || !data.forecastMeta?.[props.payload.quarter] || props.payload.supplyForecast == null) return <g key="empty" />;
                        return <circle key={props.payload.quarter} cx={props.cx} cy={props.cy} r={3} fill="#c9a84c" opacity={0.75} />;
                      }}
                      activeDot={{ r: 4, fill: '#c9a84c' }}
                      connectNulls
                    />
                    <Line
                      dataKey="demand" name="demand" yAxisId="y"
                      stroke="#4a7fa5" strokeWidth={2}
                      dot={false} activeDot={{ r: 4, fill: '#4a7fa5' }}
                      connectNulls={false}
                    />
                    <Line
                      dataKey="demandForecast" name="demandForecast" yAxisId="y"
                      stroke="#4a7fa5" strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75}
                      dot={(props: { cx?: number; cy?: number; payload?: { quarter?: string; demandForecast?: number | null } }) => {
                        if (!props.payload?.quarter || !data.forecastMeta?.[props.payload.quarter] || props.payload.demandForecast == null) return <g key="empty" />;
                        return <circle key={props.payload.quarter} cx={props.cx} cy={props.cy} r={3} fill="#4a7fa5" opacity={0.75} />;
                      }}
                      activeDot={{ r: 4, fill: '#4a7fa5' }}
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
                    <Line
                      dataKey="supplyForecastMom" name="supplyForecast" yAxisId="y"
                      stroke="#c9a84c" strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75}
                      dot={false} activeDot={{ r: 4, fill: '#c9a84c' }}
                      connectNulls
                    />
                    <Line
                      dataKey="demandForecastMom" name="demandForecast" yAxisId="y"
                      stroke="#4a7fa5" strokeWidth={2} strokeDasharray="5 3" strokeOpacity={0.75}
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
                    dot={(props: { cx?: number; cy?: number; payload?: { quarter?: string } }) => {
                      const { cx, cy, payload: dp } = props;
                      if (!cx || !cy) return <g key={dp?.quarter ?? 'tf'} />;
                      const isForecast = dp?.quarter === 'Q2 2026';
                      return (
                        <circle
                          key={dp?.quarter ?? 'tf'}
                          cx={cx} cy={cy} r={3}
                          fill={isForecast ? 'transparent' : '#5dcaa5'}
                          stroke="#5dcaa5"
                          strokeWidth={isForecast ? 1.5 : 0}
                          strokeDasharray={isForecast ? '3 2' : undefined}
                          opacity={isForecast ? 0.6 : 1}
                        />
                      );
                    }}
                    activeDot={{ r: 3, fill: '#5dcaa5' }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {/* Vertical divider: actuals / projected */}
            <div style={{ position: 'absolute', top: 10, right: 20, bottom: 0, pointerEvents: 'none',
                          width: `${(forecastQuarters.length / allChartQuarters.length) * 100}%`, left: `${(quarters.length / allChartQuarters.length) * 100}%`,
                          borderLeft: '1px dashed #2a2518', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#4a4030', letterSpacing: '0.06em', paddingLeft: 4, paddingRight: 4, transform: 'translateX(-50%)' }}>
                <span style={{ paddingRight: 6 }}>actuals</span>
                <span style={{ paddingLeft: 6 }}>projected</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </div>

      {/* ── Gap bar ──────────────────────────────────────────────────────── */}
      <GapBar supplyLeadingByQuarter={mergedSupplyForGap} demandByQuarter={mergedDemandForGap} gapQ={gapQ} forecastMeta={data.forecastMeta ?? {}} />

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
