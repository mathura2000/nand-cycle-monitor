// scripts/fill-capex.ts
// Fill missing capex_actual_usd for hyperscalers via EDGAR companyfacts API
// Run: npx tsx scripts/fill-capex.ts
// Does NOT overwrite existing capex_actual_usd values

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

function loadEnv() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envPath = path.join(dir, '.env.local');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim();
      }
      return;
    }
    dir = path.dirname(dir);
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EDGAR_HEADERS = {
  'User-Agent': 'nand-cycle-monitor research@personal.com',
  'Accept': 'application/json',
};

interface EdgarEntry {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}

// Quarter → calendar period mapping
const QUARTER_PERIODS: Record<string, { calStart: string; calEnd: string; frame: string }> = {
  'Q2 2024': { calStart: '2024-04-01', calEnd: '2024-06-30', frame: 'CY2024Q2' },
  'Q3 2024': { calStart: '2024-07-01', calEnd: '2024-09-30', frame: 'CY2024Q3' },
  'Q4 2024': { calStart: '2024-10-01', calEnd: '2024-12-31', frame: 'CY2024Q4' },
  'Q1 2025': { calStart: '2025-01-01', calEnd: '2025-03-31', frame: 'CY2025Q1' },
  'Q2 2025': { calStart: '2025-04-01', calEnd: '2025-06-30', frame: 'CY2025Q2' },
  'Q3 2025': { calStart: '2025-07-01', calEnd: '2025-09-30', frame: 'CY2025Q3' },
  'Q4 2025': { calStart: '2025-10-01', calEnd: '2025-12-31', frame: 'CY2025Q4' },
  'Q1 2026': { calStart: '2026-01-01', calEnd: '2026-03-31', frame: 'CY2026Q1' },
};

async function fetchEntries(cik: string, concept: string): Promise<EdgarEntry[]> {
  const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
  console.log(`  Fetching ${url} concept=${concept}`);
  const res = await fetch(url, { headers: EDGAR_HEADERS });
  if (!res.ok) throw new Error(`EDGAR ${res.status} for CIK ${paddedCik}`);
  const facts = await res.json();
  return facts.facts?.['us-gaap']?.[concept]?.units?.USD ?? [];
}

