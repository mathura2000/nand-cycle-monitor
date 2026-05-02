// app/api/score/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ── Signal → bullish/neutral/bearish mapping ──────────────────────────────────

type Direction = 1 | 0 | -1; // bullish | neutral | bearish

function scoreVendorRow(row: Record<string, string>, weights: Record<string, number>): {
  score: number; maxScore: number; signals: Array<{ field: string; direction: Direction; weight: number; value: string }>
} {
  const signals: Array<{ field: string; direction: Direction; weight: number; value: string }> = [];

  function add(field: string, weightKey: string, direction: Direction) {
    const w = weights[weightKey] ?? 0;
    signals.push({ field, direction, weight: w, value: row[field] ?? '' });
  }

  // Bit growth YoY — >15% bearish, 5-15% neutral, <5% bullish (supply tightening = bullish)
  const bitYoy = parseFloat(row['bit_growth_yoy']);
  if (!isNaN(bitYoy)) {
    add('bit_growth_yoy', 'w_bit_growth_yoy', bitYoy > 15 ? -1 : bitYoy > 5 ? 0 : 1);
  }

  // Bit growth QoQ
  const bitQoq = parseFloat(row['bit_growth_qoq']);
  if (!isNaN(bitQoq)) {
    add('bit_growth_qoq', 'w_bit_growth_qoq', bitQoq > 5 ? -1 : bitQoq > 0 ? 0 : 1);
  }

  // Inventory days — rising = bearish, falling = bullish
  const invDays = parseFloat(row['inventory_days']);
  if (!isNaN(invDays)) {
    add('inventory_days', 'w_inventory_days', invDays > 90 ? -1 : invDays > 60 ? 0 : 1);
  }

  // Utilization rate — high = bullish (constrained), low = bearish
  const util = parseFloat(row['utilization_rate']);
  if (!isNaN(util)) {
    add('utilization_rate', 'w_utilization_rate', util > 90 ? 1 : util > 75 ? 0 : -1);
  }

  // CapEx YoY — rising CapEx = bearish (more future supply)
  const capexYoy = parseFloat(row['capex_yoy_pct']);
  if (!isNaN(capexYoy)) {
    add('capex_yoy_pct', 'w_capex_guidance', capexYoy > 20 ? -1 : capexYoy > 0 ? 0 : 1);
  }

  // Wafer starts
  const waferDir = row['wafer_starts_direction'];
  if (waferDir) {
    add('wafer_starts_direction', 'w_wafer_starts',
      waferDir === 'decreasing' ? 1 : waferDir === 'flat' ? 0 : -1);
  }

  // ASP sequential — rising = bullish
  const aspSeq = parseFloat(row['asp_seq_pct']);
  if (!isNaN(aspSeq)) {
    add('asp_seq_pct', 'w_asp_seq', aspSeq > 3 ? 1 : aspSeq > -3 ? 0 : -1);
  }

  // ASP YoY
  const aspYoy = parseFloat(row['asp_yoy_pct']);
  if (!isNaN(aspYoy)) {
    add('asp_yoy_pct', 'w_asp_yoy', aspYoy > 5 ? 1 : aspYoy > -5 ? 0 : -1);
  }

  // Pricing tone
  const pricingTone = row['pricing_tone'];
  if (pricingTone) {
    add('pricing_tone', 'w_pricing_tone',
      pricingTone === 'rising' ? 1 : pricingTone === 'stable' ? 0 : -1);
  }

  // Revenue YoY
  const revYoy = parseFloat(row['revenue_yoy']);
  if (!isNaN(revYoy)) {
    add('revenue_yoy', 'w_revenue_yoy', revYoy > 20 ? 1 : revYoy > 0 ? 0 : -1);
  }

  // Gross margin QoQ
  const gmQoq = parseFloat(row['gross_margin_qoq']);
  if (!isNaN(gmQoq)) {
    add('gross_margin_qoq', 'w_gross_margin', gmQoq > 2 ? 1 : gmQoq > -2 ? 0 : -1);
  }

  // Management tone score (1-5; >3 = late cycle psychology forming = slightly bearish)
  const mgmtTone = parseFloat(row['mgmt_tone_score']);
  if (!isNaN(mgmtTone)) {
    add('mgmt_tone_score', 'w_mgmt_tone', mgmtTone <= 2 ? 1 : mgmtTone <= 3 ? 0 : -1);
  }

  // Guidance posture
  const guidance = row['guidance_posture'];
  if (guidance) {
    add('guidance_posture', 'w_guidance_posture',
      guidance === 'conservative' ? 1 : guidance === 'in-line' ? 0 : -1);
  }

  // Node transition — aggressive transitions = more bits = bearish
  const nodeNotes = row['node_transition_notes'];
  if (nodeNotes && nodeNotes.length > 10) {
    const isAggressive = /aggressive|accelerat|ahead of schedule/i.test(nodeNotes);
    add('node_transition_notes', 'w_node_transition', isAggressive ? -1 : 0);
  }

  // Compute weighted score: normalize to 0–100
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of signals) {
    weightedSum += s.direction * s.weight;
    totalWeight += s.weight;
  }

  // Normalize: range is [-totalWeight, +totalWeight] → [0, 100]
  const score = totalWeight > 0
    ? Math.round(((weightedSum / totalWeight) + 1) / 2 * 100)
    : 50;

  return { score, maxScore: 100, signals };
}

