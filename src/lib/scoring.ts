// src/lib/scoring.ts
// Pure functions — no side effects, no imports from Next.js
// These run client-side off mocks now; relocate to createServerFn later.

import type { Company, Signal, SignalScore, CyclePosition, CorrelationPair, CorrelationStatus } from './mockData';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SCORE_MAP: Record<SignalScore, number> = {
  bullish: 1,
  neutral: 0,
  bearish: -1,
};

const WEIGHTS = {
  vendor: 0.50,
  hyperscaler: 0.35,
  semi: 0.15,
};

export const CYCLE_THRESHOLDS = {
  deepExpansion: 70,
  midExpansion: 50,
  earlyWarning: 30,
};

// ─── SIGNAL SCORING ───────────────────────────────────────────────────────────

export function scoreSignal(signal: Signal): number {
  const latest = signal.history[signal.history.length - 1];
  if (!latest) return 0;
  return SCORE_MAP[latest.score] * signal.weight;
}

export function maxSignalScore(signal: Signal): number {
  return signal.weight;
}

export function scoreCompany(company: Company): number {
  if (company.signals.length === 0) return 50;
  const totalWeighted = company.signals.reduce((sum, s) => sum + scoreSignal(s), 0);
  const maxWeighted = company.signals.reduce((sum, s) => sum + maxSignalScore(s), 0);
  const minWeighted = -maxWeighted;
  return Math.round(((totalWeighted - minWeighted) / (maxWeighted - minWeighted)) * 100);
}

// ─── COMPOSITE CYCLE SCORE ────────────────────────────────────────────────────

export function computeCycleScore(
  companies: Company[],
  semiBBB?: number
): number {
  const vendors = companies.filter(c => c.role === 'vendor');
  const hyperscalers = companies.filter(c => c.role === 'hyperscaler');
  const vendorScore = average(vendors.map(c => c.compositeScore));
  const hyperscalerScore = average(hyperscalers.map(c => c.compositeScore));

  if (semiBBB !== undefined) {
    return Math.round(
      vendorScore * WEIGHTS.vendor +
      hyperscalerScore * WEIGHTS.hyperscaler +
      semiBBB * WEIGHTS.semi
    );
  }

  const vendorW = WEIGHTS.vendor / (WEIGHTS.vendor + WEIGHTS.hyperscaler);
  const hyperW = WEIGHTS.hyperscaler / (WEIGHTS.vendor + WEIGHTS.hyperscaler);
  return Math.round(vendorScore * vendorW + hyperscalerScore * hyperW);
}

// ─── CYCLE POSITION ───────────────────────────────────────────────────────────

export function scoreToCyclePosition(score: number): CyclePosition {
  if (score >= CYCLE_THRESHOLDS.deepExpansion) return 'Deep Expansion';
  if (score >= CYCLE_THRESHOLDS.midExpansion) return 'Mid Expansion';
  if (score >= CYCLE_THRESHOLDS.earlyWarning) return 'Early Warning';
  return 'Cycle Turning';
}

export function cyclePositionColor(position: CyclePosition): string {
  switch (position) {
    case 'Deep Expansion': return 'text-emerald-400';
    case 'Mid Expansion': return 'text-teal-400';
    case 'Early Warning': return 'text-amber-400';
    case 'Cycle Turning': return 'text-red-400';
  }
}

/** Returns a raw CSS color string for use in inline styles (border-color, etc.) */
export function cyclePositionBorderColor(position: CyclePosition): string {
  switch (position) {
    case 'Deep Expansion': return 'rgba(16,185,129,0.4)';
    case 'Mid Expansion': return 'rgba(20,184,166,0.4)';
    case 'Early Warning': return 'rgba(245,158,11,0.4)';
    case 'Cycle Turning': return 'rgba(239,68,68,0.4)';
  }
}

/** @deprecated Use cyclePositionBorderColor for inline styles */
export function cyclePositionBorder(position: CyclePosition): string {
  return cyclePositionBorderColor(position);
}

export function cyclePositionBg(position: CyclePosition): string {
  switch (position) {
    case 'Deep Expansion': return 'bg-emerald-500/10';
    case 'Mid Expansion': return 'bg-teal-500/10';
    case 'Early Warning': return 'bg-amber-500/10';
    case 'Cycle Turning': return 'bg-red-500/10';
  }
}

/** Returns a raw CSS background color for the position score bar */
export function cycleScoreBarColor(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 50) return '#14b8a6';
  if (score >= 30) return '#f59e0b';
  return '#ef4444';
}

// ─── SIGNAL SCORE DISPLAY ─────────────────────────────────────────────────────

export function signalScoreColor(score: SignalScore): string {
  switch (score) {
    case 'bullish': return 'text-emerald-400';
    case 'neutral': return 'text-slate-400';
    case 'bearish': return 'text-red-400';
  }
}

