// app/api/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';

const SHEET_ID = '1RFYBmGqCeoG0RwcsXZ5HHrCFqa3ViN-J26g-sAAQEDc';

const COMPANY_META: Record<string, { name: string; type: 'vendor' | 'hyperscaler' }> = {
  SNDK:  { name: 'SanDisk',   type: 'vendor' },
  MU:    { name: 'Micron',    type: 'vendor' },
  SSNLF: { name: 'Samsung',   type: 'vendor' },
  HXSCL: { name: 'SK Hynix', type: 'vendor' },
  MSFT:  { name: 'Microsoft', type: 'hyperscaler' },
  GOOG:  { name: 'Alphabet',  type: 'hyperscaler' },
  AMZN:  { name: 'Amazon',    type: 'hyperscaler' },
  META:  { name: 'Meta',      type: 'hyperscaler' },
};

interface ExtractedData {
  bit_growth_pct: number | null;
  capex_pct: number | null;
  asp_change_pct: number | null;
  inventory_days: number | null;
  mgmt_tone_score: number | null;
  node_transition_note: string | null;
  bit_growth_quote: string | null;
  capex_quote: string | null;
  asp_quote: string | null;
  inventory_quote: string | null;
  mgmt_tone_quote: string | null;
}

interface DivergentField {
  field: string;
  claudeValue: number | string | null;
  oaiValue: number | string | null;
  claudeQuote: string | null;
  oaiQuote: string | null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function getSheets() {
  let auth;
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else {
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

// ── Samsung URL construction ──────────────────────────────────────────────────

function samsungPdfUrl(quarter: string): string | null {
  const m = quarter.match(/Q(\d)\s+(\d{4})/i);
  if (!m) return null;
  return `https://images.samsung.com/is/content/samsung/assets/global/ir/docs/${m[2]}_${m[1]}Q_conference_eng.pdf`;
}

// ── PDF text extraction ───────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const str = new TextDecoder('latin1').decode(bytes);
  let text = '';

  const btMatches = str.matchAll(/BT([\s\S]*?)ET/g);
  for (const match of btMatches) {
    const block = match[1];
    const tjMatches = block.matchAll(/\(((?:[^()\\]|\\[\\()nrtbf])*)\)\s*T[jJ]/g);
    for (const tj of tjMatches) {
      text += tj[1].replace(/\\n/g, ' ').replace(/\\\\/g, '\\') + ' ';
    }
  }

  if (text.length < 500) {
    const rawMatches = str.matchAll(/\(([A-Za-z][A-Za-z\s,.'":;!?-]{10,})\)/g);
    for (const m of rawMatches) text += m[1] + ' ';
  }

  return text.substring(0, 80000);
}

// ── Transcript fetch ──────────────────────────────────────────────────────────

async function fetchTranscript(url: string): Promise<{ text: string } | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('pdf')) {
      const buffer = await res.arrayBuffer();
      const text = await extractPdfText(buffer);
      if (text.length > 500) return { text };
      return null;
    }

    const html = await res.text();
    const text = cleanHtml(html);
    if (text.length > 2000) return { text };
    return null;
  } catch {
    return null;
  }
}

function cleanHtml(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();

  const startMarkers = ['Operator:', 'OPERATOR:', 'Good morning', 'Good afternoon', 'Good evening', 'Ladies and gentlemen', 'Thank you for standing by', 'Welcome to'];
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx > 0 && idx < text.length * 0.6) { text = text.substring(idx); break; }
  }

  return text.substring(0, 80000);
}

// ── Extraction ────────────────────────────────────────────────────────────────

const EXTRACT_PROMPT = (ticker: string, text: string) => `You are extracting NAND semiconductor cycle signals from an earnings call transcript.
Company ticker: ${ticker}

Extract ONLY what is explicitly stated. If a value is not mentioned, return null.
Return JSON only — no preamble, no markdown, no code block.

{
  "bit_growth_pct": <number or null>,
  "capex_pct": <number or null>,
  "asp_change_pct": <number or null>,
  "inventory_days": <number or null>,
  "mgmt_tone_score": <1-5 integer or null>,
  "node_transition_note": <string one line or null>,
  "bit_growth_quote": <exact quote or null>,
  "capex_quote": <exact quote or null>,
  "asp_quote": <exact quote or null>,
  "inventory_quote": <exact quote or null>,
  "mgmt_tone_quote": <exact quote or null>
}

Fields:
- bit_growth_pct: NAND bit shipment growth YoY %
- capex_pct: CapEx change YoY % (for hyperscalers: total CapEx YoY %)
- asp_change_pct: ASP change QoQ %
- inventory_days: inventory days on hand
- mgmt_tone_score: 1=very bearish, 5=very bullish
- node_transition_note: one-line summary of any node/layer transition mentioned

Transcript:
${text.substring(0, 70000)}`;

async function extractWithClaude(ticker: string, text: string): Promise<ExtractedData | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: EXTRACT_PROMPT(ticker, text) }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ExtractedData;
  } catch (e) {
    console.error('Claude extraction error:', e);
    return null;
  }
}

