import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

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

// ── HTML → text ───────────────────────────────────────────────────────────────

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

// ── PDF text extraction (base64 input) ───────────────────────────────────────

function extractPdfText(base64: string): string {
  const binary = Buffer.from(base64, 'base64');
  const str = binary.toString('latin1');
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

// ── URL fetch ─────────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('pdf')) {
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      const text = extractPdfText(b64);
      return text.length > 500 ? text : null;
    }

    const html = await res.text();
    const text = cleanHtml(html);
    return text.length > 2000 ? text : null;
  } catch {
    return null;
  }
}

// ── Quarter detection ─────────────────────────────────────────────────────────

function detectQuarter(text: string): string | null {
  // Look for patterns like "Q1 fiscal 2026", "first quarter of fiscal 2026", etc.
  const m =
    text.match(/\b(Q[1-4])\s+(?:fiscal\s+)?(\d{4})\b/i) ||
    text.match(/\b(?:first|second|third|fourth)\s+quarter.*?(\d{4})\b/i);
  if (!m) return null;
  const qMap: Record<string, string> = { first: 'Q1', second: 'Q2', third: 'Q3', fourth: 'Q4' };
  const q = m[1] ? m[1].toUpperCase() : qMap[m[0].split(' ')[0].toLowerCase()];
  const y = m[2] ?? m[1];
  if (!q || !y || !/^\d{4}$/.test(y)) return null;
  return `${q} ${y}`;
}

function quartersMatch(a: string, b: string): boolean {
  return a.toUpperCase().trim() === b.toUpperCase().trim();
}

// ── Claude extraction ─────────────────────────────────────────────────────────

function buildExtractionPrompt(ticker: string, company: string, quarter: string, type: string, rawText: string): string {
  return `You are extracting structured data from a semiconductor earnings call transcript.

Company: ${company}
Ticker: ${ticker}
Quarter: ${quarter}
Type: ${type} (vendor = NAND manufacturer, hyperscaler = cloud company)

Extract the following fields. Return ONLY valid JSON, no other text.

For ALL companies:
- capex_pct: CapEx change year-over-year as a number (e.g. 28 for +28%, -10 for -10%). null if not mentioned.
- mgmt_tone_score: Management tone 1-5 (1=very bearish, 3=neutral, 5=very bullish). Required.
- capex_quote: The exact quote from the transcript supporting capex_pct. null if capex_pct is null.
- mgmt_tone_quote: The exact quote supporting mgmt_tone_score. Required.

For VENDOR companies only (MU, SNDK, SSNLF, HXSCL):
- bit_growth_pct: NAND bit shipment growth YoY as a number. null if not mentioned.
- asp_change_pct: Average selling price change YoY as a number. null if not mentioned.
- inventory_days: Inventory days as a number. null if not mentioned.
- node_transition_note: Brief note on node transition progress. null if not mentioned.
- bit_growth_quote: Exact quote supporting bit_growth_pct.
- asp_quote: Exact quote supporting asp_change_pct.
- inventory_quote: Exact quote supporting inventory_days.

For HYPERSCALER companies only (MSFT, GOOG, AMZN, META):
- bit_growth_pct: null
- asp_change_pct: null
- inventory_days: null
- node_transition_note: null
- bit_growth_quote: null
- asp_quote: null
- inventory_quote: null
- extraction_notes: Any notable commentary about AI infrastructure, storage demand, or data center spend.

Transcript:
${rawText.slice(0, 80000)}

Return JSON only. No markdown, no explanation.`;
}