export function signalScoreBadge(score: SignalScore): string {
  switch (score) {
    case 'bullish': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'neutral': return 'bg-slate-500/15 text-slate-400 border border-slate-500/30';
    case 'bearish': return 'bg-red-500/15 text-red-400 border border-red-500/30';
  }
}

export function signalScoreArrow(score: SignalScore): string {
  switch (score) {
    case 'bullish': return '↑';
    case 'neutral': return '→';
    case 'bearish': return '↓';
  }
}

/** Raw CSS color for a signal score — for use in SVG/canvas/recharts */
export function signalScoreRawColor(score: SignalScore): string {
  switch (score) {
    case 'bullish': return '#10b981';
    case 'neutral': return '#94a3b8';
    case 'bearish': return '#ef4444';
  }
}

// ─── CORRELATION STATUS ───────────────────────────────────────────────────────

export function correlationStatusColor(status: CorrelationStatus): string {
  switch (status) {
    case 'Not observed': return 'text-slate-500';
    case 'Forming': return 'text-amber-400/70';
    case 'Emerging': return 'text-amber-400';
    case 'Confirmed': return 'text-red-400';
  }
}

export function correlationStatusBadge(status: CorrelationStatus): string {
  switch (status) {
    case 'Not observed': return 'bg-slate-800 text-slate-500 border border-slate-700';
    case 'Forming': return 'bg-amber-500/10 text-amber-400/70 border border-amber-500/20';
    case 'Emerging': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'Confirmed': return 'bg-red-500/15 text-red-400 border border-red-500/30';
  }
}

export function countActiveCorrelations(pairs: CorrelationPair[]): number {
  return pairs.filter(p => p.status !== 'Not observed').length;
}

// ─── FALSE POSITIVE GATES ─────────────────────────────────────────────────────

export interface GateResult {
  name: string;
  passed: boolean;
  detail: string;
}

export function evaluateGates(
  sourcesFresh: number,
  totalSources: number,
  consecutiveBearishQuarters: number,
  companiesShowingBearish: { vendors: number; hyperscalers: number },
  analystDelta: number,
  analystDeltaThreshold = 15
): GateResult[] {
  return [
    {
      name: 'Staleness gate',
      passed: sourcesFresh >= Math.ceil(totalSources * 0.375),
      detail: `${sourcesFresh}/${totalSources} sources ingested within 90 days`,
    },
    {
      name: 'Confirmation requirement',
      passed: companiesShowingBearish.vendors >= 1 && companiesShowingBearish.hyperscalers >= 1,
      detail: `${companiesShowingBearish.vendors} vendor(s) + ${companiesShowingBearish.hyperscalers} hyperscaler(s) showing bearish shift`,
    },
    {
      name: 'Trend gate',
      passed: consecutiveBearishQuarters >= 2,
      detail: `${consecutiveBearishQuarters} consecutive quarter(s) of directional movement required (need 2)`,
    },
    {
      name: 'Analyst divergence',
      passed: Math.abs(analystDelta) <= analystDeltaThreshold,
      detail: Math.abs(analystDelta) > analystDeltaThreshold
        ? `Analyst delta ${analystDelta > 0 ? '+' : ''}${analystDelta} exceeds ±${analystDeltaThreshold} threshold — manual review required`
        : `Analyst delta ${analystDelta > 0 ? '+' : ''}${analystDelta} within threshold`,
    },
  ];
}

// ─── DATA FRESHNESS ───────────────────────────────────────────────────────────

export function daysSince(isoDate: string): number {
  const now = new Date();
  const then = new Date(isoDate);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export function freshnessStatus(isoDate: string, staleDays = 90): 'fresh' | 'aging' | 'stale' {
  const days = daysSince(isoDate);
  if (days <= 30) return 'fresh';
  if (days <= staleDays) return 'aging';
  return 'stale';
}

export function freshnessColor(status: 'fresh' | 'aging' | 'stale'): string {
  switch (status) {
    case 'fresh': return 'text-emerald-400';
    case 'aging': return 'text-amber-400';
    case 'stale': return 'text-red-400';
  }
}

// ─── DELTA DISPLAY ────────────────────────────────────────────────────────────

export function formatDelta(delta: number, unit = ''): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${unit}`;
}

export function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-400';
  if (delta < 0) return 'text-red-400';
  return 'text-slate-400';
}

// ─── SPARKLINE DATA ───────────────────────────────────────────────────────────

export function sparklineData(signal: Signal, n = 8) {
  return signal.history.slice(-n).map(h => ({
    quarter: h.quarter,
    value: typeof h.value === 'number' ? h.value : null,
    score: h.score,
  }));
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────

function average(nums: number[]): number {
  if (nums.length === 0) return 50;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}