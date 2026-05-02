'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { companies } from '@/lib/mockData';
import type { Company, Signal, SignalScore } from '@/lib/mockData';
import {
  signalScoreColor,
  signalScoreBadge,
  signalScoreArrow,
  signalScoreRawColor,
  cyclePositionBorderColor,
  scoreToCyclePosition,
  deltaColor,
  formatDelta,
  daysSince,
  freshnessStatus,
  freshnessColor,
  sparklineData,
} from '@/lib/scoring';

// ─── MINI SPARKLINE ────────────────────────────────────────────────────────────

function SignalSparkline({ signal }: { signal: Signal }) {
  const data = sparklineData(signal, 8);
  const hasNumeric = data.some(d => d.value !== null && typeof d.value === 'number');

  if (!hasNumeric) {
    // Qualitative signal — show score dots only
    return (
      <div className="flex items-center gap-0.5 h-8">
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.quarter}: ${d.score}`}
            className="rounded-sm flex-1"
            style={{
              height: d.score === 'bullish' ? 20 : d.score === 'neutral' ? 12 : 6,
              backgroundColor: signalScoreRawColor(d.score as SignalScore),
              opacity: i === data.length - 1 ? 1 : 0.5,
              minWidth: 6,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ height: 32, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (!payload.value) return <g key={props.key} />;
              return (
                <circle
                  key={props.key}
                  cx={cx}
                  cy={cy}
                  r={2}
                  fill={signalScoreRawColor(payload.score as SignalScore)}
                  stroke="none"
                />
              );
            }}
            activeDot={false}
            stroke="#475569"
            strokeWidth={1}
            connectNulls
          />
          <ReferenceLine y={0} stroke="#1e2738" strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SIGNAL ROW ────────────────────────────────────────────────────────────────

function SignalRow({ signal, isLast }: { signal: Signal; isLast: boolean }) {
  const latest = signal.history[signal.history.length - 1];
  const prior = signal.history[signal.history.length - 2];
  const changed = latest && prior && latest.score !== prior.score;

  return (
    <div
      className="grid items-center gap-3 py-3"
      style={{
        gridTemplateColumns: '200px 56px 140px 1fr auto',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
      }}
    >
      {/* Signal name + category */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {signal.name}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs capitalize px-1.5 py-px rounded"
            style={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              fontSize: 10,
            }}
          >
            {signal.category}
          </span>
          <span className="text-xs tabular" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            w:{signal.weight}
          </span>
        </div>
      </div>

      {/* Current score badge */}
      <div className="flex items-center">
        {latest && (
          <span className={`text-xs px-2 py-0.5 rounded-full tabular ${signalScoreBadge(latest.score)}`}>
            {signalScoreArrow(latest.score)}
          </span>
        )}
      </div>

      {/* Latest value */}
      <div className="flex flex-col gap-0.5">
        {latest && (
          <>
            <span className={`tabular text-sm font-medium ${signalScoreColor(latest.score)}`}>
              {latest.value !== null ? `${latest.value}${signal.unit}` : '—'}
            </span>
            {changed && prior && (
              <span className="tabular" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                was {prior.score}
                <span className="ml-1" style={{ color: changed ? '#f59e0b' : 'var(--text-muted)' }}>●</span>
              </span>
            )}
          </>
        )}
      </div>

      {/* Sparkline */}
      <SignalSparkline signal={signal} />

      {/* Quote snippet */}
      <div className="w-48 min-w-0">
        {signal.quote ? (
          <p
            className="text-xs leading-relaxed line-clamp-2"
            style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
          >
            "{signal.quote}"
          </p>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--border)' }}>No quote</span>
        )}
      </div>
    </div>
  );
}

// ─── COMPANY CARD ──────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  isSelected,
  onSelect,
}: {
  company: Company;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const freshStatus = freshnessStatus(company.lastIngested);
  const freshColor = freshnessColor(freshStatus);
  const days = daysSince(company.lastIngested);
  const position = scoreToCyclePosition(company.compositeScore);

  return (
    <button
      onClick={onSelect}
      className="rounded-lg p-3 flex flex-col gap-2 text-left transition-colors w-full"
      style={{
        backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${isSelected ? cyclePositionBorderColor(position) : 'var(--border)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {company.isPrimary && (
            <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
          )}
          <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>
            {company.ticker}
          </span>
        </div>
        <span
          className={`tabular text-xs ${freshColor}`}
          title={`Last ingested ${days}d ago`}
        >
          {days}d
        </span>
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1.5">
        <span className="tabular text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {company.compositeScore}
        </span>
        <span className={`tabular text-xs ${deltaColor(company.compositeDelta)}`}>
          {formatDelta(company.compositeDelta)}
        </span>
      </div>

      {/* Signal counts */}
      <div className="flex gap-1.5">
        <span className="tabular text-xs text-emerald-400">{company.bullishCount}↑</span>
        <span className="tabular text-xs text-slate-400">{company.neutralCount}→</span>
        <span className="tabular text-xs text-red-400">{company.bearishCount}↓</span>
      </div>

      {/* Score bar */}
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'var(--border)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${company.compositeScore}%`,
            backgroundColor: cyclePositionBorderColor(position).replace('0.4', '1'),
          }}
        />
      </div>
    </button>
  );
}

