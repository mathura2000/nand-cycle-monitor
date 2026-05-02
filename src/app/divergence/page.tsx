'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { analystSources, currentRun } from '@/lib/mockData';
import { deltaColor, formatDelta } from '@/lib/scoring';

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

// ─── DELTA BAR ────────────────────────────────────────────────────────────────

function DeltaBar({ delta, max = 25 }: { delta: number; max?: number }) {
  const pct = Math.min(Math.abs(delta) / max, 1) * 100;
  const isPositive = delta > 0;
  return (
    <div className="flex items-center gap-2" style={{ height: 20 }}>
      {/* Negative side */}
      <div className="flex justify-end" style={{ width: '50%' }}>
        {!isPositive && (
          <div
            className="rounded-sm"
            style={{
              width: `${pct}%`,
              height: 10,
              backgroundColor: '#ef4444',
              opacity: 0.7,
            }}
          />
        )}
      </div>
      {/* Center line */}
      <div style={{ width: 1, height: 16, backgroundColor: 'var(--border)', flexShrink: 0 }} />
      {/* Positive side */}
      <div style={{ width: '50%' }}>
        {isPositive && (
          <div
            className="rounded-sm"
            style={{
              width: `${pct}%`,
              height: 10,
              backgroundColor: '#10b981',
              opacity: 0.7,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── ANALYST CARD ─────────────────────────────────────────────────────────────

function AnalystCard({ source }: { source: typeof analystSources[0] }) {
  const mounted = useMounted();
  const isAlert = Math.abs(source.delta) > 15;
  const historyData = source.history.map(h => ({
    quarter: h.quarter.replace(' 20', "'"),
    delta: h.delta,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value;
    return (
      <div className="rounded px-2 py-1" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10 }}>
        <p style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="tabular" style={{ color: val > 0 ? '#10b981' : val < 0 ? '#ef4444' : '#94a3b8' }}>
          {val > 0 ? '+' : ''}{val}
        </p>
      </div>
    );
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${isAlert ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {source.name}
            </span>
            {isAlert && (
              <span
                className="text-xs px-1.5 py-px rounded"
                style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                Review
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{source.firm}</p>
        </div>
        <div className="text-right">
          <p className={`tabular text-xl font-bold ${source.delta > 0 ? 'text-emerald-400' : source.delta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {source.delta > 0 ? '+' : ''}{source.delta}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>analyst delta</p>
        </div>
      </div>

      {/* Gap bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>← More bearish than data</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>More bullish than data →</span>
        </div>
        <DeltaBar delta={source.delta} />
      </div>

      {/* Cycle call */}
      <div
        className="rounded-lg p-3"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Cycle call</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{source.cyclecall}</p>
      </div>

      {/* Supply / demand estimates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Supply</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{source.supplyEstimate}</p>
        </div>
        <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Demand</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{source.demandEstimate}</p>
        </div>
      </div>

      {/* Delta history sparkline */}
      <div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Delta trend — 8 quarters</p>
        <div style={{ height: 56 }}>
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historyData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barSize={12}>
                <ReferenceLine y={0} stroke="var(--border)" />
                <XAxis dataKey="quarter" tick={{ fontSize: 8, fill: 'var(--text-muted)' } as any} axisLine={false} tickLine={false} />
                <YAxis hide domain={[-25, 25]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="delta" radius={[2, 2, 0, 0]}>
                  {historyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.delta > 0 ? '#10b981' : entry.delta < 0 ? '#ef4444' : '#94a3b8'}
                      fillOpacity={i === historyData.length - 1 ? 0.9 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 56, backgroundColor: 'var(--bg-card)', borderRadius: 6 }} />
          )}
        </div>
      </div>

      {/* Latest quotes */}
      {source.quotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>LATEST QUOTES</p>
          {source.quotes.slice(0, 2).map((q, i) => (
            <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              "{q.text}"
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUMMARY BAR ──────────────────────────────────────────────────────────────

function SummaryStrip() {
  const avgDelta = Math.round(analystSources.reduce((s, a) => s + a.delta, 0) / analystSources.length);
  const alertCount = analystSources.filter(a => Math.abs(a.delta) > 15).length;
  const allBearish = analystSources.every(a => a.delta < 0);

  return (
    <div
      className="rounded-xl p-4 flex items-center gap-6"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Avg Analyst Delta</p>
        <p className={`tabular text-2xl font-bold ${avgDelta > 0 ? 'text-emerald-400' : avgDelta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
          {avgDelta > 0 ? '+' : ''}{avgDelta}
        </p>
      </div>

      <div style={{ width: 1, height: 40, backgroundColor: 'var(--border)' }} />

      <div className="flex flex-col gap-0.5">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Analysts vs Hard Data</p>
        <p className="text-sm" style={{ color: allBearish ? '#f59e0b' : 'var(--text-secondary)' }}>
          {allBearish ? 'All analysts more bearish than data' : 'Mixed — some more bullish than data'}
        </p>
      </div>

      <div style={{ width: 1, height: 40, backgroundColor: 'var(--border)' }} />

      <div className="flex flex-col gap-0.5">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Review Flags</p>
        <p className="tabular text-2xl font-bold" style={{ color: alertCount > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
          {alertCount}/{analystSources.length}
        </p>
      </div>

      <div style={{ width: 1, height: 40, backgroundColor: 'var(--border)' }} />

      <div className="flex flex-col gap-0.5 flex-1">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Cycle Score vs Analyst Composite</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#6366f1' }} />
            <span className="tabular text-sm" style={{ color: 'var(--text-primary)' }}>Hard data: {currentRun.cycleScore}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
            <span className="tabular text-sm" style={{ color: 'var(--text-primary)' }}>
              Analyst implied: {currentRun.cycleScore + avgDelta}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function DivergencePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Divergence</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Analyst consensus vs hard data composite — delta tracked over 8 quarters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Threshold ±15 → review flag
          </span>
          <Link href="/" className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            ← Regime
          </Link>
        </div>
      </div>

      <SummaryStrip />

      <div className="grid grid-cols-2 gap-4">
        {analystSources.map(source => (
          <AnalystCard key={source.id} source={source} />
        ))}
      </div>
    </div>
  );
}