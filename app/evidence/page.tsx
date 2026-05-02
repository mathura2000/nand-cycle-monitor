'use client';

import { useState } from 'react';
import Link from 'next/link';
import { companies } from '@/lib/mockData';
import type { Company, Signal, SignalScore } from '@/lib/mockData';
import {
  signalScoreColor,
  signalScoreBadge,
  signalScoreArrow,
  signalScoreRawColor,
  daysSince,
  freshnessStatus,
  freshnessColor,
} from '@/lib/scoring';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type FilterScore = 'all' | SignalScore;
type FilterCategory = 'all' | Signal['category'];

// ─── EVIDENCE ROW ─────────────────────────────────────────────────────────────

function EvidenceRow({
  company,
  signal,
  isLast,
}: {
  company: Company;
  signal: Signal;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = signal.history[signal.history.length - 1];
  if (!latest) return null;

  const prior = signal.history[signal.history.length - 2];
  const changed = prior && latest.score !== prior.score;

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        className="cursor-pointer transition-colors"
        style={{
          borderBottom: isLast && !expanded ? 'none' : '1px solid var(--border-subtle)',
          backgroundColor: expanded ? 'var(--bg-card-hover)' : 'transparent',
        }}
      >
        {/* Company */}
        <td className="py-2.5 pr-3" style={{ width: 80 }}>
          <div className="flex items-center gap-1.5">
            {company.isPrimary && (
              <div className="w-0.5 h-4 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
            )}
            <span className="tabular text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {company.ticker}
            </span>
          </div>
        </td>

        {/* Signal name */}
        <td className="py-2.5 pr-3" style={{ width: 200 }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{signal.name}</span>
            <span
              className="text-xs capitalize px-1.5 py-px rounded inline-block"
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                fontSize: 9,
                width: 'fit-content',
              }}
            >
              {signal.category}
            </span>
          </div>
        </td>

        {/* Score */}
        <td className="py-2.5 pr-3" style={{ width: 80 }}>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full tabular ${signalScoreBadge(latest.score)}`}>
              {signalScoreArrow(latest.score)} {latest.score}
            </span>
            {changed && (
              <span className="text-xs" style={{ color: '#f59e0b' }}>●</span>
            )}
          </div>
        </td>

        {/* Value */}
        <td className="py-2.5 pr-3 tabular" style={{ width: 80 }}>
          <span className={`text-sm font-medium ${signalScoreColor(latest.score)}`}>
            {latest.value !== null ? `${latest.value}${signal.unit}` : '—'}
          </span>
        </td>

        {/* Weight */}
        <td className="py-2.5 pr-3" style={{ width: 48 }}>
          <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>w:{signal.weight}</span>
        </td>

        {/* Quote preview */}
        <td className="py-2.5 pr-3">
          {signal.quote ? (
            <p className="text-xs line-clamp-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              "{signal.quote}"
            </p>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--border)' }}>No extraction</span>
          )}
        </td>

        {/* Expand toggle */}
        <td className="py-2.5 text-right" style={{ width: 24 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)' }}>
          <td colSpan={7} className="pb-4 pt-1 pr-4" style={{ paddingLeft: 24 }}>
            <div className="flex flex-col gap-3">
              {/* Full quote */}
              {signal.quote ? (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <p className="text-xs uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    Extracted Quote — {latest.quarter}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    "{signal.quote}"
                  </p>
                  {signal.transcriptUrl && (
                    <a
                      href={signal.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs mt-2 inline-block"
                      style={{ color: 'var(--accent-sndk)' }}
                    >
                      View transcript →
                    </a>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    No quote extracted for this signal. Run ingest to pull latest transcript data.
                  </p>
                </div>
              )}

              {/* 8Q history */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>History:</span>
                {signal.history.map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div
                      className="rounded-sm"
                      style={{
                        width: 20,
                        height: 12,
                        backgroundColor: h.score === 'bullish'
                          ? 'rgba(16,185,129,0.35)'
                          : h.score === 'neutral'
                          ? 'rgba(148,163,184,0.2)'
                          : 'rgba(239,68,68,0.35)',
                        border: `1px solid ${h.score === 'bullish'
                          ? 'rgba(16,185,129,0.5)'
                          : h.score === 'neutral'
                          ? 'rgba(148,163,184,0.25)'
                          : 'rgba(239,68,68,0.5)'}`,
                      }}
                      title={`${h.quarter}: ${h.score} (${h.value}${signal.unit})`}
                    />
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                      {h.quarter.replace(' 20', "'").replace('Q', '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── COMPANY SECTION ──────────────────────────────────────────────────────────

function CompanySection({
  company,
  filterScore,
  filterCategory,
}: {
  company: Company;
  filterScore: FilterScore;
  filterCategory: FilterCategory;
}) {
  const filtered = company.signals.filter(s => {
    const latest = s.history[s.history.length - 1];
    if (!latest) return false;
    if (filterScore !== 'all' && latest.score !== filterScore) return false;
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  const days = daysSince(company.lastIngested);
  const freshStatus = freshnessStatus(company.lastIngested);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Company header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          {company.isPrimary && (
            <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
          )}
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {company.name}
          </span>
          <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>{company.ticker}</span>
          <span
            className="text-xs capitalize px-1.5 py-px rounded"
            style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontSize: 10 }}
          >
            {company.role}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">{company.bullishCount}↑</span>
          <span className="text-xs text-slate-400">{company.neutralCount}→</span>
          <span className="text-xs text-red-400">{company.bearishCount}↓</span>
          <span className={`tabular text-xs ${freshnessColor(freshStatus)}`}>{days}d ago</span>
        </div>
      </div>

      {/* Signal table */}
      <div className="px-4">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {filtered.map((signal, i) => (
              <EvidenceRow
                key={signal.id}
                company={company}
                signal={signal}
                isLast={i === filtered.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function EvidencePage() {
  const [filterScore, setFilterScore] = useState<FilterScore>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'vendor' | 'hyperscaler'>('all');

  const displayed = companies.filter(c =>
    filterRole === 'all' ? true : c.role === filterRole
  );

  const totalSignals = displayed.reduce((sum, c) => sum + c.signals.length, 0);
  const withQuotes = displayed.reduce(
    (sum, c) => sum + c.signals.filter(s => s.quote).length, 0
  );

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Evidence</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Transcript audit — extracted quotes per signal · click any row to expand
          </p>
        </div>
        <Link href="/" className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          ← Regime
        </Link>
      </div>

      {/* Filter bar */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Coverage stat */}
        <div className="flex items-center gap-1.5 mr-2">
          <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {withQuotes}/{totalSignals}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>signals have quotes</span>
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        {/* Role filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Role:</span>
          {(['all', 'vendor', 'hyperscaler'] as const).map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className="text-xs px-2 py-0.5 rounded capitalize"
              style={{
                backgroundColor: filterRole === r ? 'var(--bg-card-hover)' : 'transparent',
                color: filterRole === r ? 'var(--text-primary)' : 'var(--text-muted)',
                border: filterRole === r ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        {/* Score filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Score:</span>
          {(['all', 'bullish', 'neutral', 'bearish'] as FilterScore[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterScore(s)}
              className="text-xs px-2 py-0.5 rounded capitalize"
              style={{
                backgroundColor: filterScore === s ? 'var(--bg-card-hover)' : 'transparent',
                color: filterScore === s
                  ? s === 'bullish' ? '#10b981' : s === 'bearish' ? '#ef4444' : s === 'neutral' ? '#94a3b8' : 'var(--text-primary)'
                  : 'var(--text-muted)',
                border: filterScore === s ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, backgroundColor: 'var(--border)' }} />

        {/* Category filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Category:</span>
          {(['all', 'supply', 'pricing', 'demand', 'qualitative'] as FilterCategory[]).map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className="text-xs px-2 py-0.5 rounded capitalize"
              style={{
                backgroundColor: filterCategory === c ? 'var(--bg-card-hover)' : 'transparent',
                color: filterCategory === c ? 'var(--text-primary)' : 'var(--text-muted)',
                border: filterCategory === c ? '1px solid var(--border)' : '1px solid transparent',
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Company sections */}
      <div className="flex flex-col gap-3">
        {displayed.map(company => (
          <CompanySection
            key={company.id}
            company={company}
            filterScore={filterScore}
            filterCategory={filterCategory}
          />
        ))}
      </div>

    </div>
  );
}