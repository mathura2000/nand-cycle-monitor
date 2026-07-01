import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
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

// Fallback: send PDF directly to Claude when naive extraction fails (e.g. Korean PDFs, scanned docs)
async function extractPdfTextWithClaude(base64: string, apiKey: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const content: ContentBlockParam[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    } as ContentBlockParam,
    { type: 'text', text: 'Extract all text from this document. Return only the extracted text, preserving structure. No commentary.' },
  ];
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role: 'user', content }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text.substring(0, 80000) : '';
}

// ── Quarter date validation ───────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function detectTranscriptYear(text: string): number | null {
  // Find 4-digit years in the first 3000 chars; return the most common plausible one
  const snippet = text.substring(0, 3000);
  const hits = [...snippet.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1]));
  if (!hits.length) return null;
  const freq: Record<number, number> = {};
  for (const y of hits) freq[y] = (freq[y] ?? 0) + 1;
  return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

function detectTranscriptMonth(text: string): number | null {
  const snippet = text.substring(0, 3000).toLowerCase();
  for (const [name, month] of Object.entries(MONTHS)) {
    if (snippet.includes(name)) return month;
  }
  return null;
}

// Returns a warning string if the transcript dates don't look right, null if OK
function validateQuarterAlignment(quarter: string, text: string): string | null {
  const [qLabel, yearStr] = quarter.split(' ');
  if (!qLabel || !yearStr) return null;
  const expectedYear = parseInt(yearStr);
  const qNum = parseInt(qLabel.replace('Q', ''));

  const detectedYear = detectTranscriptYear(text);
  const detectedMonth = detectTranscriptMonth(text);

  if (!detectedYear || !detectedMonth) return null;

  // Each calendar quarter spans 3 months; allow ±1 month slippage for offset fiscal years
  const qStartMonth = (qNum - 1) * 3 + 1;
  const qEndMonth = qNum * 3;
  const windowStart = qStartMonth - 2;
  const windowEnd = qEndMonth + 2;

  const yearOk = Math.abs(detectedYear - expectedYear) <= 1;
  const monthOk = detectedMonth >= windowStart && detectedMonth <= windowEnd;

  if (!yearOk) {
    return `Transcript appears to be from ${detectedYear}, but cell is ${quarter} — verify you dropped the right PDF`;
  }
  if (!monthOk) {
    return `Transcript date suggests month ${detectedMonth} (${detectedYear}), which may not align with ${quarter} — verify cell selection`;
  }
  return null;
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

// Known prior-year capex baselines for companies that rarely restate them in calls
const CAPEX_BASELINES: Record<string, string> = {
  MU: 'Micron known baselines: FY2024 capex ≈ $8.4B, FY2023 capex ≈ $7.0B. Fiscal year runs Sep–Aug. If transcript only states FY2025 guidance (~$14B) with no prior-year figure, compute YoY vs FY2024 ($8.4B) → (14/8.4-1)*100 = +67%. If only FY2024 guidance (~$8B) stated, compute vs FY2023 ($7.0B) → +14%.',
  MSFT: 'Microsoft known quarterly capex baselines (calendar Q, includes finance leases): Q2 2023 ≈ $7.8B, Q3 2023 ≈ $8.9B, Q4 2023 ≈ $8.9B, Q1 2024 ≈ $11.2B, Q2 2024 ≈ $11.5B, Q3 2024 ≈ $14.0B, Q4 2024 ≈ $19.0B, Q1 2025 ≈ $20.0B. If transcript states a capex dollar figure without a prior-year comparison, look up the matching prior-year quarter above and compute YoY%.',
};

function buildExtractionPrompt(ticker: string, company: string, quarter: string, type: string, rawText: string): string {
  const capexBaseline = CAPEX_BASELINES[ticker] ? `\nCOMPANY-SPECIFIC CONTEXT: ${CAPEX_BASELINES[ticker]}` : '';

  return `You are extracting structured data from a semiconductor/cloud earnings call transcript.

Company: ${company}
Ticker: ${ticker}
Quarter: ${quarter}
Type: ${type} (vendor = NAND manufacturer, hyperscaler = cloud company)
${capexBaseline}

Extract the following fields. Return ONLY valid JSON, no other text.

IMPORTANT calculation rules:
- For any *_pct field: if the transcript states an explicit percentage (e.g. "up 28%") use that number directly.
  If only dollar figures are given (e.g. "$14B vs $11.5B last year"), CALCULATE the YoY % yourself: round(14/11.5 - 1)*100 = 22.
  Amounts may be in any currency (USD, KRW, etc.) — currency does not matter, only the ratio.
  Only return null if you cannot find ANY relevant dollar or percentage data.
- Round all percentages to one decimal place.

For ALL companies:
- capex_pct: Total CapEx (or infrastructure/data-center spend for hyperscalers) change year-over-year as a number.
  Search the ENTIRE transcript for any of these signals, in order of preference:
  1. Explicit YoY% stated ("capex up 45% year over year") → use directly.
  2. Current quarter dollar + same quarter prior year dollar → compute YoY%.
  3. Full-year or forward guidance vs prior year → compute YoY%. Use COMPANY-SPECIFIC CONTEXT above if prior-year baseline is not in transcript.
  4. YTD capex with explicit YoY comparison (e.g. "YTD capex declined X trillion year-to-year to Y trillion") → compute YoY% as (-X / (Y+X)) * 100.
  5. Sequential (QoQ) data only → use QoQ% as approximation, note in capex_quote.
  6. Directional language → estimate: "substantially higher" = 40, "significantly higher" = 25, "mid to high [range]" = 20, "modest increase" = 10, "roughly flat" = 0, "lower" = -15, "significantly lower" = -30. Ranges like "mid to high KRW 10 trillion" with no prior-year figure = use 20 as a placeholder and note it in capex_quote.
  null ONLY if absolutely no capex direction or dollar figures appear anywhere in the transcript.
- mgmt_tone_score: Management tone 1-5 (1=very bearish, 3=neutral, 5=very bullish). Required — never null.
  Calibrate carefully: 5 = explicit record results + raised guidance + very bullish outlook. 4 = solid beat, positive tone. 3 = in-line, cautious optimism. 2 = miss or warning signs. 1 = major miss, write-downs, demand warnings. Most quarters should be 3–4.
- capex_quote: The exact quote from the transcript that you used to derive capex_pct. null if capex_pct is null.
- mgmt_tone_quote: The exact quote supporting mgmt_tone_score. Required.

For VENDOR companies only (MU, SNDK, SSNLF, HXSCL):
- bit_growth_pct: NAND bit shipment growth YoY as a number. Search for: "NAND bit", "bit shipment", "bit growth", "bit output", "bit supply". Also check for blended/total storage bit growth if NAND-specific not stated.
  Directional: "double digit" = 15, "strong" = 10, "mid-teens" = 15, "mid-single digit" = 5, "low double digit" = 12, "modest" = 5, "flat" = 0, "declined" = -10.
  null only if NAND bits are not discussed at all.
- asp_change_pct: NAND average selling price change — prefer QoQ if stated, else YoY. Directional: "rising" = 5, "flat" = 0, "softening" = -5. null if not discussed.
- inventory_days: Channel or company inventory days as a number. null if not mentioned.
- node_transition_note: One sentence on node/process transition progress. null if not mentioned.
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
      sourceType: 'paste' | 'pdf' | 'url' | 'reextract';
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

    if (sourceType === 'reextract') {
      // Re-run Claude on the already-stored transcript — no fetch needed
      const { data: stored } = await supabase
        .from('transcripts').select('raw_text, source_url')
        .eq('ticker', ticker).eq('quarter', quarter).maybeSingle();
      if (!stored?.raw_text) return NextResponse.json({ error: 'No stored transcript found — ingest first' }, { status: 422 });
      text = stored.raw_text as string;
      sourceUrl = (stored as { raw_text: string; source_url?: string }).source_url ?? null;
    } else if (sourceType === 'paste') {
      text = rawText?.trim() ?? null;
    } else if (sourceType === 'pdf') {
      if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 required for pdf source' }, { status: 400 });
      text = extractPdfText(pdfBase64);
      if (text.length < 200) {
        text = await extractPdfTextWithClaude(pdfBase64, process.env.ANTHROPIC_API_KEY!);
      }
      if (text.length < 200) return NextResponse.json({ error: 'PDF text extraction yielded too little text' }, { status: 422 });
    } else if (sourceType === 'url') {
      if (!url) return NextResponse.json({ error: 'url required for url source' }, { status: 400 });
      text = await fetchUrl(url);
      if (!text) return NextResponse.json({ error: `Failed to fetch transcript from URL: ${url}` }, { status: 422 });
    }

    if (!text) {
      return NextResponse.json({ error: 'No text content could be obtained' }, { status: 422 });
    }

    // 1b. Validate that transcript dates roughly match the expected quarter (warn, don't block)
    const quarterWarning = validateQuarterAlignment(quarter, text);

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
        is_forecast: false, // successful extraction is real sourced data, never a forecast
      };
    }

    // 4. Store signals (forecast-snapshot + rolling-placeholder logic now lives in
    // DB triggers trg_snapshot_forecast_before_update / trg_ensure_rolling_forecast_placeholders)
    const { error: signalsErr } = await supabase.from('signals').upsert(signalsRow, { onConflict: 'ticker,quarter' });

    if (signalsErr) {
      return NextResponse.json({
        status: 'partial',
        message: `Transcript stored but signals write failed: ${signalsErr.message}`,
        ticker, quarter,
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, ticker, quarter, ...(quarterWarning ? { quarterWarning } : {}) });

  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
