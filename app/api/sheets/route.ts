// app/api/sheets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

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
    // Local dev — use credentials.json file
    const path = require('path');
    auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), 'credentials.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return google.sheets({ version: 'v4', auth });
}

// GET — read a tab
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
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
