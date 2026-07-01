// app/api/sheets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';
import { quarterAdd, sortQuarters } from '@/lib/quarter';

const SHEET_ID = '1RFYBmGqCeoG0RwcsXZ5HHrCFqa3ViN-J26g-sAAQEDc';

function getSheets() {
  // In production (Vercel): use GOOGLE_CREDENTIALS_JSON env var
  // In development: fall back to credentials.json file
  let auth;

  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
    // Local dev — walk up from cwd to find credentials.json (handles git worktrees)
    const path = require('path');
    const fs = require('fs');
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'credentials.json'))) break;
      dir = path.dirname(dir);
    }
    auth = new google.auth.GoogleAuth({
      keyFile: path.join(dir, 'credentials.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return google.sheets({ version: 'v4', auth });
}

function parseTab(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// ── Composite signal computation ───────────────────────────────────────────

// node score (1-5) → equivalent % via breakpoint interpolation
// 1=-20, 2=-5, 3=0, 4=15, 5=35
function nodeScoreToPercent(score: number): number {
  const map: Record<number, number> = { 1: -20, 2: -5, 3: 0, 4: 15, 5: 35 };
  const lo = Math.floor(score);
  const hi = Math.ceil(score);
  if (lo === hi) return map[lo] ?? 0;
  return (map[lo] ?? 0) + ((map[hi] ?? 0) - (map[lo] ?? 0)) * (score - lo);
}

function winsorize(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

type SigRow = Record<string, unknown> & { quarter?: string; extracted_at?: string };

// Leading = 80% node_transition_score (normalized to %) + 20% vendor capex_pct
// Trailing = avg bit_growth_pct across vendors
function computeSupplyByQuarter(signals: SigRow[]): Record<string, { leading: number | null; trailing: number | null }> {
  const vendors = signals.filter(r => r.type === 'vendor');
  const quarters = [...new Set(vendors.map(r => r.quarter as string))];
  const result: Record<string, { leading: number | null; trailing: number | null }> = {};

  for (const q of quarters) {
    const qRows = vendors.filter(r => r.quarter === q);
    const nodeRows = qRows.filter(r => r.node_transition_score != null && r.node_transition_score !== '');
    const capexRows = qRows.filter(r => r.capex_pct != null && r.capex_pct !== '');
    const bitRows = qRows.filter(r => r.bit_growth_pct != null && r.bit_growth_pct !== '');

    let leading: number | null = null;
    if (nodeRows.length > 0) {
      const avgNode = nodeRows.reduce((s, r) => s + Number(r.node_transition_score), 0) / nodeRows.length;
      const nodePct = nodeScoreToPercent(avgNode);
      let capexContrib = 0;
      if (capexRows.length > 0) {
        const avgCapex = capexRows.reduce((s, r) => s + Number(r.capex_pct), 0) / capexRows.length;
        capexContrib = winsorize(avgCapex, -60, 60);
      }
      leading = Math.round((nodePct * 0.6 + capexContrib * 0.4) * 10) / 10;
    }

    let trailing: number | null = null;
    if (bitRows.length > 0) {
      trailing = Math.round(
        (bitRows.reduce((s, r) => s + Number(r.bit_growth_pct), 0) / bitRows.length) * 10
      ) / 10;
    }

    result[q] = { leading, trailing };
  }

  return result;
}

function computeDemandByQuarter(signals: SigRow[]): Record<string, number | null> {
  const hyperscalers = signals.filter(r => r.type === 'hyperscaler');
  const quarters = [...new Set(hyperscalers.map(r => r.quarter as string))];
  const result: Record<string, number | null> = {};

  for (const q of quarters) {
    const qRows = hyperscalers.filter(r => r.quarter === q && r.capex_pct != null && r.capex_pct !== '');
    if (qRows.length === 0) { result[q] = null; continue; }
    const avg = qRows.reduce((s, r) => s + Number(r.capex_pct), 0) / qRows.length;
    result[q] = Math.round(avg * 10) / 10;
  }

  return result;
}

function computeStorageByQuarter(signals: SigRow[]): Record<string, number | null> {
  const hyperscalers = signals.filter(r => r.type === 'hyperscaler');
  const quarters = [...new Set(hyperscalers.map(r => r.quarter as string))];
  const result: Record<string, number | null> = {};
  for (const q of quarters) {
    const rows = hyperscalers.filter(r => r.quarter === q && r.storage_score != null && r.storage_score !== '');
    if (rows.length === 0) { result[q] = null; continue; }
    const avg = rows.reduce((s, r) => s + Number(r.storage_score), 0) / rows.length;
    result[q] = Math.round(avg * 100) / 100;
  }
  return result;
}

function computeUrgencyByQuarter(signals: SigRow[]): Record<string, number | null> {
  const hyperscalers = signals.filter(r => r.type === 'hyperscaler');
  const quarters = [...new Set(hyperscalers.map(r => r.quarter as string))];
  const result: Record<string, number | null> = {};
  for (const q of quarters) {
    const rows = hyperscalers.filter(r => r.quarter === q && r.mgmt_tone_score != null && r.mgmt_tone_score !== '');
    if (rows.length === 0) { result[q] = null; continue; }
    const avg = rows.reduce((s, r) => s + Number(r.mgmt_tone_score), 0) / rows.length;
    result[q] = Math.round(avg * 100) / 100;
  }
  return result;
}

function computeDemandIndexByQuarter(signals: SigRow[], quarters: string[]): Record<string, number | null> {
  const hyperscalers = signals.filter(r => r.type === 'hyperscaler');
  const baseActuals: Record<string, number> = {};
  for (const ticker of ['AMZN', 'GOOG', 'META', 'MSFT']) {
    const base = hyperscalers.find(s => s.ticker === ticker && s.quarter === 'Q2 2024');
    if (base?.capex_actual_usd) baseActuals[ticker] = Number(base.capex_actual_usd);
  }
  const result: Record<string, number | null> = {};
  for (const q of quarters) {
    const rows = hyperscalers.filter(s =>
      s.quarter === q && s.capex_actual_usd && baseActuals[s.ticker as string]
    );
    if (rows.length === 0) { result[q] = null; continue; }
    const avgIndex = rows.reduce((sum, r) =>
      sum + (Number(r.capex_actual_usd) / baseActuals[r.ticker as string]) * 100, 0) / rows.length;
    result[q] = Math.round(avgIndex * 10) / 10;
  }
  return result;
}

// Indexes the pre-computed leading supply value relative to Q2 2024.
// Returns (value - Q2_2024_value) for each quarter, so Q2 2024 = 0.
function computeSupplyIndexByQuarter(
  supplyByQuarter: Record<string, { leading: number | null; trailing: number | null }>,
  quarters: string[],
  base?: number
): Record<string, number | null> {
  const baseVal = base ?? supplyByQuarter['Q2 2024']?.leading;
  if (baseVal == null) return {};
  const result: Record<string, number | null> = {};
  for (const q of quarters) {
    const v = supplyByQuarter[q]?.leading;
    result[q] = v != null ? Math.round((v - baseVal) * 10) / 10 : null;
  }
  return result;
}

// For forecast quarters: extrapolate demand index from same-quarter-prior-year actuals + forecast capex_pct (YoY%).
// Q2 2026 extrapolates from Q2 2025 actuals; Q3 2026 extrapolates from Q3 2025 actuals.
function computeForecastDemandIndex(
  actualSignals: SigRow[],
  forecastSignals: SigRow[],
  baseActuals: Record<string, number>,
  forecastQuarters: string[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};

  for (const fq of forecastQuarters) {
    const priorQ = quarterAdd(fq, -4); // same quarter, prior year
    const forecastHypers = forecastSignals.filter(r => r.type === 'hyperscaler' && r.quarter === fq);
    const tickers = forecastHypers.map(r => r.ticker as string);
    const indices: number[] = [];

    for (const ticker of tickers) {
      const base = baseActuals[ticker];
      if (!base) continue;
      const priorRow = actualSignals.find(r => r.ticker === ticker && r.quarter === priorQ && r.capex_actual_usd);
      const fRow = forecastHypers.find(r => r.ticker === ticker);
      if (!priorRow || !fRow || fRow.capex_pct == null || fRow.capex_pct === '') continue;
      const priorUsd = Number(priorRow.capex_actual_usd);
      const yoyPct = Number(fRow.capex_pct);
      const estUsd = priorUsd * (1 + yoyPct / 100);
      indices.push((estUsd / base) * 100);
    }

    result[fq] = indices.length > 0 ? Math.round((indices.reduce((a, b) => a + b, 0) / indices.length) * 10) / 10 : null;
  }
  return result;
}

function computeInventoryByQuarter(signals: SigRow[]): Record<string, number | null> {
  const vendors = signals.filter(r => r.type === 'vendor');
  const quarters = [...new Set(vendors.map(r => r.quarter as string))];
  const result: Record<string, number | null> = {};

  for (const q of quarters) {
    const rows = vendors.filter(r => r.quarter === q && r.inventory_days != null && r.inventory_days !== '');
    if (rows.length === 0) { result[q] = null; continue; }
    const avg = rows.reduce((s, r) => s + Number(r.inventory_days), 0) / rows.length;
    result[q] = Math.round(avg * 10) / 10;
  }

  return result;
}

// GET — read a tab, or action=data for pre-processed page data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Structured data endpoint used by page components — reads from Supabase
  if (action === 'data') {
    try {
      const [{ data: signalsRows }, { data: forecastRows }, { data: configRows }, { data: pricingRows }] = await Promise.all([
        supabase.from('signals').select('*').or('is_forecast.is.null,is_forecast.eq.false').order('quarter', { ascending: true }),
        supabase.from('signals').select('*').eq('is_forecast', true).order('quarter', { ascending: true }),
        supabase.from('config').select('ticker, quarter, company, type, default_url, notes'),
        supabase.from('pricing').select('quarter, nand_price_qoq_pct'),
      ]);

      type CfgRow = Record<string, unknown> & { ticker?: string; quarter?: string; company?: string; type?: string; default_url?: string; notes?: string };

      const signals = ((signalsRows ?? []) as SigRow[]).map(r => ({
        ...r,
        ingested_at: (r.extracted_at as string) ?? '',
      }));

      const config = ((configRows ?? []) as CfgRow[]).map(r => ({
        ticker: r.ticker ?? '',
        quarter: r.quarter ?? '',
        company: r.company ?? '',
        type: r.type ?? '',
        default_url: r.default_url ?? '',
      }));

      const narratives: Record<string, string> = {};
      const narrativesMom: Record<string, string> = {};
      const narrativesForecast: Record<string, string> = {};
      const narrativesForecastMom: Record<string, string> = {};
      for (const r of (configRows ?? []) as CfgRow[]) {
        if (r.ticker === 'SIGNAL' && r.quarter && r.notes) narratives[r.quarter] = r.notes;
        if (r.ticker === 'SIGNAL_MOM' && r.type === 'narrative_mom' && r.quarter && r.notes) narrativesMom[r.quarter] = r.notes;
        if (r.ticker === 'SIGNAL_FORECAST' && r.type === 'narrative_forecast' && r.quarter && r.notes) narrativesForecast[r.quarter] = r.notes;
        if (r.ticker === 'SIGNAL_FORECAST_MOM' && r.type === 'narrative_forecast_mom' && r.quarter && r.notes) narrativesForecastMom[r.quarter] = r.notes;
      }

      const quarters = sortQuarters([...new Set(signals.map(r => r.quarter as string).filter(Boolean))]);
      const latestQuarter = quarters.at(-1) ?? '';

      const latestRows = signals.filter(r => r.quarter === latestQuarter);
      const sourcesCount = latestRows.length;
      const totalSources = 8;

      const dates = latestRows.map(r => r.ingested_at as string).filter(Boolean);
      dates.sort();
      const lastIngested = dates.at(-1) ?? '';

      const supplyByQuarter = computeSupplyByQuarter(signals);
      const supplyIndexByQuarter = computeSupplyIndexByQuarter(supplyByQuarter, quarters);
      const demandByQuarter = computeDemandByQuarter(signals);
      const demandIndexByQuarter = computeDemandIndexByQuarter(signals, quarters);
      const inventoryByQuarter = computeInventoryByQuarter(signals);
      const storageByQuarter = computeStorageByQuarter(signals);
      const urgencyByQuarter = computeUrgencyByQuarter(signals);

      // Forecast indexes
      const forecastSignals = ((forecastRows ?? []) as SigRow[]);
      const forecastQuarters = sortQuarters([...new Set(forecastSignals.map(r => r.quarter as string).filter(Boolean))]);
      const forecastSupplyByQuarter = computeSupplyByQuarter(forecastSignals);
      const actualBase = supplyByQuarter['Q2 2024']?.leading;
      const forecastSupplyIndex = computeSupplyIndexByQuarter(forecastSupplyByQuarter, forecastQuarters, actualBase ?? undefined);

      const baseActualsForDemand: Record<string, number> = {};
      for (const ticker of ['AMZN', 'GOOG', 'META', 'MSFT']) {
        const base = (signalsRows ?? []).find((s: Record<string, unknown>) => s['ticker'] === ticker && s['quarter'] === 'Q2 2024');
        if (base?.['capex_actual_usd']) baseActualsForDemand[ticker] = Number(base['capex_actual_usd']);
      }
      const forecastDemandIndex = computeForecastDemandIndex(signals, forecastSignals, baseActualsForDemand, forecastQuarters);

      const forecastMeta: Record<string, { confidence: number; basis: string }> = {};
      for (const row of forecastSignals) {
        const q = row.quarter as string;
        const conf = row.forecast_confidence != null ? Number(row.forecast_confidence) : 0.5;
        if (!forecastMeta[q]) {
          forecastMeta[q] = { confidence: conf, basis: (row.forecast_basis as string) ?? '' };
        } else {
          forecastMeta[q].confidence = Math.min(forecastMeta[q].confidence, conf);
        }
      }

      type PricingRow = { quarter: string; nand_price_qoq_pct: string | null };
      const tfPricingByQuarter: Record<string, number | null> = {};
      for (const row of (pricingRows ?? []) as PricingRow[]) {
        tfPricingByQuarter[row.quarter] = row.nand_price_qoq_pct != null ? Number(row.nand_price_qoq_pct) : null;
      }
      const sortedPricingQs = sortQuarters(Object.keys(tfPricingByQuarter));
      const latestTfPrice = sortedPricingQs.length > 0 ? tfPricingByQuarter[sortedPricingQs.at(-1)!] : null;

      return NextResponse.json({ signals, config, latestQuarter, sourcesCount, totalSources, lastIngested, supplyByQuarter, supplyIndexByQuarter, demandByQuarter, demandIndexByQuarter, inventoryByQuarter, storageByQuarter, urgencyByQuarter, tfPricingByQuarter, latestTfPrice, narratives, narrativesMom, narrativesForecast, narrativesForecastMom, forecastSupplyIndex, forecastDemandIndex, forecastMeta });
    } catch (error) {
      console.error('Supabase data error:', error);
      return NextResponse.json({ signals: [], config: [], latestQuarter: '', sourcesCount: 0, totalSources: 8, lastIngested: '', supplyByQuarter: {}, supplyIndexByQuarter: {}, demandByQuarter: {}, demandIndexByQuarter: {}, inventoryByQuarter: {}, storageByQuarter: {}, urgencyByQuarter: {}, tfPricingByQuarter: {}, latestTfPrice: null, narratives: {}, narrativesMom: {}, narrativesForecast: {}, narrativesForecastMom: {}, forecastSupplyIndex: {}, forecastDemandIndex: {}, forecastMeta: {} });
    }
  }

  const tab = searchParams.get('tab');
  const range = searchParams.get('range') || `${tab}!A:ZZ`;

  if (!tab) return NextResponse.json({ error: 'tab required' }, { status: 400 });

  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return NextResponse.json({ headers: [], rows: [] });

    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h: string, i: number) => { obj[h] = row[i] ?? ''; });
      return obj;
    });

    return NextResponse.json({ headers, rows: data });
  } catch (error) {
    console.error('Sheets GET error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — append a row or update a range
export async function POST(req: NextRequest) {
  try {
    const { tab, action, data, range } = await req.json();
    const sheets = getSheets();

    if (action === 'append') {
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${tab}!1:1`,
      });
      const headers: string[] = headerRes.data.values?.[0] || [];
      const row = headers.map((h: string) => data[h] ?? '');

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${tab}!A:A`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });

      return NextResponse.json({ success: true, action: 'append', tab });
    }

    if (action === 'update') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: range || `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: data },
      });

      return NextResponse.json({ success: true, action: 'update', tab });
    }

    if (action === 'append_batch') {
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${tab}!1:1`,
      });
      const headers: string[] = headerRes.data.values?.[0] || [];
      const rows = (data as Record<string, unknown>[]).map(obj =>
        headers.map((h: string) => obj[h] ?? '')
      );

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${tab}!A:A`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });

      return NextResponse.json({ success: true, action: 'append_batch', tab, count: rows.length });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Sheets POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
