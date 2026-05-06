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
  demandByQuarter: Record<string, number | null>;
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

function GapBar({ leadingSupply, demand }: { leadingSupply: number | null; demand: number | null }) {
  const supplyGrowth = leadingSupply ?? 0;
  const demandGrowth = demand ?? 0;
  const gapDiff = demandGrowth - supplyGrowth; // positive = demand outpacing = safer
  const position = Math.max(5, Math.min(95, 50 + gapDiff * 1.5));

  let statusText = 'No data';
  if (leadingSupply !== null) {
    if (gapDiff > 5) statusText = 'Demand absorbing supply · safe';
    else if (gapDiff > -5) statusText = 'Balanced · monitor';
    else if (gapDiff > -15) statusText = 'Stable · watch supply';
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
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiData | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ signals: [], latestQuarter: '', sourcesCount: 0, supplyByQuarter: {}, demandByQuarter: {} }));
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
    ...Object.keys(data.demandByQuarter),
  ])].sort((a, b) => quarterIndex(a) - quarterIndex(b));

  const chartData = allChartQuarters.map(q => ({
    quarter: q,
    leadingSupply: data.supplyByQuarter[q]?.leading ?? null,
    trailingSupply: data.supplyByQuarter[q]?.trailing ?? null,
    demand: data.demandByQuarter[q] ?? null,
  }));

  const latestLeadingSupply = data.supplyByQuarter[latestQ]?.leading ?? null;
  const latestDemand = data.demandByQuarter[latestQ] ?? null;

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

  // ── Supply signal directions ─────────────────────────────────────────────
  const avgCapex = avg(vendors, 'capex_pct');
  const hasNodeNote = vendors.some(r => r.node_transition_note?.trim());
  const avgInv = avg(vendors, 'inventory_days');
  const avgTone = avg(vendors, 'mgmt_tone_score');
  const avgAsp = avg(vendors, 'asp_change_pct');
  const avgHCapex = avg(hyperscalers, 'capex_pct');
  const avgHTone = avg(hyperscalers, 'mgmt_tone_score');

  const supplySignals: Array<{ name: string; spark: number[]; dir: Dir; color: string }> = [
    { name: 'CapEx trending',   spark: sparkCapex,    dir: capexDir(avgCapex),       color: avgCapex > 25 ? '#c9a84c' : '#3a3528' },
    { name: 'Node transitions', spark: sparkBitGrowth, dir: nodeDir(hasNodeNote),    color: hasNodeNote ? '#c9a84c' : '#3a3528' },
    { name: 'Inventory days',   spark: sparkInv,       dir: invDir(avgInv),          color: avgInv > 80 ? '#c9a84c' : '#3a3528' },
    { name: 'Mgmt tone',        spark: sparkTone,      dir: toneDir(avgTone),        color: avgTone < 2.5 ? '#c9a84c' : '#3a3528' },
    { name: 'ASP trajectory',   spark: sparkAsp,       dir: aspDir(avgAsp),          color: avgAsp > 0 ? '#4a7fa5' : '#c9a84c' },
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
        <div style={S.chartLabel as React.CSSProperties}>Primary signal</div>
        <div style={S.chartTitle as React.CSSProperties}>Supply vs Demand Growth</div>
        <div style={S.chartSub as React.CSSProperties}>
          Leading supply (node transitions + vendor capex) vs hyperscaler CapEx YoY · {quarters.length} quarter{quarters.length !== 1 ? 's' : ''}
        </div>
        <div style={S.legend as React.CSSProperties}>
          <div style={S.legItem as React.CSSProperties}>
            <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="2" /></svg>
            Leading supply (node + capex)
          </div>
          <div style={S.legItem as React.CSSProperties}>
            <svg width="18" height="8" style={{ marginRight: 2 }}><line x1="0" y1="4" x2="18" y2="4" stroke="#c9a84c" strokeWidth="1.5" strokeDasharray="5 4" strokeOpacity="0.6" /></svg>
            Trailing supply (bit growth)
          </div>
          <div style={S.legItem as React.CSSProperties}>
            <div style={{ ...S.legDot, background: '#4a7fa5' }} />
            Demand (hyperscaler CapEx %)
          </div>
        </div>

        {mounted ? (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1a1812" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="quarter"
                tick={{ fill: '#6a6050', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6a6050', fontSize: 9, fontFamily: 'var(--font-sans)' }}
                axisLine={{ stroke: '#2a2820' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 6, fontSize: 11 }}
                labelStyle={{ color: '#7a6e54' }}
                formatter={(v: unknown, name: unknown) => {
                  const labels: Record<string, string> = { leadingSupply: 'Leading supply', trailingSupply: 'Trailing supply', demand: 'Demand' };
                  return [`${Number(v).toFixed(1)}%`, labels[name as string] ?? String(name)];
                }}
              />
              <Line
                dataKey="leadingSupply" name="leadingSupply"
                stroke="#c9a84c" strokeWidth={2}
                dot={false} activeDot={{ r: 4, fill: '#c9a84c' }}
                connectNulls
              />
              <Line
                dataKey="trailingSupply" name="trailingSupply"
                stroke="#c9a84c" strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.6}
                dot={false} activeDot={{ r: 3, fill: '#c9a84c' }}
                connectNulls
              />
              <Line
                dataKey="demand" name="demand"
                stroke="#4a7fa5" strokeWidth={2}
                dot={false} activeDot={{ r: 4, fill: '#4a7fa5' }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 190 }} />
        )}
      </div>

      {/* ── Gap bar ──────────────────────────────────────────────────────── */}
      <GapBar leadingSupply={latestLeadingSupply} demand={latestDemand} />

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
              <span style={S.sigName as React.CSSProperties}>{sig.name}</span>
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