function scoreHyperscalerRow(row: Record<string, string>, weights: Record<string, number>): {
  score: number; signals: Array<{ field: string; direction: Direction; weight: number; value: string }>
} {
  const signals: Array<{ field: string; direction: Direction; weight: number; value: string }> = [];

  function add(field: string, weightKey: string, direction: Direction) {
    const w = weights[weightKey] ?? 0;
    signals.push({ field, direction, weight: w, value: row[field] ?? '' });
  }

  // CapEx QoQ — rising = bullish (strong demand)
  const capexQoq = parseFloat(row['capex_qoq_pct']);
  if (!isNaN(capexQoq)) {
    add('capex_qoq_pct', 'wh_capex_qoq', capexQoq > 10 ? 1 : capexQoq > -5 ? 0 : -1);
  }

  // CapEx FY guidance — large = bullish
  const capexGuide = parseFloat(row['capex_fy_guidance']);
  if (!isNaN(capexGuide)) {
    // Compare vs prior — if we have prior data. For now use absolute level signal
    add('capex_fy_guidance', 'wh_capex_guidance', capexGuide > 50000 ? 1 : capexGuide > 20000 ? 0 : -1);
  }

  // Backlog YoY
  const backlogYoy = parseFloat(row['backlog_yoy']);
  if (!isNaN(backlogYoy)) {
    add('backlog_yoy', 'wh_backlog', backlogYoy > 15 ? 1 : backlogYoy > 0 ? 0 : -1);
  }

  // Storage constraint tone
  const storeTone = row['storage_constraint_tone'];
  if (storeTone) {
    add('storage_constraint_tone', 'wh_storage_constraint',
      storeTone === 'constrained' ? 1 : storeTone === 'adequate' ? 0 : -1);
  }

  // Pull-forward procurement = strong demand signal = bullish
  const pullForward = row['pull_forward_procurement'];
  if (pullForward === 'true' || pullForward === 'TRUE') {
    add('pull_forward_procurement', 'wh_pull_forward', 1);
  } else if (pullForward === 'false' || pullForward === 'FALSE') {
    add('pull_forward_procurement', 'wh_pull_forward', 0);
  }

  // Datacenter revenue YoY
  const dcYoy = parseFloat(row['datacenter_yoy']);
  if (!isNaN(dcYoy)) {
    add('datacenter_yoy', 'wh_datacenter_revenue', dcYoy > 25 ? 1 : dcYoy > 5 ? 0 : -1);
  }

  // Storage sufficiency score (1=constrained=bullish, 5=comfortable=bearish for NAND demand)
  const suffScore = parseFloat(row['storage_sufficiency_score']);
  if (!isNaN(suffScore)) {
    add('storage_sufficiency_score', 'wh_storage_sufficiency',
      suffScore <= 2 ? 1 : suffScore <= 3 ? 0 : -1);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of signals) {
    weightedSum += s.direction * s.weight;
    totalWeight += s.weight;
  }

  const score = totalWeight > 0
    ? Math.round(((weightedSum / totalWeight) + 1) / 2 * 100)
    : 50;

  return { score, signals };
}

function scoreSemiBBB(bbb: number): number {
  // Below 0.9 = bullish (100), 0.9-1.0 = neutral (50), above 1.0 = bearish (0)
  if (bbb < 0.85) return 90;
  if (bbb < 0.9) return 75;
  if (bbb < 1.0) return 50;
  if (bbb < 1.1) return 25;
  return 10;
}

