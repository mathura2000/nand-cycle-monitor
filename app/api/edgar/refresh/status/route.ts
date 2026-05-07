import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const US_TICKERS = ['MU', 'AMZN', 'GOOG', 'META', 'MSFT'];

export async function GET() {
  const { data, error } = await supabase
    .from('signals')
    .select('ticker, quarter, capex_actual_usd, extraction_notes')
    .in('ticker', US_TICKERS)
    .order('ticker')
    .order('quarter');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map(r => ({
    ticker: r.ticker,
    quarter: r.quarter,
    has_capex_actual: r.capex_actual_usd !== null,
    extraction_notes: r.extraction_notes ?? null,
  }));

  const summary = {
    total: rows.length,
    populated: rows.filter(r => r.has_capex_actual).length,
    missing: rows.filter(r => !r.has_capex_actual).length,
  };

  return NextResponse.json({ summary, rows });
}
