// app/api/extract-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildVendorPrompt(ticker: string, transcriptText: string): string {
  return `You are a semiconductor industry analyst extracting structured data from an earnings call transcript.

Company: ${ticker}
Task: Extract the following fields from this NAND vendor earnings call transcript. Return ONLY valid JSON, no preamble, no markdown.

Transcript:
---
${transcriptText.substring(0, 60000)}
---

Return this exact JSON schema (use null for any field not found in the transcript):
{
  "quarter": "Q1 2026",
  "report_date": "YYYY-MM-DD",
  "bit_growth_yoy": <number_percent_or_null>,
  "bit_growth_qoq": <number_percent_or_null>,
  "inventory_days": <number_or_null>,
  "utilization_rate": <number_percent_or_null>,
  "capex_guidance": <number_millions_USD_or_null>,
  "capex_yoy_pct": <number_percent_or_null>,
  "wafer_starts_direction": <"increasing"|"flat"|"decreasing"|null>,
  "node_transition_notes": <string_or_null>,
  "asp_seq_pct": <number_percent_or_null>,
  "asp_yoy_pct": <number_percent_or_null>,
  "pricing_tone": <"rising"|"stable"|"declining"|null>,
  "revenue_yoy": <number_percent_or_null>,
  "datacenter_revenue": <number_millions_USD_or_null>,
  "gross_margin": <number_percent_or_null>,
  "gross_margin_qoq": <number_percent_change_or_null>,
  "rpo": <number_millions_USD_or_null>,
  "contracted_volume_pct": <number_percent_or_null>,
  "mgmt_tone_score": <1_to_5_integer_or_null>,
  "language_flags": <array_of_strings_or_null>,
  "guidance_posture": <"conservative"|"in-line"|"raised"|null>,
  "supply_demand_commentary": <string_max_200_chars_or_null>,
  "key_quotes": [
    {"field": "field_name", "quote": "exact quote from transcript", "page_context": "surrounding context"}
  ]
}

For mgmt_tone_score: 1=very cautious/disciplined, 3=neutral, 5=very aggressive/confident
For language_flags: look for words like "disciplined", "expanding", "constrained", "investing aggressively", "ahead of demand", "supply tightening"
For key_quotes: include the most important 3-5 quotes that drove your scoring decisions`;
}

function buildHyperscalerPrompt(ticker: string, transcriptText: string): string {
  return `You are a semiconductor industry analyst extracting structured data from a hyperscaler earnings call transcript, focused on signals relevant to NAND/storage demand.

Company: ${ticker}
Task: Extract the following fields. Return ONLY valid JSON, no preamble, no markdown.

Transcript:
---
${transcriptText.substring(0, 60000)}
---

Return this exact JSON schema (use null for any field not found):
{
  "quarter": "Q1 2026",
  "report_date": "YYYY-MM-DD",
  "capex_actual": <number_millions_USD_or_null>,
  "capex_qoq_pct": <number_percent_or_null>,
  "capex_fy_guidance": <number_millions_USD_or_null>,
  "capex_intensity_pct": <number_percent_of_revenue_or_null>,
  "datacenter_revenue": <number_millions_USD_or_null>,
  "datacenter_yoy": <number_percent_or_null>,
  "backlog": <number_millions_USD_or_null>,
  "backlog_yoy": <number_percent_or_null>,
  "storage_constraint_tone": <"constrained"|"adequate"|"comfortable"|null>,
  "pull_forward_procurement": <boolean_or_null>,
  "memory_cost_commentary": <string_max_200_chars_or_null>,
  "storage_sufficiency_score": <1_to_5_integer_or_null>,
  "agentic_ai_commentary": <string_max_200_chars_or_null>,
  "inference_vs_training": <"inference_dominant"|"balanced"|"training_dominant"|null>,
  "token_compute_volume": <string_or_null>,
  "vendor_mentions": <array_of_strings_or_null>,
  "key_quotes": [
    {"field": "field_name", "quote": "exact quote from transcript", "page_context": "surrounding context"}
  ]
}

For storage_sufficiency_score: 1=severely constrained, 3=adequate, 5=very comfortable/abundant
Focus on any language about: storage costs, memory procurement, CapEx for storage infrastructure, AI workload storage requirements`;
}

const VENDOR_TICKERS = ['SNDK', 'MU', 'SSNLF', 'HXSCL'];

async function extractWithClaude(ticker: string, transcriptText: string, role: 'vendor' | 'hyperscaler') {
  const prompt = role === 'vendor' 
    ? buildVendorPrompt(ticker, transcriptText)
    : buildHyperscalerPrompt(ticker, transcriptText);

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  
  // Strip any accidental markdown
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function extractWithOpenAI(ticker: string, transcriptText: string, role: 'vendor' | 'hyperscaler') {
  const prompt = role === 'vendor'
    ? buildVendorPrompt(ticker, transcriptText)
    : buildHyperscalerPrompt(ticker, transcriptText);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  const text = data.choices[0].message.content;
  return JSON.parse(text);
}

function compareExtractions(claude: Record<string, unknown>, openai: Record<string, unknown>) {
  const divergences: Array<{
    field: string;
    claude: unknown;
    openai: unknown;
    divergence_magnitude: number | null;
    needs_review: boolean;
  }> = [];

  const allFields = new Set([...Object.keys(claude), ...Object.keys(openai)]);
  allFields.delete('key_quotes'); // Skip quotes comparison

  for (const field of allFields) {
    const c = claude[field];
    const o = openai[field];

    if (c === o) continue;
    if (c === null && o === null) continue;

    let magnitude: number | null = null;
    let needsReview = false;

    if (typeof c === 'number' && typeof o === 'number') {
      magnitude = Math.abs(c - o);
      // Flag if >10% relative difference or >5 absolute
      needsReview = magnitude > 5 || (c !== 0 && magnitude / Math.abs(c) > 0.1);
    } else if (c !== o) {
      needsReview = true;
    }

    divergences.push({
      field,
      claude: c,
      openai: o,
      divergence_magnitude: magnitude,
      needs_review: needsReview
    });
  }

  return divergences;
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, transcriptText, transcriptUrl } = await req.json();

    if (!ticker || !transcriptText) {
      return NextResponse.json({ error: 'ticker and transcriptText required' }, { status: 400 });
    }

    const role = VENDOR_TICKERS.includes(ticker) ? 'vendor' : 'hyperscaler';

    // Run both extractions in parallel
    const [claudeResult, openaiResult] = await Promise.allSettled([
      extractWithClaude(ticker, transcriptText, role),
      extractWithOpenAI(ticker, transcriptText, role)
    ]);

    const claude = claudeResult.status === 'fulfilled' ? claudeResult.value : null;
    const openai = openaiResult.status === 'fulfilled' ? openaiResult.value : null;

    if (!claude && !openai) {
      return NextResponse.json({ error: 'Both extractions failed' }, { status: 500 });
    }

    const divergences = claude && openai ? compareExtractions(claude, openai) : [];
    const flaggedCount = divergences.filter(d => d.needs_review).length;

    return NextResponse.json({
      ticker,
      role,
      transcriptUrl,
      claude,
      openai,
      divergences,
      flagged_count: flaggedCount,
      auto_confirm_count: (claude ? Object.keys(claude).length : 0) - flaggedCount,
      claude_failed: claudeResult.status === 'rejected',
      openai_failed: openaiResult.status === 'rejected',
    });

  } catch (error) {
    console.error('extract-data error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
