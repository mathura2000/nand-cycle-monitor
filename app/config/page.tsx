'use client';

import { useState } from 'react';
import Link from 'next/link';
import { companies } from '@/lib/mockData';
import { CYCLE_THRESHOLDS } from '@/lib/scoring';

// ─── EDITABLE NUMBER ──────────────────────────────────────────────────────────

function EditableNumber({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="tabular text-xs w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      >−</button>
      <span className="tabular text-sm font-medium w-10 text-center" style={{ color: 'var(--text-primary)' }}>
        {value}{suffix}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="tabular text-xs w-5 h-5 rounded flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      >+</button>
    </div>
  );
}

// ─── SECTION WRAPPER ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div>
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{title}</p>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  // Weights
  const [vendorWeight, setVendorWeight] = useState(50);
  const [hyperscalerWeight, setHyperscalerWeight] = useState(35);
  const semiWeight = 100 - vendorWeight - hyperscalerWeight;

  // Thresholds
  const [deepExpansion, setDeepExpansion] = useState(CYCLE_THRESHOLDS.deepExpansion);
  const [midExpansion, setMidExpansion] = useState(CYCLE_THRESHOLDS.midExpansion);
  const [earlyWarning, setEarlyWarning] = useState(CYCLE_THRESHOLDS.earlyWarning);

  // Gates
  const [stalenessGate, setStalenessGate] = useState(90);
  const [analystDeltaThreshold, setAnalystDeltaThreshold] = useState(15);
  const [trendGateQuarters, setTrendGateQuarters] = useState(2);

  // Signal weights (per company)
  const [signalWeights, setSignalWeights] = useState(() => {
    const map: Record<string, number> = {};
    companies.forEach(c => c.signals.forEach(s => { map[s.id] = s.weight; }));
    return map;
  });

  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const weightTotal = vendorWeight + hyperscalerWeight + semiWeight;
  const weightValid = weightTotal === 100;

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Config</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Scoring weights · regime thresholds · gate parameters
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            ← Regime
          </Link>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ backgroundColor: saved ? '#10b981' : 'var(--accent-sndk)', color: '#fff' }}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Composite weights */}
      <Section title="Composite Weights" subtitle="Must sum to 100% — SEMI BBB is manual entry only">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Vendor', value: vendorWeight, set: setVendorWeight, color: '#6366f1' },
            { label: 'Hyperscaler', value: hyperscalerWeight, set: setHyperscalerWeight, color: '#14b8a6' },
            { label: 'SEMI BBB', value: semiWeight, set: null as any, color: '#94a3b8' },
          ].map(w => (
            <div key={w.label} className="rounded-lg p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: w.color }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{w.label}</span>
              </div>
              {w.set ? (
                <EditableNumber value={w.value} min={0} max={100} onChange={w.set} suffix="%" />
              ) : (
                <span className="tabular text-sm font-medium" style={{ color: semiWeight < 0 ? '#ef4444' : 'var(--text-primary)' }}>
                  {semiWeight}% <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(auto)</span>
                </span>
              )}
              {/* Bar */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: 3, backgroundColor: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{ width: `${w.value}%`, backgroundColor: w.color }} />
              </div>
            </div>
          ))}
        </div>
        {!weightValid && (
          <p className="text-xs" style={{ color: '#ef4444' }}>⚠ Weights sum to {weightTotal}% — must equal 100%</p>
        )}
      </Section>

      {/* Regime thresholds */}
      <Section title="Regime Thresholds" subtitle="Score boundaries for cycle position classification">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Deep Expansion', value: deepExpansion, set: setDeepExpansion, color: '#10b981', desc: 'score ≥ threshold' },
            { label: 'Mid Expansion',  value: midExpansion,  set: setMidExpansion,  color: '#14b8a6', desc: 'score ≥ threshold' },
            { label: 'Early Warning',  value: earlyWarning,  set: setEarlyWarning,  color: '#f59e0b', desc: 'score ≥ threshold' },
            { label: 'Cycle Turning',  value: 0,             set: null as any,      color: '#ef4444', desc: 'score < early warning' },
          ].map(t => (
            <div key={t.label} className="rounded-lg p-3 flex flex-col gap-2" style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${t.color}25` }}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t.label}</span>
              </div>
              {t.set ? (
                <EditableNumber value={t.value} min={1} max={99} onChange={t.set} />
              ) : (
                <span className="tabular text-sm font-medium" style={{ color: t.color }}>{'< '}{earlyWarning}</span>
              )}
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t.desc}</span>
            </div>
          ))}
        </div>

        {/* Visual threshold bar */}
        <div className="relative rounded-full overflow-hidden" style={{ height: 8, backgroundColor: 'var(--border)' }}>
          <div className="absolute left-0 top-0 h-full" style={{ width: `${earlyWarning}%`, backgroundColor: '#ef4444', opacity: 0.6 }} />
          <div className="absolute top-0 h-full" style={{ left: `${earlyWarning}%`, width: `${midExpansion - earlyWarning}%`, backgroundColor: '#f59e0b', opacity: 0.6 }} />
          <div className="absolute top-0 h-full" style={{ left: `${midExpansion}%`, width: `${deepExpansion - midExpansion}%`, backgroundColor: '#14b8a6', opacity: 0.6 }} />
          <div className="absolute top-0 h-full" style={{ left: `${deepExpansion}%`, right: 0, backgroundColor: '#10b981', opacity: 0.6 }} />
        </div>
        <div className="flex justify-between">
          <span className="tabular" style={{ fontSize: 9, color: 'var(--text-muted)' }}>0</span>
          <span className="tabular" style={{ fontSize: 9, color: '#f59e0b', marginLeft: `${earlyWarning}%` }}>{earlyWarning}</span>
          <span className="tabular" style={{ fontSize: 9, color: '#14b8a6' }}>{midExpansion}</span>
          <span className="tabular" style={{ fontSize: 9, color: '#10b981' }}>{deepExpansion}</span>
          <span className="tabular" style={{ fontSize: 9, color: 'var(--text-muted)' }}>100</span>
        </div>
      </Section>

      {/* Gate parameters */}
      <Section title="Gate Parameters" subtitle="False positive protection rules">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Staleness gate (days)', desc: 'Max days since ingestion before source marked stale', value: stalenessGate, set: setStalenessGate, min: 30, max: 180, step: 15 },
            { label: 'Analyst delta threshold', desc: 'Max delta before analyst divergence gate triggers review', value: analystDeltaThreshold, set: setAnalystDeltaThreshold, min: 5, max: 30, step: 5 },
            { label: 'Trend gate (quarters)', desc: 'Min consecutive quarters of directional signal required', value: trendGateQuarters, set: setTrendGateQuarters, min: 1, max: 4, step: 1 },
          ].map(g => (
            <div key={g.label} className="rounded-lg p-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{g.label}</span>
              <EditableNumber value={g.value} min={g.min} max={g.max} step={g.step} onChange={g.set} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{g.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Signal weights table */}
      <Section title="Signal Weights" subtitle="Per-signal weights (1–10) · higher = more influence on composite score">
        <div className="flex flex-col gap-4">
          {companies.map(company => (
            <div key={company.id}>
              <div className="flex items-center gap-2 mb-2">
                {company.isPrimary && <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-sndk)' }} />}
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{company.ticker}</span>
                <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{company.role}</span>
              </div>
              <div className="flex flex-col gap-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {company.signals.map((signal, si) => (
                  <div
                    key={signal.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: si < company.signals.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{signal.name}</span>
                      <span
                        className="text-xs capitalize px-1.5 py-px rounded"
                        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontSize: 9 }}
                      >
                        {signal.category}
                      </span>
                    </div>
                    <EditableNumber
                      value={signalWeights[signal.id] ?? signal.weight}
                      min={1}
                      max={10}
                      onChange={v => setSignalWeights(prev => ({ ...prev, [signal.id]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}