function cyclePosition(score: number): string {
  if (score >= 70) return 'Deep Expansion';
  if (score >= 50) return 'Mid Expansion';
  if (score >= 30) return 'Early Warning';
  return 'Cycle Turning';
}

function detectCorrelationPairs(
  vendorRows: Record<string, string>[],
  hyperscalerRows: Record<string, string>[]
) {
  // Pair 1: Vendor bit growth accelerating + Hyperscaler CapEx decelerating
  const avgBitGrowth = vendorRows.reduce((sum, r) => sum + (parseFloat(r['bit_growth_yoy']) || 0), 0) / Math.max(vendorRows.length, 1);
  const avgCapexQoq = hyperscalerRows.reduce((sum, r) => sum + (parseFloat(r['capex_qoq_pct']) || 0), 0) / Math.max(hyperscalerRows.length, 1);
  const pair1Firing = avgBitGrowth > 12 && avgCapexQoq < 5;

  // Pair 2: ASP flattening + inventory rising (same vendor)
  const pair2Firing = vendorRows.some(r => {
    const aspSeq = parseFloat(r['asp_seq_pct']);
    const invDays = parseFloat(r['inventory_days']);
    return !isNaN(aspSeq) && !isNaN(invDays) && aspSeq < 2 && invDays > 70;
  });

  // Pair 3: Management tone bullish + CapEx guidance rising
  const pair3Firing = vendorRows.some(r => {
    const tone = parseFloat(r['mgmt_tone_score']);
    const capexYoy = parseFloat(r['capex_yoy_pct']);
    return !isNaN(tone) && !isNaN(capexYoy) && tone >= 4 && capexYoy > 15;
  });

  // Pair 4: Spot vs contract divergence — qualitative for now
  const pair4Firing = false; // Requires spot price data feed

  const pairsFiring = [pair1Firing, pair2Firing, pair3Firing, pair4Firing].filter(Boolean).length;

  return {
    pair_vendor_hyperscaler: pair1Firing ? 'firing' : 'not_observed',
    pair_asp_inventory: pair2Firing ? 'firing' : 'not_observed',
    pair_mgmt_capex: pair3Firing ? 'firing' : 'not_observed',
    pair_spot_contract: 'not_observed',
    pairs_firing: pairsFiring,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { vendorRows, hyperscalerRows, semiLatest, configRows, quarter, runId } = await req.json();

    // Parse config weights
    const weights: Record<string, number> = {};
    for (const row of (configRows || [])) {
      if (row.key && row.value) weights[row.key] = parseFloat(row.value);
    }

    // Score each vendor
    const vendorScores = (vendorRows || []).map((row: Record<string, string>) => ({
      company: row.company,
      ticker: row.ticker,
      ...scoreVendorRow(row, weights)
    }));

    // Score each hyperscaler
    const hyperscalerScores = (hyperscalerRows || []).map((row: Record<string, string>) => ({
      company: row.company,
      ticker: row.ticker,
      ...scoreHyperscalerRow(row, weights)
    }));

    // Composite scores
    const vendorComposite = vendorScores.length > 0
      ? Math.round(vendorScores.reduce((sum: number, v: { score: number }) => sum + v.score, 0) / vendorScores.length)
      : 50;

    const hyperscalerComposite = hyperscalerScores.length > 0
      ? Math.round(hyperscalerScores.reduce((sum: number, h: { score: number }) => sum + h.score, 0) / hyperscalerScores.length)
      : 50;

    const semiScore = semiLatest ? scoreSemiBBB(parseFloat(semiLatest)) : 50;

    // Blend weights from config
    const vw = weights['vendor_weight'] ?? 0.50;
    const hw = weights['hyperscaler_weight'] ?? 0.35;
    const sw = weights['semi_weight'] ?? 0.15;

    const masterScore = Math.round(
      vendorComposite * vw +
      hyperscalerComposite * hw +
      semiScore * sw
    );

    // Correlation pairs
    const pairs = detectCorrelationPairs(vendorRows || [], hyperscalerRows || []);

    const result = {
      run_id: runId,
      run_date: new Date().toISOString(),
      quarter,
      vendor_composite: vendorComposite,
      hyperscaler_composite: hyperscalerComposite,
      semi_score: semiScore,
      master_score: masterScore,
      cycle_position: cyclePosition(masterScore),
      vendor_detail: vendorScores,
      hyperscaler_detail: hyperscalerScores,
      ...pairs,
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('score error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