async function extractWithOAI(ticker: string, text: string): Promise<ExtractedData | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: EXTRACT_PROMPT(ticker, text) }],
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content) as ExtractedData;
  } catch (e) {
    console.error('OpenAI extraction error:', e);
    return null;
  }
}

// ── Divergence detection ──────────────────────────────────────────────────────

const NUMERIC_FIELDS: (keyof ExtractedData)[] = ['bit_growth_pct', 'capex_pct', 'asp_change_pct', 'inventory_days'];

function findDivergences(claude: ExtractedData, oai: ExtractedData): DivergentField[] {
  const divergences: DivergentField[] = [];

  for (const field of NUMERIC_FIELDS) {
    const a = claude[field] as number | null;
    const b = oai[field] as number | null;
    if (a == null || b == null) continue;
    const denom = Math.max(Math.abs(a), Math.abs(b));
    if (denom > 0 && Math.abs(a - b) / denom > 0.05) {
      const quoteField = (field.replace('_pct', '') + '_quote') as keyof ExtractedData;
      divergences.push({
        field,
        claudeValue: a,
        oaiValue: b,
        claudeQuote: (claude[quoteField] as string | null) ?? null,
        oaiQuote: (oai[quoteField] as string | null) ?? null,
      });
    }
  }

  const ct = claude.mgmt_tone_score;
  const ot = oai.mgmt_tone_score;
  if (ct != null && ot != null && Math.abs(ct - ot) > 1) {
    divergences.push({
      field: 'mgmt_tone_score',
      claudeValue: ct,
      oaiValue: ot,
      claudeQuote: claude.mgmt_tone_quote ?? null,
      oaiQuote: oai.mgmt_tone_quote ?? null,
    });
  }

  return divergences;
}

// ── Write to signals tab ──────────────────────────────────────────────────────

