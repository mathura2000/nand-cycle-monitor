'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
  LineChart,
} from 'recharts';
import { companies, cycleRuns } from '@/lib/mockData';
import type { Company, Signal, SignalScore } from '@/lib/mockData';
import {
  signalScoreRawColor,
  cycleScoreBarColor,
  scoreToCyclePosition,
  cyclePositionColor,
  deltaColor,
  formatDelta,
  sparklineData,
  CYCLE_THRESHOLDS,
} from '@/lib/scoring';

// ─── CYCLE SCORE CHART ─────────────────────────────────────────────────────────

function CycleScoreChart() {
  const data = cycleRuns.map(r => ({
    quarter: r.quarter.replace(' 20', "'"),
    score: r.cycleScore,
    position: r.cyclePosition,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const score = payload[0]?.value;
    return (
      <div
        className="rounded-lg px-3 py-2"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11 }}
      >
        <p style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="tabular font-medium" style={{ color: cycleScoreBarColor(score) }}>
          Score: {score}
        </p>
        <p style={{ color: 'var(--text-muted)' }}>{scoreToCyclePosition(score)}</p>
      </div>
    );
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            Composite Cycle Score — 8 Quarters
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Regime bands shaded — threshold lines at 30 / 50 / 70
          </p>
        </div>
        {/* Legend */}
        <div className="flex gap-4">
          {[
            { label: 'Deep Expansion', color: '#10b981', range: '70–100' },
            { label: 'Mid Expansion', color: '#14b8a6', range: '50–70' },
            { label: 'Early Warning', color: '#f59e0b', range: '30–50' },
            { label: 'Cycle Turning', color: '#ef4444', range: '0–30' },
          ].map(b => (
            <div key={b.label} className="flex items-center gap-1.5">
              <div className="rounded-sm" style={{ width: 8, height: 8, backgroundColor: b.color, opacity: 0.4 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            {/* Regime band shading */}
            <ReferenceArea y1={70} y2={100} fill="#10b981" fillOpacity={0.06} />
            <ReferenceArea y1={50} y2={70} fill="#14b8a6" fillOpacity={0.06} />
            <ReferenceArea y1={30} y2={50} fill="#f59e0b" fillOpacity={0.06} />
            <ReferenceArea y1={0} y2={30} fill="#ef4444" fillOpacity={0.06} />

            {/* Threshold lines */}
            <ReferenceLine y={70} stroke="#10b981" strokeOpacity={0.3} strokeDasharray="4 3" />
            <ReferenceLine y={50} stroke="#14b8a6" strokeOpacity={0.3} strokeDasharray="4 3" />
            <ReferenceLine y={30} stroke="#f59e0b" strokeOpacity={0.3} strokeDasharray="4 3" />

            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 9, fill: 'var(--text-muted)' } as any}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: 'var(--text-muted)' } as any}
              axisLine={false}
              tickLine={false}
              width={24}
              ticks={[0, 30, 50, 70, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="none"
              fill="url(#scoreGradient)"
              fillOpacity={1}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#6366f1"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                return (
                  <circle
                    key={props.key}
                    cx={cx} cy={cy} r={3}
                    fill={cycleScoreBarColor(payload.score)}
                    stroke="var(--bg-surface)"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── SIGNAL TREND CHART ────────────────────────────────────────────────────────

function SignalTrendChart({ signal, unit }: { signal: Signal; unit: string }) {
  const data = sparklineData(signal, 8).map(d => ({
    ...d,
    quarter: d.quarter.replace(' 20', "'"),
  }));
  const hasNumeric = data.some(d => d.value !== null);
  if (!hasNumeric) return null;

  const allVals = data.map(d => d.value as number).filter(v => v !== null);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const pad = Math.max((max - min) * 0.2, 2);

  return (
    <div style={{ height: 64 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 2" />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#475569"
            strokeWidth={1.5}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload.value === null) return <g key={props.key} />;
              return (
                <circle
                  key={props.key}
                  cx={cx} cy={cy} r={2.5}
                  fill={signalScoreRawColor(payload.score as SignalScore)}
                  stroke="none"
                />
              );
            }}
            activeDot={false}
            connectNulls
          />
          <YAxis domain={[min - pad, max + pad]} hide />
          <XAxis dataKey="quarter" hide />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── COMPANY TREND PANEL ──────────────────────────────────────────────────────

function CompanyTrendPanel({ company }: { company: Company }) {
  // Build per-quarter composite score from signal histories
  const quarters = company.signals[0]?.history.map(h => h.quarter) ?? [];
  const scoreByQuarter = quarters.map((q, qi) => {
    const SCORE_MAP: Record<SignalScore, number> = { bullish: 1, neutral: 0, bearish: -1 };
    const weighted = company.signals.reduce((sum, s) => {
      const h = s.history[qi];
      return sum + (h ? SCORE_MAP[h.score] * s.weight : 0);
    }, 0);
    const maxW = company.signals.reduce((sum, s) => sum + s.weight, 0);
    const normalized = Math.round(((weighted + maxW) / (2 * maxW)) * 100);
    return { quarter: q.replace(' 20', "'"), score: normalized };
  });

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {company.isPrimary && (
            <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
          )}
          <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>
            {company.ticker}
          </span>
          <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
            {company.role}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="tabular text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {company.compositeScore}
          </span>
          <span className={`tabular text-xs ${deltaColor(company.compositeDelta)}`}>
            {formatDelta(company.compositeDelta)}
          </span>
        </div>
      </div>

      {/* Composite score trend */}
      <div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Composite score trend</p>
        <div style={{ height: 56 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scoreByQuarter} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <ReferenceArea y1={70} y2={100} fill="#10b981" fillOpacity={0.05} />
              <ReferenceArea y1={50} y2={70} fill="#14b8a6" fillOpacity={0.05} />
              <ReferenceArea y1={30} y2={50} fill="#f59e0b" fillOpacity={0.05} />
              <ReferenceArea y1={0} y2={30} fill="#ef4444" fillOpacity={0.05} />
              <ReferenceLine y={70} stroke="#10b981" strokeOpacity={0.2} strokeDasharray="3 3" />
              <ReferenceLine y={50} stroke="#14b8a6" strokeOpacity={0.2} strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="score"
                stroke={cycleScoreBarColor(company.compositeScore)}
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
              />
              <YAxis domain={[0, 100]} hide />
              <XAxis
                dataKey="quarter"
                tick={{ fontSize: 8, fill: 'var(--text-muted)' } as any}
                axisLine={false}
                tickLine={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-signal sparklines */}
      <div className="flex flex-col gap-2" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
        {company.signals.map(signal => {
          const latest = signal.history[signal.history.length - 1];
          if (!latest) return null;
          return (
            <div key={signal.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '140px 1fr 48px' }}>
              <span className="text-xs truncate" style={{ color: 'var(--text-muted)', fontSize: 10 }} title={signal.name}>
                {signal.name}
              </span>
              <SignalTrendChart signal={signal} unit={signal.unit} />
              <span
                className="tabular text-xs text-right"
                style={{ color: signalScoreRawColor(latest.score as SignalScore), fontSize: 10 }}
              >
                {latest.value !== null ? `${latest.value}${signal.unit}` : latest.score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VIEW TOGGLE ──────────────────────────────────────────────────────────────

type View = 'overview' | 'vendors' | 'hyperscalers';

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function TrendsPage() {
  const [view, setView] = useState<View>('overview');

  const vendors = companies.filter(c => c.role === 'vendor');
  const hyperscalers = companies.filter(c => c.role === 'hyperscaler');
  const displayed = view === 'vendors' ? vendors : view === 'hyperscalers' ? hyperscalers : companies;

  return (
    <div className="flex flex-col gap-4">

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Trends</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            8-quarter signal trends with regime-band shading
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['overview', 'vendors', 'hyperscalers'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="text-xs px-3 py-1 capitalize transition-colors"
                style={{
                  backgroundColor: view === v ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                  color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderRight: v !== 'hyperscalers' ? '1px solid var(--border)' : 'none',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <Link
            href="/"
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ← Regime
          </Link>
        </div>
      </div>

      {/* ── COMPOSITE CYCLE SCORE CHART ───────────────────────────────── */}
      <CycleScoreChart />

      {/* ── COMPANY SMALL MULTIPLES ───────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {displayed.map(company => (
          <CompanyTrendPanel key={company.id} company={company} />
        ))}
      </div>

    </div>
  );
}