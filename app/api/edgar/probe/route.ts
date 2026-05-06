import { NextRequest, NextResponse } from 'next/server';

// EDGAR public API — no auth required, but needs a User-Agent header
const EDGAR_HEADERS = {
  'User-Agent': 'nand-cycle-monitor research@personal.com',
  'Accept': 'application/json',
};

// Capex-related XBRL concepts to look for, in priority order
const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'CapitalExpendituresIncurringObligation',
  'PaymentsForCapitalImprovements',
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cik = searchParams.get('cik');
  const ticker = searchParams.get('ticker');

  if (!cik) return NextResponse.json({ error: 'cik param required' }, { status: 400 });

  // EDGAR wants zero-padded 10-digit CIK
  const paddedCik = cik.replace(/^0+/, '').padStart(10, '0');

  try {
    // 1. Fetch company facts (all XBRL reported data)
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
    const factsRes = await fetch(factsUrl, { headers: EDGAR_HEADERS });

    if (!factsRes.ok) {
      return NextResponse.json({
        error: `EDGAR returned ${factsRes.status} for CIK ${paddedCik}`,
        url: factsUrl,
      }, { status: 502 });
    }

    const facts = await factsRes.json();
    const usgaap = facts.facts?.['us-gaap'] ?? {};

    // 2. Find capex concept
    const capexConcept = CAPEX_CONCEPTS.find(c => usgaap[c]);
    const capexData = capexConcept ? usgaap[capexConcept] : null;

    // 3. Extract 10-Q filings (USD units, quarterly form type)
    const capexQuarterly = capexData?.units?.USD
      ?.filter((f: Record<string, unknown>) => f.form === '10-Q')
      ?.slice(-20) // last 20 entries
      ?? null;

    // 4. List all available top-level concepts so user can see what's reported
    const availableConcepts = Object.keys(usgaap).sort();

    // 5. Recent filings index
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    const subRes = await fetch(submissionsUrl, { headers: EDGAR_HEADERS });
    const submissions = subRes.ok ? await subRes.json() : null;

    const recentFilings = submissions?.filings?.recent
      ? (() => {
          const { form, filingDate, accessionNumber } = submissions.filings.recent;
          return form
            .map((f: string, i: number) => ({ form: f, date: filingDate[i], accession: accessionNumber[i] }))
            .filter((f: { form: string }) => f.form === '10-Q' || f.form === '10-K')
            .slice(0, 10);
        })()
      : null;

    return NextResponse.json({
      ticker: ticker ?? cik,
      cik: paddedCik,
      entityName: facts.entityName ?? submissions?.name ?? null,
      capex: {
        conceptUsed: capexConcept ?? null,
        conceptsChecked: CAPEX_CONCEPTS,
        recentQuarterly: capexQuarterly,
      },
      recentFilings,
      availableConceptCount: availableConcepts.length,
      availableConcepts,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