async function extractWithClaude(
  ticker: string,
  company: string,
  quarter: string,
  type: string,
  rawText: string,
): Promise<Record<string, unknown> | null> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildExtractionPrompt(ticker, company, quarter, type, rawText) }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Claude extraction error:', e);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, quarter, sourceType, rawText, pdfBase64, url } = body as {
      ticker: string;
      quarter: string;
      sourceType: 'paste' | 'pdf' | 'url';
      rawText?: string;
      pdfBase64?: string;
      url?: string;
    };

    if (!ticker || !quarter || !sourceType) {
      return NextResponse.json({ error: 'ticker, quarter, sourceType required' }, { status: 400 });
    }

    const meta = COMPANY_META[ticker];
    if (!meta) {
      return NextResponse.json({ error: `Unknown ticker: ${ticker}` }, { status: 400 });
    }

    // 1. Get raw text based on sourceType
    let text: string | null = null;
    let sourceUrl: string | null = url ?? null;

    if (sourceType === 'paste') {
      text = rawText?.trim() ?? null;
    } else if (sourceType === 'pdf') {
      if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 required for pdf source' }, { status: 400 });
      text = extractPdfText(pdfBase64);
      if (text.length < 200) return NextResponse.json({ error: 'PDF text extraction yielded too little text' }, { status: 422 });
    } else if (sourceType === 'url') {
      if (!url) return NextResponse.json({ error: 'url required for url source' }, { status: 400 });
      text = await fetchUrl(url);
      if (!text) return NextResponse.json({ error: `Failed to fetch transcript from URL: ${url}` }, { status: 422 });
    }

    if (!text) {
      return NextResponse.json({ error: 'No text content could be obtained' }, { status: 422 });
    }

    // Quarter mismatch check (best-effort, non-blocking)
    const detectedQuarter = detectQuarter(text);
    if (detectedQuarter && !quartersMatch(detectedQuarter, quarter)) {
      return NextResponse.json({
        status: 'quarter-mismatch',
        extractedQuarter: detectedQuarter,
        selectedQuarter: quarter,
      });
    }

    // 2. Store transcript (upsert — overwrites if re-ingesting)
    const { error: transcriptErr } = await supabase.from('transcripts').upsert({
      ticker,
      quarter,
      source_type: sourceType,
      source_url: sourceUrl,
      raw_text: text,
    }, { onConflict: 'ticker,quarter' });

    if (transcriptErr) {
      return NextResponse.json({ error: `Failed to store transcript: ${transcriptErr.message}` }, { status: 500 });
    }

    // 3. Extract signals with Claude
    const extracted = await extractWithClaude(ticker, meta.name, quarter, meta.type, text);

    let signalsRow: Record<string, unknown>;
    if (!extracted) {
      signalsRow = {
        ticker, quarter,
        company: meta.name, type: meta.type,
        extraction_notes: 'ERROR: Claude extraction failed',
        bit_growth_pct: null, capex_pct: null, asp_change_pct: null,
        inventory_days: null, mgmt_tone_score: null, node_transition_note: null,
        bit_growth_quote: null, capex_quote: null, asp_quote: null,
        inventory_quote: null, mgmt_tone_quote: null,
      };
    } else {
      let notes = (extracted.extraction_notes as string | null) ?? null;
      // Validate JSON parsed correctly
      if (typeof extracted !== 'object') {
        notes = 'ERROR: JSON parse failed';
      }
      signalsRow = {
        ticker, quarter,
        company: meta.name, type: meta.type,
        bit_growth_pct: extracted.bit_growth_pct ?? null,
        capex_pct: extracted.capex_pct ?? null,
        asp_change_pct: extracted.asp_change_pct ?? null,
        inventory_days: extracted.inventory_days ?? null,
        mgmt_tone_score: extracted.mgmt_tone_score ?? null,
        node_transition_note: extracted.node_transition_note ?? null,
        bit_growth_quote: extracted.bit_growth_quote ?? null,
        capex_quote: extracted.capex_quote ?? null,
        asp_quote: extracted.asp_quote ?? null,
        inventory_quote: extracted.inventory_quote ?? null,
        mgmt_tone_quote: extracted.mgmt_tone_quote ?? null,
        extraction_notes: notes,
      };
    }

    // 4. Store signals
    const { error: signalsErr } = await supabase.from('signals').upsert(signalsRow, { onConflict: 'ticker,quarter' });

    if (signalsErr) {
      return NextResponse.json({
        status: 'partial',
        message: `Transcript stored but signals write failed: ${signalsErr.message}`,
        ticker, quarter,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, ticker, quarter });

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
