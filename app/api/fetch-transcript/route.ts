// app/api/fetch-transcript/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ── Company config ────────────────────────────────────────────────────────────

const COMPANIES: Record<string, {
  name: string;
  role: 'vendor' | 'hyperscaler';
  motleyFoolSlug?: string;
  source: 'motleyfool' | 'samsung_ir' | 'skhynix_gurufocus';
}> = {
  SNDK:  { name: 'SanDisk',   role: 'vendor',       source: 'motleyfool',         motleyFoolSlug: 'sandisk-sndk' },
  MU:    { name: 'Micron',    role: 'vendor',        source: 'motleyfool',         motleyFoolSlug: 'micron-mu' },
  SSNLF: { name: 'Samsung',   role: 'vendor',        source: 'samsung_ir' },
  HXSCL: { name: 'SK Hynix', role: 'vendor',        source: 'skhynix_gurufocus' },
  MSFT:  { name: 'Microsoft', role: 'hyperscaler',   source: 'motleyfool',         motleyFoolSlug: 'microsoft-msft' },
  GOOG:  { name: 'Alphabet',  role: 'hyperscaler',   source: 'motleyfool',         motleyFoolSlug: 'alphabet-googl' },
  AMZN:  { name: 'Amazon',    role: 'hyperscaler',   source: 'motleyfool',         motleyFoolSlug: 'amazon-amzn' },
  META:  { name: 'Meta',      role: 'hyperscaler',   source: 'motleyfool',         motleyFoolSlug: 'meta-meta' },
};

// ── Quarter helpers ───────────────────────────────────────────────────────────

function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1
  };
}

// Try current quarter, then walk back up to 4 quarters
function getQuartersToTry(): Array<{ year: number; quarter: number }> {
  const quarters = [];
  let { year, quarter } = getCurrentQuarter();
  for (let i = 0; i < 4; i++) {
    quarters.push({ year, quarter });
    quarter--;
    if (quarter === 0) { quarter = 4; year--; }
  }
  return quarters;
}

// ── Motley Fool fetcher ───────────────────────────────────────────────────────

async function fetchMotleyFool(ticker: string): Promise<{ text: string; url: string } | null> {
  const company = COMPANIES[ticker];
  if (!company?.motleyFoolSlug) return null;

  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  // First: search Motley Fool for the latest transcript URL
  try {
    const searchUrl = `https://www.fool.com/search/solr.aspx?q=${encodeURIComponent(company.name + ' earnings call transcript')}&collection=fool&site=fool&p=1&s=1`;
    const searchRes = await fetch(searchUrl, { headers });
    if (searchRes.ok) {
      const html = await searchRes.text();
      // Look for earnings transcript links
      const matches = html.matchAll(/href="(\/earnings\/call-transcripts\/[\d\/]+-[^"]+transcript[^"]*)"/gi);
      for (const match of matches) {
        const url = `https://www.fool.com${match[1]}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const text = cleanHtml(await res.text());
          if (text.length > 2000) return { text, url };
        }
      }
    }
  } catch (e) {
    console.error('Motley Fool search failed:', e);
  }

  // Fallback: try predictable URL patterns for recent quarters
  const quarters = getQuartersToTry();
  for (const { year, quarter } of quarters) {
    const q = `q${quarter}`;
    const slug = company.motleyFoolSlug;
    const url = `https://www.fool.com/earnings/call-transcripts/${year}/${String(quarter).padStart(2,'0')}/${slug}-${q}-${year}-earnings-call-transcript/`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = cleanHtml(await res.text());
        if (text.length > 2000) return { text, url };
      }
    } catch {}

    // Also try without month padding
    const urlAlt = `https://www.fool.com/earnings/call-transcripts/${year}/${quarter}/${slug}-${q}-${year}-earnings-call-transcript/`;
    try {
      const res = await fetch(urlAlt, { headers });
      if (res.ok) {
        const text = cleanHtml(await res.text());
        if (text.length > 2000) return { text, url: urlAlt };
      }
    } catch {}
  }

  return null;
}

// ── Samsung IR PDF fetcher ────────────────────────────────────────────────────
// Pattern: https://images.samsung.com/is/content/samsung/assets/global/ir/docs/{YEAR}_{Q}Q_conference_eng.pdf