async function saveSignalRow(
  sheets: ReturnType<typeof getSheets>,
  ticker: string,
  quarter: string,
  extracted: ExtractedData,
  transcriptUrl: string,
  runId: string,
) {
  const meta = COMPANY_META[ticker];
  const row: Record<string, string> = {
    run_id: runId,
    quarter,
    ingested_at: new Date().toISOString().split('T')[0],
    company: meta?.name ?? ticker,
    ticker,
    type: meta?.type ?? 'vendor',
    bit_growth_pct: extracted.bit_growth_pct != null ? String(extracted.bit_growth_pct) : '',
    capex_pct: extracted.capex_pct != null ? String(extracted.capex_pct) : '',
    asp_change_pct: extracted.asp_change_pct != null ? String(extracted.asp_change_pct) : '',
    inventory_days: extracted.inventory_days != null ? String(extracted.inventory_days) : '',
    mgmt_tone_score: extracted.mgmt_tone_score != null ? String(extracted.mgmt_tone_score) : '',
    node_transition_note: extracted.node_transition_note ?? '',
    bit_growth_quote: extracted.bit_growth_quote ?? '',
    capex_quote: extracted.capex_quote ?? '',
    asp_quote: extracted.asp_quote ?? '',
    inventory_quote: extracted.inventory_quote ?? '',
    mgmt_tone_quote: extracted.mgmt_tone_quote ?? '',
    transcript_url: transcriptUrl,
  };

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'signals!1:1',
  });
  const headers: string[] = headerRes.data.values?.[0] || [];
  const rowData = headers.map(h => row[h] ?? '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'signals!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [rowData] },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resolve action — save after user picks values
    if (body.action === 'resolve') {
      const { ticker, quarter, fields, transcriptUrl } = body;
      if (!ticker || !quarter || !fields) {
        return NextResponse.json({ error: 'ticker, quarter, fields required' }, { status: 400 });
      }
      const sheets = getSheets();
      const runId = `run_${Date.now()}`;
      await saveSignalRow(sheets, ticker, quarter, fields as ExtractedData, transcriptUrl ?? '', runId);
      return NextResponse.json({ status: 'ingested', ticker, quarter });
    }

    // Main ingest
    const { ticker, quarter, urlOverride } = body;
    if (!ticker || !quarter) {
      return NextResponse.json({ error: 'ticker and quarter required' }, { status: 400 });
    }

    const meta = COMPANY_META[ticker];
    if (!meta) return NextResponse.json({ error: `Unknown ticker: ${ticker}` }, { status: 400 });

    const sheets = getSheets();

    // Get default_url from config
    let defaultUrl = '';
    try {
      const cfgRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'config!A:F' });
      const config = parseTab(cfgRes.data.values || []);
      const row = config.find(r => r.ticker === ticker);
      defaultUrl = row?.default_url ?? '';
    } catch {
      // continue without defaultUrl
    }

    // Determine fetch URL
    let fetchUrl = urlOverride || '';
    if (!fetchUrl) {
      if (ticker === 'SSNLF') {
        fetchUrl = samsungPdfUrl(quarter) ?? defaultUrl;
      } else {
        fetchUrl = defaultUrl;
      }
    }

    if (!fetchUrl) {
      return NextResponse.json({ status: 'needs-url', ticker, quarter, defaultUrl }, { status: 200 });
    }

    // Fetch transcript
    const fetched = await fetchTranscript(fetchUrl);
    if (!fetched) {
      return NextResponse.json({ status: 'needs-url', ticker, quarter, defaultUrl }, { status: 200 });
    }

    // Dual extraction — Claude + OpenAI in parallel
    const [claudeResult, oaiResult] = await Promise.all([
      extractWithClaude(ticker, fetched.text),
      extractWithOAI(ticker, fetched.text),
    ]);

    if (!claudeResult && !oaiResult) {
      return NextResponse.json({ error: 'Both extractions failed', ticker }, { status: 500 });
    }

    // If only one succeeded, use it directly
    if (!claudeResult || !oaiResult) {
      const extracted = claudeResult ?? oaiResult!;
      const runId = `run_${Date.now()}`;
      await saveSignalRow(sheets, ticker, quarter, extracted, fetchUrl, runId);
      return NextResponse.json({ status: 'ingested', ticker, quarter, transcriptUrl: fetchUrl, extracted });
    }

    // Compare
    const divergentFields = findDivergences(claudeResult, oaiResult);

    if (divergentFields.length === 0) {
      const runId = `run_${Date.now()}`;
      await saveSignalRow(sheets, ticker, quarter, claudeResult, fetchUrl, runId);
      return NextResponse.json({ status: 'ingested', ticker, quarter, transcriptUrl: fetchUrl, extracted: claudeResult });
    }

    // Divergence — don't write yet, send back for review
    return NextResponse.json({
      status: 'review',
      ticker,
      quarter,
      transcriptUrl: fetchUrl,
      divergentFields,
      claudeData: claudeResult,
      oaiData: oaiResult,
    });

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