// For GOOG and META: entries are YTD cumulative from Jan 1 of each calendar year.
// Compute standalone quarterly value by differencing consecutive YTD entries in the same year.
function extractYtdQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calEnd } = QUARTER_PERIODS[quarter];
  const year = calEnd.slice(0, 4);
  const ytdStart = `${year}-01-01`;

  // For Q1 (Jan-Mar), the YTD IS the standalone value — start === ytdStart and end === calEnd
  // For Q2/Q3/Q4, find the YTD ending on calEnd, then subtract the YTD from the prior quarter end

  // Find YTD entry ending on our quarter's end
  const ytdTarget = entries.filter(e =>
    e.start === ytdStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (ytdTarget.length === 0) return null;
  const target = ytdTarget.sort((a, b) => b.filed.localeCompare(a.filed))[0];

  // For Q1, no prior period to subtract
  const calStart = QUARTER_PERIODS[quarter].calStart;
  if (calStart === ytdStart) {
    return { val: target.val, filed: target.filed };
  }

  // Find the prior YTD (ending on the previous quarter's calendar end)
  const prevQEnd = calStart.replace(/(-\d{2})$/, '') // same year, prior quarter end
    // Map the calStart to the prior YTD end date: calStart - 1 day
    ;
  // Prior YTD ends the day before calStart
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

// For AMZN: uses PaymentsToAcquireProductiveAssets
// Q1/Q2/Q3 have direct quarterly entries (90-day period starting on calStart)
// Q4 must be computed: annual (Jan 1 - Dec 31) minus 9M (Jan 1 - Sep 30)
function extractAmznQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calStart, calEnd } = QUARTER_PERIODS[quarter];

  // Try direct standalone quarterly entry first
  const direct = entries.filter(e =>
    e.start === calStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (direct.length > 0) {
    const best = direct.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { val: best.val, filed: best.filed };
  }

  // Q4: compute from annual minus 9M
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

// For MSFT: fiscal year July 1 - June 30
// Q3 2024, Q4 2024, Q1 2025, Q3 2025, Q4 2025, Q1 2026 have direct standalone entries
// Q2 2024 (Apr-Jun = FY2024 Q4): FY2024 annual - 9M FY2024
// Q2 2025 (Apr-Jun = FY2025 Q4): FY2025 annual - 9M FY2025
function extractMsftQuarterly(entries: EdgarEntry[], quarter: string): { val: number; filed: string } | null {
  const { calStart, calEnd } = QUARTER_PERIODS[quarter];

  // Try direct standalone quarterly entry
  const direct = entries.filter(e =>
    e.start === calStart && e.end === calEnd && (e.form === '10-Q' || e.form === '10-K')
  );
  if (direct.length > 0) {
    const best = direct.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { val: best.val, filed: best.filed };
  }

  // For Q2 (Apr-Jun), compute from MSFT fiscal year annual minus 9M
  // MSFT FY runs Jul 1 (prev year) - Jun 30. FY2024 = Jul 2023 - Jun 2024.
  // Q2 2024 = FY2024 Q4: annual (2023-07-01 → 2024-06-30) - 9M (2023-07-01 → 2024-03-31)
  // Q2 2025 = FY2025 Q4: annual (2024-07-01 → 2025-06-30) - 9M (2024-07-01 → 2025-03-31)
  if (calEnd.endsWith('-06-30')) {
    const fyStartYear = (parseInt(calEnd.slice(0, 4)) - 1).toString();
    const fyStart = `${fyStartYear}-07-01`;
    const fyEnd = calEnd; // Jun 30
    const nineMonthEnd = `${calEnd.slice(0, 4)}-03-31`;

    const annual = entries.filter(e =>
      e.start === fyStart && e.end === fyEnd && e.form === '10-K'
    );
    const nineMonth = entries.filter(e =>
      e.start === fyStart && e.end === nineMonthEnd && e.form === '10-Q'
    );
    if (annual.length === 0 || nineMonth.length === 0) return null;
    const ann = annual.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    const nin = nineMonth.sort((a, b) => b.filed.localeCompare(a.filed))[0];
    return { val: ann.val - nin.val, filed: ann.filed };
  }

  return null;
}

interface Target {
  ticker: string;
  cik: string;
  concept: string;
  extractFn: (entries: EdgarEntry[], quarter: string) => { val: number; filed: string } | null;
}

const TARGETS: Target[] = [
  {
    ticker: 'AMZN',
    cik: '0001018724',
    concept: 'PaymentsToAcquireProductiveAssets',
    extractFn: extractAmznQuarterly,
  },
  {
    ticker: 'GOOG',
    cik: '0001652044',
    concept: 'PaymentsToAcquirePropertyPlantAndEquipment',
    extractFn: extractYtdQuarterly,
  },
  {
    ticker: 'META',
    cik: '0001326801',
    concept: 'PaymentsToAcquirePropertyPlantAndEquipment',
    extractFn: extractYtdQuarterly,
  },
  {
    ticker: 'MSFT',
    cik: '0000789019',
    concept: 'PaymentsToAcquirePropertyPlantAndEquipment',
    extractFn: extractMsftQuarterly,
  },
];

async function main() {
  const { data: nullRows, error } = await supabase
    .from('signals')
    .select('ticker, quarter, capex_actual_usd')
    .eq('type', 'hyperscaler')
    .is('capex_actual_usd', null)
    .order('ticker')
    .order('quarter');

  if (error) { console.error('DB error:', error); process.exit(1); }
  console.log(`Found ${nullRows?.length ?? 0} rows with null capex_actual_usd\n`);

  const results: Array<{ ticker: string; quarter: string; val: number; frame: string; filed: string }> = [];
  const missing: Array<{ ticker: string; quarter: string }> = [];

  for (const target of TARGETS) {
    const targetRows = (nullRows ?? []).filter(r => r.ticker === target.ticker);
    if (targetRows.length === 0) {
      console.log(`${target.ticker}: all values already populated, skipping`);
      continue;
    }

    console.log(`${target.ticker}: fetching EDGAR (${targetRows.length} quarters needed)`);
    let entries: EdgarEntry[];
    try {
      entries = await fetchEntries(target.cik, target.concept);
      console.log(`  Got ${entries.length} XBRL entries`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ERROR: ${err}`);
      targetRows.forEach(r => missing.push({ ticker: target.ticker, quarter: r.quarter }));
      continue;
    }

    for (const row of targetRows) {
      const match = target.extractFn(entries, row.quarter);
      if (!match) {
        console.log(`  ${row.quarter}: NO MATCH found`);
        missing.push({ ticker: target.ticker, quarter: row.quarter });
        continue;
      }
      const frame = QUARTER_PERIODS[row.quarter]?.frame ?? row.quarter;
      console.log(`  ${row.quarter}: $${(match.val / 1e9).toFixed(3)}B (filed ${match.filed})`);
      results.push({ ticker: target.ticker, quarter: row.quarter, val: match.val, frame, filed: match.filed });
    }
  }

  console.log(`\n=== Writing ${results.length} values to DB ===`);
  let written = 0;
  for (const r of results) {
    const { error: updateErr } = await supabase
      .from('signals')
      .update({
        capex_actual_usd: r.val,
        edgar_frame: r.frame,
        capex_filed_date: r.filed,
      })
      .eq('ticker', r.ticker)
      .eq('quarter', r.quarter)
      .is('capex_actual_usd', null);

    if (updateErr) {
      console.error(`  FAIL ${r.ticker} ${r.quarter}: ${updateErr.message}`);
    } else {
      console.log(`  OK  ${r.ticker} ${r.quarter}: $${(r.val / 1e9).toFixed(3)}B`);
      written++;
    }
  }

  console.log(`\nWritten: ${written}/${results.length}`);
  if (missing.length > 0) {
    console.log(`\nNot found in EDGAR (need manual entry):`);
    missing.forEach(m => console.log(`  ${m.ticker} ${m.quarter}`));
  }
}

main().catch(console.error);