async function fetchSamsungIR(): Promise<{ text: string; url: string } | null> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };
  const quarters = getQuartersToTry();

  for (const { year, quarter } of quarters) {
    const url = `https://images.samsung.com/is/content/samsung/assets/global/ir/docs/${year}_${quarter}Q_conference_eng.pdf`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
        // PDF — extract text using pdf parsing
        const buffer = await res.arrayBuffer();
        const text = await extractPdfText(buffer);
        if (text.length > 500) return { text, url };
      }
    } catch {}
  }
  return null;
}

// ── SK Hynix via GuruFocus ────────────────────────────────────────────────────

async function fetchSKHynixGuruFocus(): Promise<{ text: string; url: string } | null> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  // Search GuruFocus for latest SK Hynix transcript
  try {
    const searchUrl = `https://www.gurufocus.com/search?q=SK+hynix+earnings+call+transcript&type=news`;
    const searchRes = await fetch(searchUrl, { headers });
    if (searchRes.ok) {
      const html = await searchRes.text();
      const match = html.match(/href="(\/news\/\d+\/q\d+-\d+-sk-hynix[^"]+transcript[^"]*)"/i);
      if (match) {
        const url = `https://www.gurufocus.com${match[1]}`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const text = cleanHtml(await res.text());
          if (text.length > 2000) return { text, url };
        }
      }
    }
  } catch (e) {
    console.error('GuruFocus search failed:', e);
  }

  // Fallback: known Q1 2026 URL
  const knownUrls = [
    'https://www.gurufocus.com/news/8811276/q1-2026-sk-hynix-inc-earnings-call-transcript',
  ];

  for (const url of knownUrls) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const text = cleanHtml(await res.text());
        if (text.length > 2000) return { text, url };
      }
    } catch {}
  }

  return null;
}

// ── Manual URL fetcher ────────────────────────────────────────────────────────

async function fetchManualUrl(url: string): Promise<{ text: string; url: string } | null> {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('pdf')) {
      const buffer = await res.arrayBuffer();
      const text = await extractPdfText(buffer);
      if (text.length > 500) return { text, url };
    } else {
      const text = cleanHtml(await res.text());
      if (text.length > 500) return { text, url };
    }
  } catch (e) {
    console.error('Manual URL fetch failed:', e);
  }
  return null;
}

// ── PDF text extraction ───────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Simple PDF text extraction - look for text between BT/ET markers
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

  // If BT/ET extraction yields little, try raw string extraction
  if (text.length < 500) {
    const rawMatches = str.matchAll(/\(([A-Za-z][A-Za-z\s,.'":;!?-]{10,})\)/g);
    for (const m of rawMatches) {
      text += m[1] + ' ';
    }
  }

  return text.substring(0, 80000);
}

// ── HTML cleaner ──────────────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Try to start from transcript content
  const startMarkers = ['Operator:', 'OPERATOR:', 'Good morning', 'Good afternoon', 'Good evening', 'Ladies and gentlemen', 'Thank you for standing by', 'Welcome to'];
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx > 0 && idx < text.length * 0.6) {
      text = text.substring(idx);
      break;
    }
  }

  return text.substring(0, 80000);
}

// ── Main route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { ticker, manualUrl } = await req.json();

    if (!ticker && !manualUrl) {
      return NextResponse.json({ error: 'ticker or manualUrl required' }, { status: 400 });
    }

    // Manual URL always takes priority
    if (manualUrl) {
      const result = await fetchManualUrl(manualUrl);
      if (result) return NextResponse.json({ ...result, source: 'manual', ticker });
      return NextResponse.json({ error: 'Failed to fetch manual URL' }, { status: 422 });
    }

    const company = COMPANIES[ticker];
    if (!company) {
      return NextResponse.json({ error: `Unknown ticker: ${ticker}` }, { status: 400 });
    }

    let result: { text: string; url: string } | null = null;
    let source: 'motleyfool' | 'samsung_ir' | 'skhynix_gurufocus' | 'failed' = company.source;

    // Route to the right fetcher based on company
    if (company.source === 'samsung_ir') {
      result = await fetchSamsungIR();
    } else if (company.source === 'skhynix_gurufocus') {
      result = await fetchSKHynixGuruFocus();
    } else {
      // Motley Fool with Seeking Alpha fallback
      result = await fetchMotleyFool(ticker);
      if (!result) {
        source = 'failed';
      }
    }

    if (result) {
      return NextResponse.json({ ...result, source, ticker });
    }

    return NextResponse.json({
      error: 'All sources failed — use manual URL override',
      ticker,
      source: null
    }, { status: 422 });

  } catch (error) {
    console.error('fetch-transcript error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
