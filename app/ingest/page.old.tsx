'use client';

import { useState } from 'react';
import Link from 'next/link';
import { companies, currentRun } from '@/lib/mockData';
import { daysSince, freshnessStatus, freshnessColor, signalScoreColor, signalScoreBadge, signalScoreArrow } from '@/lib/scoring';

// ─── MOCK INGEST STATE ────────────────────────────────────────────────────────

type SourceStatus = 'fresh' | 'pending' | 'stale' | 'running' | 'error';

interface IngestSource {
  id: string;
  ticker: string;
  name: string;
  role: 'vendor' | 'hyperscaler';
  isPrimary: boolean;
  lastIngested: string;
  status: SourceStatus;
  signalCount: number;
  flaggedCount: number;
  quarter: string;
}

const ingestSources: IngestSource[] = companies.map(c => ({
  id: c.id,
  ticker: c.ticker,
  name: c.name,
  role: c.role,
  isPrimary: c.isPrimary,
  lastIngested: c.lastIngested,
  status: daysSince(c.lastIngested) > 60 ? 'stale' : 'fresh',
  signalCount: c.signals.length,
  flaggedCount: c.signals.filter(s => {
    const latest = s.history[s.history.length - 1];
    const prior = s.history[s.history.length - 2];
    return latest && prior && latest.score !== prior.score;
  }).length,
  quarter: 'Q1 2026',
}));

