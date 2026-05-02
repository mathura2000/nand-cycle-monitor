// app/api/fetch-transcript/route.ts
import { NextRequest, NextResponse } from 'next/server';

const COMPANIES: Record<string, { name: string; motleyFoolSlug: string; seekingAlphaSlug: string }> = {
  SNDK: { name: 'SanDisk', motleyFoolSlug: 'sandisk', seekingAlphaSlug: 'SNDK' },
  MU:   { name: 'Micron', motleyFoolSlug: 'micron-technology', seekingAlphaSlug: 'MU' },
  SSNLF:{ name: 'Samsung', motleyFoolSlug: 'samsung-electronics', seekingAlphaSlug: 'SSNLF' },
  HXSCL:{ name: 'SK Hynix', motleyFoolSlug: 'sk-hynix', seekingAlphaSlug: 'HXSCL' },
  MSFT: { name: 'Microsoft', motleyFoolSlug: 'microsoft', seekingAlphaSlug: 'MSFT' },
  GOOG: { name: 'Alphabet', motleyFoolSlug: 'alphabet', seekingAlphaSlug: 'GOOG' },
  AMZN: { name: 'Amazon', motleyFoolSlug: 'amazon', seekingAlphaSlug: 'AMZN' },
  META: { name: 'Meta', motleyFoolSlug: 'meta-platforms', seekingAlphaSlug: 'META' },
};

async function fetchMotleyFool(ticker: string): Promise<{ text: string; url: string } | null> {
  const company = COMPANIES[ticker];
  if (!company) return null;

  // Search for the latest transcript
  const searchUrl = `https://www.fool.com/search/solr.aspx?q=${encodeURIComponent(company.name + ' earnings call transcript')}&collection=fool&site=fool&p=1&s=1&facet=type:transcript`;
  
  try {
    // Use a direct URL pattern for Motley Fool transcripts
    const year = new Date().getFullYear();
    const quarters = ['q1', 'q2', 'q3', 'q4'];
    const currentQuarter = Math.floor((new Date().getMonth() / 3));
    
    // Try current and previous quarter
    for (let i = currentQuarter; i >= 0; i--) {
      const q = quarters[i];
      const url = `https://www.fool.com/earnings/call-transcripts/${year}/${q}/${company.motleyFoolSlug}-earnings-call-transcript/`;
      
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)' }
      });
      
      if (res.ok) {
        const html = await res.text();
        const text = cleanTranscript(html, 'motleyfool');
        if (text.length > 1000) return { text, url };
      }
    }
  } catch (e) {
    console.error('Motley Fool fetch failed:', e);
  }
  return null;
}

async function fetchSeekingAlpha(ticker: string): Promise<{ text: string; url: string } | null> {
  try {
    const url = `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    
    // Extract first transcript link
    const match = html.match(/href="(\/article\/\d+-[^"]+transcript[^"]*)"/i);
    if (!match) return null;
    
    const transcriptUrl = `https://seekingalpha.com${match[1]}`;
    const transcriptRes = await fetch(transcriptUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)' }
    });
    if (!transcriptRes.ok) return null;
    
    const transcriptHtml = await transcriptRes.text();
    const text = cleanTranscript(transcriptHtml, 'seekingalpha');
    if (text.length > 1000) return { text, url: transcriptUrl };
  } catch (e) {
    console.error('Seeking Alpha fetch failed:', e);
  }
  return null;
}

async function fetchManualUrl(url: string): Promise<{ text: string; url: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-tool/1.0)' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = cleanTranscript(html, 'manual');
    if (text.length > 500) return { text, url };
  } catch (e) {
    console.error('Manual URL fetch failed:', e);
  }
  return null;
}

function cleanTranscript(html: string, source: string): string {
  // Remove script/style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // For transcripts, try to extract just the transcript body
  // Look for common transcript markers
  const startMarkers = [
    'Operator:', 'OPERATOR:', 'Good morning', 'Good afternoon', 'Good evening',
    'Ladies and gentlemen', 'Thank you for standing by'
  ];
  
  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx > 0 && idx < text.length * 0.5) {
      text = text.substring(idx);
      break;
    }
  }

  // Trim to ~80k chars to stay within token limits (transcripts avg ~40k chars)
  return text.substring(0, 80000);
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, manualUrl } = await req.json();

    if (!ticker && !manualUrl) {
      return NextResponse.json({ error: 'ticker or manualUrl required' }, { status: 400 });
    }

    // Manual URL override takes priority
    if (manualUrl) {
      const result = await fetchManualUrl(manualUrl);
      if (result) return NextResponse.json({ ...result, source: 'manual', ticker });
      return NextResponse.json({ error: 'Failed to fetch manual URL' }, { status: 422 });
    }

    // Fallback chain: Motley Fool → Seeking Alpha
    const motley = await fetchMotleyFool(ticker);
    if (motley) return NextResponse.json({ ...motley, source: 'motleyfool', ticker });

    const seeking = await fetchSeekingAlpha(ticker);
    if (seeking) return NextResponse.json({ ...seeking, source: 'seekingalpha', ticker });

    return NextResponse.json({ 
      error: 'All sources failed — use manual URL override',
      ticker,
      source: null 
    }, { status: 422 });

  } catch (error) {
    console.error('fetch-transcript error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
