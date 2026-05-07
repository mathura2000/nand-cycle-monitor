import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const EDGAR_UA = 'nand-cycle-monitor contact@nand-cycle-monitor.com';
const CAPEX_CONCEPT = 'PaymentsToAcquirePropertyPlantAndEquipment';
const FRAME_RE = /^CY(\d{4})Q(\d)$/;

const COMPANIES = [
  { ticker: 'MU',   cik: '0000723125', type: 'vendor' },
  { ticker: 'SNDK', cik: null,         type: 'vendor',       skip: true },
  { ticker: 'AMZN', cik: '0001018724', type: 'hyperscaler' },
  { ticker: 'GOOG', cik: '0001652044', type: 'hyperscaler' },
  { ticker: 'META', cik: '0001326801', type: 'hyperscaler' },
  { ticker: 'MSFT', cik: '0000789019', type: 'hyperscaler' },
] as const;

type EdgarRecord = {
  start: string; end: string; val: number;
  form: string; filed: string; frame?: string;
};

// "CY2024Q3" → "Q3 2024"
function parseFrame(frame: string): string | null {
  const m = frame.match(FRAME_RE);
  return m ? `Q${m[2]} ${m[1]}` : null;
}

// Returns the most recently completed calendar quarter as of today
function currentCompletedQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (month <= 3) return `Q4 ${year - 1}`;
  if (month <= 6) return `Q1 ${year}`;
  if (month <= 9) return `Q2 ${year}`;
  return `Q3 ${year}`;
}

// Convert quarter label back to EDGAR frame key e.g. "Q1 2026" → "CY2026Q1"
function quarterToFrame(q: string): string {
  const [qPart, year] = q.split(' ');
  return `CY${year}Q${qPart.replace('Q', '')}`;
}

function daysBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
}

// Produces the YTD label based on how many fiscal quarters are covered
function ytdQuarterLabel(days: number): string {
  return days <= 185 ? 'Q1+Q2' : 'Q1+Q2+Q3';
}

export async function POST() {
  const updated: object[] = [];
  const skipped: object[] = [];
  const pending: object[] = [];
  const errors: object[] = [];

  const mostRecentQ = currentCompletedQuarter();
  const mostRecentFrame = quarterToFrame(mostRecentQ);

  for (const company of COMPANIES) {
    if (('skip' in company && company.skip) || !company.cik) {
      pending.push({ ticker: company.ticker, quarter: null, status: 'NO_EDGAR_CIK' });
      continue;
    }

    try {
      const paddedCik = company.cik.replace(/^0+/, '').padStart(10, '0');
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': EDGAR_UA, 'Accept': 'application/json' },
      });

      if (!res.ok) {
        errors.push({ ticker: company.ticker, error: `EDGAR returned ${res.status}` });
        continue;
      }

      const facts = await res.json();
      const allRecords: EdgarRecord[] =
        facts?.facts?.['us-gaap']?.[CAPEX_CONCEPT]?.units?.USD ?? [];

      // Keep only 10-Q records that have a CY##Q# frame
      const framed = allRecords.filter(
        r => r.form === '10-Q' && r.frame && FRAME_RE.test(r.frame)
      );

      // Deduplicate by frame — keep most recently filed (restated filings)
      const byFrame = new Map<string, EdgarRecord>();
      for (const r of framed) {
        const existing = byFrame.get(r.frame!);
        if (!existing || r.filed > existing.filed) byFrame.set(r.frame!, r);
      }

      // Lag check — flag most recent completed quarter if EDGAR hasn't filed it yet
      if (!byFrame.has(mostRecentFrame)) {
        pending.push({ ticker: company.ticker, quarter: mostRecentQ, status: 'EDGAR_NOT_YET_FILED' });
      }

      for (const [frame, record] of byFrame) {
        const quarter = parseFrame(frame);
        if (!quarter) continue;

        const days = daysBetween(record.start, record.end);
        const isClean = days <= 95;

        // Check signals row
        const { data: row } = await supabase
          .from('signals')
          .select('id, capex_actual_usd')
          .eq('ticker', company.ticker)
          .eq('quarter', quarter)
          .maybeSingle();

        if (!row) {
          skipped.push({ ticker: company.ticker, quarter, reason: 'no signals row — ingest first' });
          continue;
        }

        if (!isClean) {
          // YTD cumulative — record that EDGAR has filed but don't store the value
          const ytdLabel = ytdQuarterLabel(days);
          await supabase.from('signals').update({
            edgar_frame: frame,
            capex_filed_date: record.filed,
            extraction_notes: `EDGAR_XBRL_10Q — YTD cumulative ${ytdLabel}, isolated quarter not stored`,
          }).eq('id', row.id);
          pending.push({ ticker: company.ticker, quarter, status: 'YTD_CUMULATIVE_NEEDS_DERIVATION' });
          continue;
        }

        if (row.capex_actual_usd !== null) {
          skipped.push({ ticker: company.ticker, quarter, reason: 'already populated' });
          continue;
        }

        // Clean single-quarter value — write it
        await supabase.from('signals').update({
          capex_actual_usd: record.val,
          capex_filed_date: record.filed,
          edgar_frame: frame,
          extraction_notes: 'EDGAR_XBRL_10Q — single quarter actual',
        }).eq('id', row.id);

        updated.push({
          ticker: company.ticker,
          quarter,
          capex_actual_usd: record.val,
          capex_filed_date: record.filed,
        });
      }

    } catch (err) {
      errors.push({ ticker: company.ticker, error: String(err) });
    }
  }

  return NextResponse.json({ updated, skipped, pending, errors });
}
