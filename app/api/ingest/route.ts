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
  const full = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();

  // Preserve up to 12k chars from the page header (press release / financial highlights)
  // before the call starts — many transcripts put key capex/revenue figures here.
  const headerSnippet = full.substring(0, 12000);

  const startMarkers = ['Operator:', 'OPERATOR:', 'Good morning', 'Good afternoon', 'Good evening', 'Ladies and gentlemen', 'Thank you for standing by', 'Welcome to'];
  for (const marker of startMarkers) {
    const idx = full.indexOf(marker);
    if (idx > 0 && idx < full.length * 0.8) {
      // Combine header (for financial highlights) + transcript body (for Q&A)
      const transcript = full.substring(idx);
      const combined = headerSnippet + '\n\n--- TRANSCRIPT ---\n\n' + transcript;
      return combined.substring(0, 80000);
    }
  }

  return full.substring(0, 80000);
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


// ── Claude extraction ─────────────────────────────────────────────────────────

function buildExtractionPrompt(ticker: string, company: string, quarter: string, type: string, rawText: string): string {
  return `You are extracting structured data from a semiconductor/cloud earnings call transcript.

Company: ${company}
Ticker: ${ticker}
Quarter: ${quarter}
Type: ${type} (vendor = NAND manufacturer, hyperscaler = cloud company)

Extract the following fields. Return ONLY valid JSON, no other text.

IMPORTANT calculation rules:
- For any *_pct field: if the transcript states an explicit percentage (e.g. "up 28%") use that number directly.
  If only dollar figures are given (e.g. "$14B vs $11.5B last year"), CALCULATE the YoY % yourself: round(14/11.5 - 1)*100 = 22.
  Only return null if you cannot find ANY relevant dollar or percentage data.
- Round all percentages to one decimal place.

For ALL companies:
- capex_pct: Total CapEx (or infrastructure/data-center spend for hyperscalers) change year-over-year as a number.
  Search the ENTIRE transcript for any of these signals, in order of preference:
  1. Explicit YoY% stated ("capex up 45% year over year") → use directly.
  2. Current quarter dollar + same quarter prior year dollar stated in the same call → compute YoY%.
  3. Full-year or forward guidance vs prior year ("$90B in 2025 vs $55B in 2024" or "we guided $60B for the year, last year was $45B") → compute YoY%.
  4. Sequential (QoQ) capex data only → use QoQ% as an approximation (note this in capex_quote).
  5. Management says "substantially higher", "significantly increased", "roughly flat", "pulling back" → estimate: "substantially higher" = 40, "significantly higher" = 25, "modest increase" = 10, "roughly flat" = 0, "lower" = -15, "significantly lower" = -30.
  null ONLY if absolutely no capex direction or dollar figures appear anywhere in the transcript.
- mgmt_tone_score: Management tone 1-5 (1=very bearish, 3=neutral, 5=very bullish). Required — never null.
- capex_quote: The exact quote from the transcript that you used to derive capex_pct. null if capex_pct is null.
- mgmt_tone_quote: The exact quote supporting mgmt_tone_score. Required.

For VENDOR companies only (MU, SNDK, SSNLF, HXSCL):
- bit_growth_pct: NAND bit shipment growth YoY as a number. If only a directional comment ("bit shipments grew double digits", "strong bit growth"), use: "double digit" = 15, "strong" = 10, "modest" = 5, "flat" = 0, "declined" = -10. null only if NAND bits are not discussed at all.
- asp_change_pct: NAND average selling price change — prefer QoQ if stated, else YoY. Compute from dollar figures if needed. Directional only: "rising" = 5, "flat" = 0, "softening" = -5. null if not discussed at all.
- inventory_days: Channel or company inventory days as a number. null if not mentioned.
- node_transition_note: One sentence on node/process transition progress (e.g. "Ramping 232-layer; 60% of bits on 3D NAND"). null if not mentioned.
- bit_growth_quote: Exact quote supporting bit_growth_pct. null if bit_growth_pct is null.
- asp_quote: Exact quote supporting asp_change_pct. null if asp_change_pct is null.
- inventory_quote: Exact quote supporting inventory_days. null if inventory_days is null.

For HYPERSCALER companies only (MSFT, GOOG, AMZN, META):
- bit_growth_pct: null
- asp_change_pct: null
- inventory_days: null
- node_transition_note: null
- bit_growth_quote: null
- asp_quote: null
- inventory_quote: null
- extraction_notes: 1-2 sentences on notable AI infrastructure investment, storage demand signals, or data center spend commentary.

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
    const { ticker, quarter, sourceType, rawText, pdfBase64, url, force } = body as {
      ticker: string;
      quarter: string;
      sourceType: 'paste' | 'pdf' | 'url';
      rawText?: string;
      pdfBase64?: string;
      url?: string;
      force?: boolean;
    };

    if (!ticker || !quarter || !sourceType) {
      return NextResponse.json({ error: 'ticker, quarter, sourceType required' }, { status: 400 });
    }

    const meta = COMPANY_META[ticker];
    if (!meta) {
      return NextResponse.json({ error: `Unknown ticker: ${ticker}` }, { status: 400 });
    }

    // 0. Idempotency check — skip if transcript + valid signals already exist (unless force=true)
    if (!force) {
      const [{ data: existingTranscript }, { data: existingSignal }] = await Promise.all([
        supabase.from('transcripts').select('ticker').eq('ticker', ticker).eq('quarter', quarter).maybeSingle(),
        supabase.from('signals').select('extraction_notes').eq('ticker', ticker).eq('quarter', quarter).maybeSingle(),
      ]);
      const hasTranscript = !!existingTranscript;
      const sig = existingSignal as { extraction_notes?: string | null } | null;
      const hasValidSignals = !!sig && !sig.extraction_notes?.includes('ERROR');
      if (hasTranscript && hasValidSignals) {
        return NextResponse.json({ skipped: true, ticker, quarter, message: 'Data is current in DB — pass force:true to re-extract' });
      }
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

    const now = new Date().toISOString();
    let signalsRow: Record<string, unknown>;
    if (!extracted) {
      signalsRow = {
        ticker, quarter,
        company: meta.name, type: meta.type,
        extracted_at: now,
        extraction_notes: 'ERROR: Claude extraction failed',
        bit_growth_pct: null, capex_pct: null, asp_change_pct: null,
        inventory_days: null, mgmt_tone_score: null, node_transition_note: null,
        bit_growth_quote: null, capex_quote: null, asp_quote: null,
        inventory_quote: null, mgmt_tone_quote: null,
      };
    } else {
      let notes = (extracted.extraction_notes as string | null) ?? null;
      if (typeof extracted !== 'object') {
        notes = 'ERROR: JSON parse failed';
      }
      signalsRow = {
        ticker, quarter,
        company: meta.name, type: meta.type,
        extracted_at: now,
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
