// app/api/ingest/edgar-hyperscalers/route.ts
// On-demand EDGAR capex refresh for AMZN/GOOG/META/MSFT.
// Writes capex_actual_usd only for rows where it IS NULL — never overwrites.
// Call POST /api/ingest/edgar-hyperscalers from the ingest UI.

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const EDGAR_HEADERS = {
  'User-Agent': 'nand-cycle-monitor research@personal.com',
  'Accept': 'application/json',
};

const QUARTER_PERIODS: Record<string, { calStart: string; calEnd: string; frame: string }> = {
  'Q2 2024': { calStart: '2024-04-01', calEnd: '2024-06-30', frame: 'CY2024Q2' },
  'Q3 2024': { calStart: '2024-07-01', calEnd: '2024-09-30', frame: 'CY2024Q3' },
  'Q4 2024': { calStart: '2024-10-01', calEnd: '2024-12-31', frame: 'CY2024Q4' },
  'Q1 2025': { calStart: '2025-01-01', calEnd: '2025-03-31', frame: 'CY2025Q1' },
  'Q2 2025': { calStart: '2025-04-01', calEnd: '2025-06-30', frame: 'CY2025Q2' },
  'Q3 2025': { calStart: '2025-07-01', calEnd: '2025-09-30', frame: 'CY2025Q3' },
  'Q4 2025': { calStart: '2025-10-01', calEnd: '2025-12-31', frame: 'CY2025Q4' },
  'Q1 2026': { calStart: '2026-01-01', calEnd: '2026-03-31', frame: 'CY2026Q1' },
  'Q2 2026': { calStart: '2026-04-01', calEnd: '2026-06-30', frame: 'CY2026Q2' },
  'Q3 2026': { calStart: '2026-07-01', calEnd: '2026-09-30', frame: 'CY2026Q3' },
  'Q4 2026': { calStart: '2026-10-01', calEnd: '2026-12-31', frame: 'CY2026Q4' },
};

interface EdgarEntry {
  start?: string;
  end: string;
  val: number;
  form: string;
  filed: string;
}

interface Target {
  ticker: string;
  cik: string;
  concept: string;
  extractFn: (entries: EdgarEntry[], quarter: string) => { val: number; filed: string } | null;
}

function extractYtdQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calStart, calEnd } = QUARTER_PERIODS[quarter];
  const year = calEnd.slice(0, 4);
  const ytdStart = `${year}-01-01`;

  const ytdTarget = entries.filter(e =>
    e.start === ytdStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (ytdTarget.length === 0) return null;
  const target = ytdTarget.sort((a, b) => b.filed.localeCompare(a.filed))[0];

  if (calStart === ytdStart) return { val: target.val, filed: target.filed };

  const priorEndDate = new Date(calStart);
  priorEndDate.setDate(priorEndDate.getDate() - 1);
  const priorEnd = priorEndDate.toISOString().slice(0, 10);

  const ytdPrior = entries.filter(e =>
    e.start === ytdStart && e.end === priorEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (ytdPrior.length === 0) return null;
  const prior = ytdPrior.sort((a, b) => b.filed.localeCompare(a.filed))[0];
  return { val: target.val - prior.val, filed: target.filed };
}

function extractAmznQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calStart, calEnd } = QUARTER_PERIODS[quarter];

  const direct = entries.filter(e =>
    e.start === calStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (direct.length > 0) {
    return direct.sort((a, b) => b.filed.localeCompare(a.filed))[0];
  }

  const year = calEnd.slice(0, 4);
  const annual = entries.filter(e =>
    e.start === `${year}-01-01` && e.end === `${year}-12-31` && e.form === '10-K'
  );
  const nineMonth = entries.filter(e =>
    e.start === `${year}-01-01` && e.end === `${year}-09-30` && e.form === '10-Q'
  );
  if (annual.length === 0 || nineMonth.length === 0) return null;
  const ann = annual.sort((a, b) => b.filed.localeCompare(a.filed))[0];
  const nin = nineMonth.sort((a, b) => b.filed.localeCompare(a.filed))[0];
  return { val: ann.val - nin.val, filed: ann.filed };
}

function extractMsftQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calStart, calEnd } = QUARTER_PERIODS[quarter];

  const direct = entries.filter(e =>
    e.start === calStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (direct.length > 0) {
    return direct.sort((a, b) => b.filed.localeCompare(a.filed))[0];
  }

  if (calEnd.endsWith('-06-30')) {
    const fyStartYear = (parseInt(calEnd.slice(0, 4)) - 1).toString();
    const fyStart = `${fyStartYear}-07-01`;
    const nineMonthEnd = `${calEnd.slice(0, 4)}-03-31`;
    const annual = entries.filter(e => e.start === fyStart && e.end === calEnd && e.form === '10-K');
    const nineMonth = entries.filter(e => e.start === fyStart && e.end === nineMonthEnd && e.form === '10-Q');
    if (annual.length === 0 || nineMonth.length === 0) return null;
    const ann = annual.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    const nin = nineMonth.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { val: ann.val - nin.val, filed: ann.filed };
  }

  return null;
}

const TARGETS: Target[] = [
  { ticker: 'AMZN', cik: '0001018724', concept: 'PaymentsToAcquireProductiveAssets', extractFn: extractAmznQuarterly },
  { ticker: 'GOOG', cik: '0001652044', concept: 'PaymentsToAcquirePropertyPlantAndEquipment', extractFn: extractYtdQuarterly },
  { ticker: 'META', cik: '0001326801', concept: 'PaymentsToAcquirePropertyPlantAndEquipment', extractFn: extractYtdQuarterly },
  { ticker: 'MSFT', cik: '0000789019', concept: 'PaymentsToAcquirePropertyPlantAndEquipment', extractFn: extractMsftQuarterly },
];

export async function POST() {
  const refreshedAt = new Date().toISOString();
  const log: string[] = [];

  const { data: nullRows, error } = await supabase
    .from('signals')
    .select('ticker, quarter')
    .eq('type', 'hyperscaler')
    .is('capex_actual_usd', null)
    .order('ticker')
    .order('quarter');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!nullRows || nullRows.length === 0) {
    return NextResponse.json({ message: 'All capex_actual_usd values already populated', refreshedAt, log: [] });
  }

  let written = 0;
  const missing: string[] = [];

  for (const target of TARGETS) {
    const targetRows = nullRows.filter(r => r.ticker === target.ticker);
    if (targetRows.length === 0) continue;

    const paddedCik = target.cik.replace(/^0+/, '').padStart(10, '0');
    let entries: EdgarEntry[];
    try {
      const res = await fetch(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
        { headers: EDGAR_HEADERS }
      );
      if (!res.ok) throw new Error(`EDGAR ${res.status}`);
      const facts = await res.json();
      entries = facts.facts?.['us-gaap']?.[target.concept]?.units?.USD ?? [];
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      log.push(`${target.ticker}: EDGAR fetch failed — ${err}`);
      targetRows.forEach(r => missing.push(`${target.ticker} ${r.quarter}`));
      continue;
    }

    for (const row of targetRows) {
      if (!QUARTER_PERIODS[row.quarter]) {
        missing.push(`${target.ticker} ${row.quarter} (unknown quarter)`);
        continue;
      }
      const match = target.extractFn(entries, row.quarter);
      if (!match) {
        missing.push(`${target.ticker} ${row.quarter}`);
        log.push(`${target.ticker} ${row.quarter}: not yet available in EDGAR`);
        continue;
      }
      const { error: updateErr } = await supabase
        .from('signals')
        .update({
          capex_actual_usd: match.val,
          edgar_frame: QUARTER_PERIODS[row.quarter].frame,
          capex_filed_date: match.filed,
        })
        .eq('ticker', target.ticker)
        .eq('quarter', row.quarter)
        .is('capex_actual_usd', null);

      if (updateErr) {
        log.push(`${target.ticker} ${row.quarter}: DB update failed — ${updateErr.message}`);
      } else {
        written++;
        log.push(`${target.ticker} ${row.quarter}: wrote $${(match.val / 1e9).toFixed(2)}B`);
      }
    }
  }

  return NextResponse.json({ written, missing, refreshedAt, log });
}