// ─── HISTORY QUARTER HEATMAP ───────────────────────────────────────────────────

function SignalHistoryHeatmap({ company }: { company: Company }) {
  const quarters = company.signals[0]?.history.map(h => h.quarter) ?? [];

  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
        Signal History — 8 Quarters
      </p>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th className="text-left pb-2 pr-3" style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, width: 160 }}>
                Signal
              </th>
              {quarters.map(q => (
                <th key={q} className="pb-2 text-center tabular" style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {q.replace(' 20', "'")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {company.signals.map((signal, si) => (
              <tr key={signal.id}>
                <td className="pr-3 py-1" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span className="truncate block" style={{ maxWidth: 155 }} title={signal.name}>
                    {signal.name}
                  </span>
                </td>
                {signal.history.map((h, qi) => (
                  <td key={qi} className="py-1 text-center">
                    <div
                      className="mx-auto rounded-sm"
                      style={{
                        width: 20,
                        height: 14,
                        backgroundColor: h.score === 'bullish'
                          ? 'rgba(16,185,129,0.3)'
                          : h.score === 'neutral'
                          ? 'rgba(148,163,184,0.15)'
                          : 'rgba(239,68,68,0.3)',
                        border: `1px solid ${h.score === 'bullish'
                          ? 'rgba(16,185,129,0.5)'
                          : h.score === 'neutral'
                          ? 'rgba(148,163,184,0.2)'
                          : 'rgba(239,68,68,0.5)'}`,
                      }}
                      title={`${h.quarter}: ${h.score} (${h.value !== null ? h.value : '—'}${signal.unit})`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── COMPANY DETAIL PANEL ─────────────────────────────────────────────────────

function CompanyDetailPanel({ company }: { company: Company }) {
  const position = scoreToCyclePosition(company.compositeScore);
  const days = daysSince(company.lastIngested);
  const freshStatus = freshnessStatus(company.lastIngested);

  return (
    <div className="flex flex-col gap-4">
      {/* Company header */}
      <div
        className="rounded-xl p-4 flex items-start justify-between"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {company.isPrimary && (
              <div className="w-1 h-5 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
            )}
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {company.name}
            </h2>
            <span className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
              {company.ticker}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded capitalize"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {company.role}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="tabular text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {company.compositeScore}
            </span>
            <span className={`tabular text-sm ${deltaColor(company.compositeDelta)}`}>
              {formatDelta(company.compositeDelta)} vs prior
            </span>
          </div>
        </div>

        {/* Freshness + signal summary */}
        <div className="flex flex-col items-end gap-2">
          <span className={`tabular text-xs ${freshnessColor(freshStatus)}`}>
            Ingested {days}d ago
          </span>
          <div className="flex gap-2">
            <span className="tabular text-xs text-emerald-400">{company.bullishCount} bullish</span>
            <span className="tabular text-xs text-slate-400">{company.neutralCount} neutral</span>
            <span className="tabular text-xs text-red-400">{company.bearishCount} bearish</span>
          </div>
        </div>
      </div>

      {/* Signal rows */}
      <div
        className="rounded-xl px-5"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="grid py-2 gap-3" style={{ gridTemplateColumns: '200px 56px 140px 1fr auto' }}>
          <span className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Signal</span>
          <span className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Score</span>
          <span className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Latest</span>
          <span className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>8Q Trend</span>
          <span className="text-xs uppercase w-48" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Evidence</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {company.signals.map((signal, i) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              isLast={i === company.signals.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <SignalHistoryHeatmap company={company} />
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function ForensicsPage() {
  const vendors = companies.filter(c => c.role === 'vendor');
  const hyperscalers = companies.filter(c => c.role === 'hyperscaler');

  const [selectedId, setSelectedId] = useState<string>(companies[0].id);
  const selectedCompany = companies.find(c => c.id === selectedId) ?? companies[0];

  return (
    <div className="flex flex-col gap-4">

      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Forensics
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Per-company signal drilldown — click any card to expand
          </p>
        </div>
        <Link
          href="/"
          className="text-xs px-2 py-0.5 rounded"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          ← Regime
        </Link>
      </div>

      {/* ── COMPANY SELECTOR STRIP ────────────────────────────────────── */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Vendors */}
        <div className="mb-3">
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            Vendors — 50% weight
          </p>
          <div className="grid grid-cols-4 gap-2">
            {vendors.map(c => (
              <CompanyCard
                key={c.id}
                company={c}
                isSelected={selectedId === c.id}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 12 }} />

        {/* Hyperscalers */}
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            Hyperscalers — 35% weight
          </p>
          <div className="grid grid-cols-4 gap-2">
            {hyperscalers.map(c => (
              <CompanyCard
                key={c.id}
                company={c}
                isSelected={selectedId === c.id}
                onSelect={() => setSelectedId(c.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── DETAIL PANEL ──────────────────────────────────────────────── */}
      <CompanyDetailPanel company={selectedCompany} />

    </div>
  );
}
