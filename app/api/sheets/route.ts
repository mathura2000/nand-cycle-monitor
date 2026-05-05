// app/api/sheets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';

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

// GET — read a tab, or action=data for pre-processed page data
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Structured data endpoint used by page components — reads from Supabase
  if (action === 'data') {
    try {
      const [{ data: signalsRows }, { data: configRows }] = await Promise.all([
        supabase.from('signals').select('*').order('quarter', { ascending: true }),
        supabase.from('config').select('ticker, quarter, company, type, default_url'),
      ]);

      type SigRow = Record<string, unknown> & { quarter?: string; extracted_at?: string };
      type CfgRow = Record<string, unknown> & { ticker?: string; quarter?: string; company?: string; type?: string; default_url?: string };

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

      const quarters = [...new Set(signals.map(r => r.quarter as string).filter(Boolean))];
      quarters.sort();
      const latestQuarter = quarters.at(-1) ?? '';

      const latestRows = signals.filter(r => r.quarter === latestQuarter);
      const sourcesCount = latestRows.length;
      const totalSources = 8;

      const dates = latestRows.map(r => r.ingested_at as string).filter(Boolean);
      dates.sort();
      const lastIngested = dates.at(-1) ?? '';

      return NextResponse.json({ signals, config, latestQuarter, sourcesCount, totalSources, lastIngested });
    } catch (error) {
      console.error('Supabase data error:', error);
      return NextResponse.json({ signals: [], config: [], latestQuarter: '', sourcesCount: 0, totalSources: 8, lastIngested: '' });
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
