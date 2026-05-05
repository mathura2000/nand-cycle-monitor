import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const TICKERS = ['SNDK', 'MU', 'SSNLF', 'HXSCL', 'MSFT', 'GOOG', 'AMZN', 'META'];
const QUARTERS = ['Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024'];
const SNDK_NA = new Set(['Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024']);

interface TranscriptRow { ticker: string; quarter: string; }
interface SignalRow {
  ticker: string; quarter: string; type: string;
  bit_growth_pct: number | null; capex_pct: number | null; extraction_notes: string | null;
}

export async function GET() {
  const [{ data: transcripts }, { data: signals }] = await Promise.all([
    supabase.from('transcripts').select('ticker, quarter'),
    supabase.from('signals').select('ticker, quarter, bit_growth_pct, capex_pct, extraction_notes, type'),
  ]);

  const transcriptSet = new Set(
    ((transcripts ?? []) as TranscriptRow[]).map(r => `${r.ticker}|${r.quarter}`)
  );

  const signalsMap = new Map(
    ((signals ?? []) as SignalRow[]).map(r => [`${r.ticker}|${r.quarter}`, r])
  );

  const grid = [];
  for (const ticker of TICKERS) {
    for (const quarter of QUARTERS) {
      if (ticker === 'SNDK' && SNDK_NA.has(quarter)) {
        grid.push({ ticker, quarter, status: 'na' });
        continue;
      }

      const key = `${ticker}|${quarter}`;
      const sig = signalsMap.get(key);

      if (!transcriptSet.has(key)) {
        grid.push({ ticker, quarter, status: 'empty' });
        continue;
      }

      if (!sig) {
        grid.push({ ticker, quarter, status: 'empty' });
        continue;
      }

      if (sig.extraction_notes?.includes('ERROR')) {
        grid.push({ ticker, quarter, status: 'error' });
        continue;
      }

      const isVendor = sig.type === 'vendor';
      const missingRequired = isVendor
        ? (sig.bit_growth_pct == null || sig.capex_pct == null)
        : sig.capex_pct == null;

      grid.push({ ticker, quarter, status: missingRequired ? 'review' : 'done' });
    }
  }

  return NextResponse.json({ grid });
}
