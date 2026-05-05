// scripts/seed-config.js — run once: node scripts/seed-config.js
// Seeds the Supabase config table with all known transcript URLs.
const fs = require('fs');
const path = require('path');
// Load .env.local manually (dotenv not installed as a dep)
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const QUARTERS = ['Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024'];

const COMPANIES = {
  SNDK:  { company: 'SanDisk',   type: 'vendor' },
  MU:    { company: 'Micron',    type: 'vendor' },
  SSNLF: { company: 'Samsung',   type: 'vendor' },
  HXSCL: { company: 'SK Hynix', type: 'vendor' },
  MSFT:  { company: 'Microsoft', type: 'hyperscaler' },
  GOOG:  { company: 'Alphabet',  type: 'hyperscaler' },
  AMZN:  { company: 'Amazon',    type: 'hyperscaler' },
  META:  { company: 'Meta',      type: 'hyperscaler' },
};

// Confirmed working URLs per ticker per quarter.
// null = row exists but no URL yet (paste/PDF required).
// Omitted entries for SNDK pre-Q1 2026 (pre-IPO — no row inserted).
const URLS = {
  SNDK: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2026/04/30/sandisk-sndk-q3-2026-earnings-transcript/',
    'Q4 2025': 'https://www.fool.com/earnings/call-transcripts/2026/01/29/sandisk-sndk-q2-2026-earnings-call-transcript/',
    'Q3 2025': null, // SNDK Q1 FY2026 — not on Motley Fool, paste manually
    // Q2 2025 and earlier: pre-IPO, no rows
  },
  MU: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2025/12/17/micron-mu-q1-2026-earnings-call-transcript/',
    'Q4 2025': 'https://earningscall.ai/stock/transcript/MU-2025-Q4',
    'Q3 2025': 'https://www.fool.com/earnings/call-transcripts/2025/06/25/micron-mu-q3-2025-earnings-call-transcript/',
    'Q2 2025': 'https://www.fool.com/earnings/call-transcripts/2025/03/20/micron-technology-mu-q2-2025-earnings-call-transcr/',
    'Q1 2025': 'https://www.fool.com/earnings/call-transcripts/2024/12/18/micron-technology-mu-q1-2025-earnings-call-transcr/',
    'Q4 2024': 'https://www.fool.com/earnings/call-transcripts/2024/10/10/micron-technology-mu-q4-2024-earnings-call-transcr/',
    'Q3 2024': 'https://earningscall.ai/stock/transcript/MU-2024-Q3', // fool.com URL 404'd
    'Q2 2024': 'https://earningscall.ai/stock/transcript/MU-2024-Q2', // fool.com URL 404'd
  },
  SSNLF: {
    'Q1 2026': 'https://www.morningstar.com/stocks/xwbo/ssun/earnings-transcript',
    // Historical: PDFs from friend — no URLs yet
    'Q4 2025': null, 'Q3 2025': null, 'Q2 2025': null,
    'Q1 2025': null, 'Q4 2024': null, 'Q3 2024': null, 'Q2 2024': null,
  },
  HXSCL: {
    'Q1 2026': 'https://www.morningstar.com/stocks/xkrx/000660/earnings-transcript',
    // Historical: PDFs from friend — no URLs yet
    'Q4 2025': null, 'Q3 2025': null, 'Q2 2025': null,
    'Q1 2025': null, 'Q4 2024': null, 'Q3 2024': null, 'Q2 2024': null,
  },
  MSFT: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2025/10/29/microsoft-msft-q1-2026-earnings-call-transcript/',
    'Q4 2025': 'https://www.fool.com/earnings/call-transcripts/2025/08/05/microsoft-msft-q4-2025-earnings-call-transcript/',
    'Q3 2025': 'https://earningscall.ai/stock/transcript/MSFT-2025-Q3',
    'Q2 2025': 'https://www.fool.com/earnings/call-transcripts/2025/01/29/microsoft-msft-q2-2025-earnings-call-transcript/',
    'Q1 2025': 'https://www.fool.com/earnings/call-transcripts/2024/10/30/microsoft-msft-q1-2025-earnings-call-transcript/',
    'Q4 2024': 'https://www.fool.com/earnings/call-transcripts/2024/07/30/microsoft-msft-q4-2024-earnings-call-transcript/',
    'Q3 2024': 'https://www.fool.com/earnings/call-transcripts/2024/04/25/microsoft-msft-q3-2024-earnings-call-transcript/',
    'Q2 2024': 'https://earningscall.ai/stock/transcript/MSFT-2024-Q2', // fool.com URL 404'd
  },
  GOOG: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2026/04/29/alphabet-googl-q1-2026-earnings-call-transcript/',
    'Q4 2025': 'https://www.fool.com/earnings/call-transcripts/2026/02/04/alphabet-googl-q4-2025-earnings-call-transcript/',
    'Q3 2025': 'https://www.fool.com/earnings/call-transcripts/2025/10/30/alphabet-goog-q3-2025-earnings-call-transcript/',
    'Q2 2025': 'https://www.fool.com/earnings/call-transcripts/2025/07/23/alphabet-googl-q2-2025-earnings-call-transcript/',
    'Q1 2025': 'https://earningscall.ai/stock/transcript/GOOG-2025-Q1',
    'Q4 2024': 'https://www.fool.com/earnings/call-transcripts/2025/02/05/alphabet-goog-q4-2024-earnings-call-transcript/',
    'Q3 2024': 'https://earningscall.ai/stock/transcript/GOOG-2024-Q3', // fool.com URL 404'd
    'Q2 2024': 'https://www.fool.com/earnings/call-transcripts/2024/07/23/alphabet-googl-q2-2024-earnings-call-transcript/',
  },
  AMZN: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2026/04/29/amazon-amzn-q1-2026-earnings-call-transcript/',
    'Q4 2025': 'https://www.fool.com/earnings/call-transcripts/2026/02/05/amazon-amzn-q4-2025-earnings-call-transcript/',
    'Q3 2025': 'https://www.fool.com/earnings/call-transcripts/2025/10/31/amazon-amzn-q3-2025-earnings-call-transcript/',
    'Q2 2025': 'https://earningscall.ai/stock/transcript/AMZN-2025-Q2',
    'Q1 2025': 'https://earningscall.ai/stock/transcript/AMZN-2025-Q1', // fool.com URL 404'd
    'Q4 2024': 'https://www.fool.com/earnings/call-transcripts/2025/02/06/amazoncom-amzn-q4-2024-earnings-call-transcript/',
    'Q3 2024': 'https://www.fool.com/earnings/call-transcripts/2024/10/31/amazoncom-amzn-q3-2024-earnings-call-transcript/',
    'Q2 2024': 'https://www.fool.com/earnings/call-transcripts/2024/08/01/amazoncom-amzn-q2-2024-earnings-call-transcript/',
  },
  META: {
    'Q1 2026': 'https://www.fool.com/earnings/call-transcripts/2026/04/29/meta-meta-q1-2026-earnings-call-transcript/',
    'Q4 2025': 'https://www.fool.com/earnings/call-transcripts/2026/01/28/meta-meta-q4-2025-earnings-call-transcript/',
    'Q3 2025': 'https://www.fool.com/earnings/call-transcripts/2025/10/29/meta-platforms-meta-q3-2025-earnings-call-transcript/',
    'Q2 2025': 'https://earningscall.ai/stock/transcript/META-2025-Q2',
    'Q1 2025': 'https://earningscall.ai/stock/transcript/META-2025-Q1', // fool.com URL 404'd
    'Q4 2024': 'https://www.fool.com/earnings/call-transcripts/2025/01/29/meta-platforms-meta-q4-2024-earnings-call-transcri/',
    'Q3 2024': 'https://www.fool.com/earnings/call-transcripts/2024/10/30/meta-platforms-meta-q3-2024-earnings-call-transcri/',
    'Q2 2024': 'https://earningscall.ai/stock/transcript/META-2024-Q2', // fool.com URL 404'd
  },
};

// SNDK pre-IPO quarters — do not insert
const SNDK_NA_QUARTERS = new Set(['Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024']);

async function seed() {
  const rows = [];

  for (const [ticker, meta] of Object.entries(COMPANIES)) {
    const urlMap = URLS[ticker] || {};
    for (const quarter of QUARTERS) {
      if (ticker === 'SNDK' && SNDK_NA_QUARTERS.has(quarter)) continue;
      if (!(quarter in urlMap) && ticker === 'SNDK') continue; // Q2 2025 etc already filtered

      rows.push({
        ticker,
        quarter,
        company: meta.company,
        type: meta.type,
        default_url: urlMap[quarter] ?? null,
        notes: null,
      });
    }
  }

  console.log(`Inserting ${rows.length} config rows…`);
  const { error } = await supabase
    .from('config')
    .upsert(rows, { onConflict: 'ticker,quarter' });

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log('Done. Rows upserted:', rows.length);
  rows.forEach(r => console.log(` ${r.ticker} ${r.quarter} → ${r.default_url ?? '(null)'}`));
}

seed();
