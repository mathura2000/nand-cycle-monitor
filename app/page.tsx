'use client';

import Link from 'next/link';
import { companies, correlationPairs, cycleRuns, currentRun, priorRun } from '@/lib/mockData';
import {
  scoreToCyclePosition,
  cyclePositionColor,
  cyclePositionBg,
  cyclePositionBorderColor,
  correlationStatusBadge,
  signalScoreColor,
  signalScoreArrow,
  deltaColor,
  formatDelta,
  daysSince,
  freshnessStatus,
  freshnessColor,
} from '@/lib/scoring';

// ─── SUBCOMPONENTS ────────────────────────────────────────────────────────────

function GateIndicator({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={passed ? 'text-emerald-400' : 'text-red-400'} style={{ fontSize: 10 }}>
        {passed ? '●' : '○'}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function CorrelationCard({ pair }: { pair: typeof correlationPairs[0] }) {
  const isActive = pair.status !== 'Not observed';
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isActive ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
          {pair.title}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap tabular ${correlationStatusBadge(pair.status)}`}>
          {pair.status}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Persistence</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{
                width: 8,
                height: 8,
                backgroundColor: i < pair.persistenceQuarters
                  ? (pair.status === 'Confirmed' ? '#ef4444' : pair.status === 'Emerging' ? '#f59e0b' : '#78716c')
                  : 'var(--border)',
              }}
            />
          ))}
        </div>
        <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
          {pair.persistenceQuarters > 0 ? `${pair.persistenceQuarters}q` : '—'}
        </span>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {pair.interpretation}
      </p>

      {pair.balancingContext.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pair.balancingContext.map((ctx, i) => (
            <li key={i} className="flex gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>·</span>
              <span>{ctx}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function RegimePage() {
  const position = scoreToCyclePosition(currentRun.cycleScore);
  const priorPosition = scoreToCyclePosition(priorRun.cycleScore);
  const scoreDelta = currentRun.cycleScore - priorRun.cycleScore;

  return (
    <div className="flex flex-col gap-4">

      {/* ── BAND 1: REGIME ──────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 grid gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          gridTemplateColumns: '280px 1fr 280px',
        }}
      >
        {/* LEFT — Position */}
        {/* FIX: use inline style for border-color instead of Tailwind border class */}
        <div
          className={`rounded-lg p-4 flex flex-col gap-3 ${cyclePositionBg(position)}`}
          style={{ border: '1px solid', borderColor: cyclePositionBorderColor(position) }}
        >
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              Cycle Position
            </p>
            <p className={`text-lg font-semibold ${cyclePositionColor(position)}`}>
              {position}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Score</span>
              <span className="tabular text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {currentRun.cycleScore}
                <span className={`text-xs ml-1 tabular ${deltaColor(scoreDelta)}`}>
                  ({formatDelta(scoreDelta)})
                </span>
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Supply</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{currentRun.supplyTrajectory}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Demand</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{currentRun.demandTrajectory}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Gates</span>
              <span className="tabular text-xs" style={{ color: 'var(--text-secondary)' }}>{currentRun.gatesPassed}/4 pass</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sources</span>
              <span className="tabular text-xs" style={{ color: 'var(--text-secondary)' }}>{currentRun.sourcesFresh}/8 current</span>
            </div>
          </div>

          {/* Score bar */}
          <div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 4, backgroundColor: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${currentRun.cycleScore}%`,
                  backgroundColor: currentRun.cycleScore >= 70 ? '#10b981'
                    : currentRun.cycleScore >= 50 ? '#14b8a6'
                    : currentRun.cycleScore >= 30 ? '#f59e0b'
                    : '#ef4444',
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              {['0', '30', '50', '70', '100'].map(v => (
                <span key={v} className="tabular" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{v}</span>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER — Score history */}
        {/* FIX: explicit height on bar container so flex children have a reference height */}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            Score History
          </p>
          <div className="flex items-end gap-1.5" style={{ height: 80 }}>
            {cycleRuns.map((run, i) => {
              const barColor = run.cycleScore >= 70 ? '#10b981'
                : run.cycleScore >= 50 ? '#14b8a6'
                : run.cycleScore >= 30 ? '#f59e0b'
                : '#ef4444';
              const isLatest = i === cycleRuns.length - 1;
              return (
                <div key={run.quarter} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
                  <span className="tabular" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{run.cycleScore}</span>
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: Math.max(4, (run.cycleScore / 100) * 56),
                      backgroundColor: barColor,
                      opacity: isLatest ? 1 : 0.4,
                      outline: isLatest ? `1px solid ${barColor}` : 'none',
                    }}
                  />
                  <span className="tabular" style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                    {run.quarter.replace(' 20', "'")}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Regime band legend */}
          <div className="flex gap-3 mt-1">
            {[
              { label: 'Deep Exp', color: '#10b981' },
              { label: 'Mid Exp', color: '#14b8a6' },
              { label: 'Early Warn', color: '#f59e0b' },
              { label: 'Turning', color: '#ef4444' },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-1">
                <div className="rounded-sm" style={{ width: 6, height: 6, backgroundColor: b.color }} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — What changed */}
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            What Changed
          </p>
          <div className="flex flex-col gap-2 flex-1">
            {currentRun.changedSignals.slice(0, 4).map((change, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{change.company}</span>
                  <span className={`text-xs ${signalScoreColor(change.to)}`}>{signalScoreArrow(change.to)}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{change.signal}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  <span className={signalScoreColor(change.from)}>{change.from}</span>
                  {' → '}
                  <span className={signalScoreColor(change.to)}>{change.to}</span>
                </p>
              </div>
            ))}
            {currentRun.changedSignals.length > 4 && (
              <Link href="/forensics" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                +{currentRun.changedSignals.length - 4} more →
              </Link>
            )}
          </div>
          {currentRun.notes && (
            <div
              className="rounded p-2 text-xs leading-relaxed"
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              📝 {currentRun.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── BAND 2: CONFIRMATION ────────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              Confirmation — Four Correlation Pairs
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Decision point when 3+ pairs reach Emerging or Confirmed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
              {correlationPairs.filter(p => p.status !== 'Not observed').length}/4 active
            </span>
            <Link href="/forensics" className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              Investigate →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {correlationPairs.map(pair => (
            <CorrelationCard key={pair.id} pair={pair} />
          ))}
        </div>
      </div>

      {/* ── BAND 3: COMPANY FRESHNESS STRIP ─────────────────────────────── */}
      <div
        className="rounded-xl px-5 py-3"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-4 overflow-x-auto">
          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Sources</span>
          {companies.map(company => {
            const status = freshnessStatus(company.lastIngested);
            const color = freshnessColor(status);
            const days = daysSince(company.lastIngested);
            return (
              <div key={company.id} className="flex items-center gap-1.5 whitespace-nowrap">
                {company.isPrimary && (
                  <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />
                )}
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{company.ticker}</span>
                <span className={`tabular text-xs ${color}`}>{days}d</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}