// Mock flagged fields needing triage
const flaggedFields = [
  { id: 'f1', ticker: 'SSNLF', signal: 'Bit shipment growth YoY', issue: 'Score flipped bearish — was bullish 3 consecutive quarters', from: 'bullish' as const, to: 'bearish' as const, value: '44%', confidence: 'High' },
  { id: 'f2', ticker: 'MU', signal: 'Bit shipment growth YoY', issue: 'Score changed neutral — trend break after 4 bullish quarters', from: 'bullish' as const, to: 'neutral' as const, value: '20%', confidence: 'Medium' },
  { id: 'f3', ticker: 'SNDK', signal: 'Sequential ASP change', issue: 'Score changed neutral — pricing momentum slowing', from: 'bullish' as const, to: 'neutral' as const, value: '2%', confidence: 'High' },
  { id: 'f4', ticker: 'SNDK', signal: 'CapEx guidance YoY', issue: 'Bearish signal persisting — supply expansion risk flagged', from: 'bearish' as const, to: 'bearish' as const, value: '28%', confidence: 'Medium' },
];

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SourceStatus }) {
  const styles: Record<SourceStatus, { label: string; color: string; bg: string; border: string }> = {
    fresh:   { label: 'Fresh',   color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)'  },
    pending: { label: 'Pending', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' },
    stale:   { label: 'Stale',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
    running: { label: 'Running', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
    error:   { label: 'Error',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)'   },
  };
  const s = styles[status];
  return (
    <span className="tabular text-xs px-2 py-0.5 rounded-full" style={{ color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}` }}>
      {status === 'running' ? '⟳ ' : ''}{s.label}
    </span>
  );
}

// ─── SOURCE TILE ──────────────────────────────────────────────────────────────

function SourceTile({ source, onRun }: { source: IngestSource; onRun: (id: string) => void }) {
  const days = daysSince(source.lastIngested);
  const freshStatus = freshnessStatus(source.lastIngested);
  const freshColor = freshnessColor(freshStatus);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${source.status === 'stale' ? 'rgba(239,68,68,0.25)' : source.status === 'running' ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          {source.isPrimary && <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />}
          <div>
            <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{source.ticker}</span>
            <span className="text-xs ml-1.5 capitalize" style={{ color: 'var(--text-muted)' }}>{source.role}</span>
          </div>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last ingested</span>
          <span className={`tabular text-xs ${freshColor}`}>{days}d ago</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Quarter</span>
          <span className="tabular text-xs" style={{ color: 'var(--text-secondary)' }}>{source.quarter}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Signals</span>
          <span className="tabular text-xs" style={{ color: 'var(--text-secondary)' }}>{source.signalCount}</span>
        </div>
        {source.flaggedCount > 0 && (
          <div className="flex justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Flagged</span>
            <span className="tabular text-xs" style={{ color: '#f59e0b' }}>{source.flaggedCount} changed</span>
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={() => onRun(source.id)}
        disabled={source.status === 'running'}
        className="w-full text-xs py-1.5 rounded font-medium transition-colors"
        style={{
          backgroundColor: source.status === 'running' ? 'var(--bg-card)' : 'var(--bg-card-hover)',
          color: source.status === 'running' ? 'var(--text-muted)' : 'var(--text-secondary)',
          border: '1px solid var(--border)',
          cursor: source.status === 'running' ? 'not-allowed' : 'pointer',
        }}
      >
        {source.status === 'running' ? 'Running…' : 'Run Ingest'}
      </button>
    </div>
  );
}

// ─── FLAGGED FIELD ROW ────────────────────────────────────────────────────────

function FlaggedRow({ field, onAccept, onOverride }: {
  field: typeof flaggedFields[0];
  onAccept: (id: string) => void;
  onOverride: (id: string) => void;
}) {
  return (
    <div
      className="grid items-center gap-3 py-3"
      style={{
        gridTemplateColumns: '56px 1fr 120px 80px 80px 140px',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span className="tabular text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{field.ticker}</span>
      <div>
        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{field.signal}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{field.issue}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs px-1.5 py-0.5 rounded-full tabular ${signalScoreBadge(field.from)}`}>
          {signalScoreArrow(field.from)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>→</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full tabular ${signalScoreBadge(field.to)}`}>
          {signalScoreArrow(field.to)}
        </span>
      </div>
      <span className="tabular text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{field.value}</span>
      <span
        className="text-xs px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: field.confidence === 'High' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          color: field.confidence === 'High' ? '#10b981' : '#f59e0b',
          border: `1px solid ${field.confidence === 'High' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          width: 'fit-content',
        }}
      >
        {field.confidence}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(field.id)}
          className="text-xs px-2 py-1 rounded flex-1"
          style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
        >
          Accept
        </button>
        <button
          onClick={() => onOverride(field.id)}
          className="text-xs px-2 py-1 rounded flex-1"
          style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          Override
        </button>
      </div>
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function IngestPage() {
  const [sources, setSources] = useState(ingestSources);
  const [flags, setFlags] = useState(flaggedFields);
  const [runningAll, setRunningAll] = useState(false);

  const freshCount = sources.filter(s => s.status === 'fresh').length;
  const staleCount = sources.filter(s => s.status === 'stale').length;

  function handleRun(id: string) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'running' } : s));
    setTimeout(() => {
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'fresh', lastIngested: new Date().toISOString().split('T')[0] } : s));
    }, 2000);
  }

  function handleRunAll() {
    setRunningAll(true);
    setSources(prev => prev.map(s => ({ ...s, status: 'running' })));
    setTimeout(() => {
      setSources(prev => prev.map(s => ({ ...s, status: 'fresh', lastIngested: new Date().toISOString().split('T')[0] })));
      setRunningAll(false);
    }, 3000);
  }

  function handleAccept(id: string) {
    setFlags(prev => prev.filter(f => f.id !== id));
  }

  function handleOverride(id: string) {
    setFlags(prev => prev.filter(f => f.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ingest</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Run transcript extraction · triage flagged signal changes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            ← Regime
          </Link>
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{
              backgroundColor: runningAll ? 'var(--bg-card)' : 'var(--accent-sndk)',
              color: runningAll ? 'var(--text-muted)' : '#fff',
              cursor: runningAll ? 'not-allowed' : 'pointer',
            }}
          >
            {runningAll ? 'Running all…' : 'Run All'}
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div
        className="rounded-xl px-5 py-3 flex items-center gap-6"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Sources</p>
          <p className="tabular text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{sources.length}</p>
        </div>
        <div style={{ width: 1, height: 32, backgroundColor: 'var(--border)' }} />
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Fresh</p>
          <p className="tabular text-xl font-bold text-emerald-400">{freshCount}</p>
        </div>
        <div style={{ width: 1, height: 32, backgroundColor: 'var(--border)' }} />
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Stale</p>
          <p className="tabular text-xl font-bold text-red-400">{staleCount}</p>
        </div>
        <div style={{ width: 1, height: 32, backgroundColor: 'var(--border)' }} />
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Flags to triage</p>
          <p className="tabular text-xl font-bold" style={{ color: flags.length > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
            {flags.length}
          </p>
        </div>
        <div style={{ width: 1, height: 32, backgroundColor: 'var(--border)' }} />
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>Last run</p>
          <p className="tabular text-sm" style={{ color: 'var(--text-secondary)' }}>{currentRun.runDate}</p>
        </div>
      </div>

      {/* Source tiles */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          Sources — Vendors
        </p>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {sources.filter(s => s.role === 'vendor').map(source => (
            <SourceTile key={source.id} source={source} onRun={handleRun} />
          ))}
        </div>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          Sources — Hyperscalers
        </p>
        <div className="grid grid-cols-4 gap-3">
          {sources.filter(s => s.role === 'hyperscaler').map(source => (
            <SourceTile key={source.id} source={source} onRun={handleRun} />
          ))}
        </div>
      </div>

      {/* Triage section */}
      {flags.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ color: '#f59e0b', letterSpacing: '0.1em' }}>
                Triage — {flags.length} flagged signal changes
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Review each change · accept to confirm · override to revert to prior score
              </p>
            </div>
            <button
              onClick={() => setFlags([])}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Accept all
            </button>
          </div>

          {/* Column headers */}
          <div
            className="grid gap-3 pb-2"
            style={{ gridTemplateColumns: '56px 1fr 120px 80px 80px 140px', borderBottom: '1px solid var(--border)' }}
          >
            {['Ticker', 'Signal / Issue', 'Change', 'Value', 'Confidence', 'Action'].map(h => (
              <span key={h} className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>

          {flags.map(field => (
            <FlaggedRow
              key={field.id}
              field={field}
              onAccept={handleAccept}
              onOverride={handleOverride}
            />
          ))}
        </div>
      )}

      {flags.length === 0 && (
        <div
          className="rounded-xl p-5 flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', minHeight: 80 }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>✓ All flags triaged — ready to score</p>
        </div>
      )}

    </div>
  );
}