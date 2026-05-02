// src/lib/mockData.ts
// Realistic mock data reflecting current cycle state (May 2026 — Strong Expansion, score ~78)
// Swap this out with a real /api/sheets read later — one file change.

export type SignalScore = 'bullish' | 'neutral' | 'bearish';
export type CompanyRole = 'vendor' | 'hyperscaler';
export type CyclePosition = 'Deep Expansion' | 'Mid Expansion' | 'Early Warning' | 'Cycle Turning';
export type CorrelationStatus = 'Not observed' | 'Forming' | 'Emerging' | 'Confirmed';

export interface QuarterlySignal {
  quarter: string; // e.g. "Q1 2026"
  value: number | string | null;
  score: SignalScore;
}

export interface Signal {
  id: string;
  name: string;
  category: 'supply' | 'pricing' | 'demand' | 'qualitative';
  weight: number; // 1–10
  unit: string; // e.g. "%" or "days" or ""
  history: QuarterlySignal[]; // 8 quarters, oldest first
  quote?: string; // latest extracted quote
  transcriptUrl?: string;
}

export interface Company {
  id: string;
  name: string;
  ticker: string;
  role: CompanyRole;
  isPrimary: boolean; // SanDisk only
  compositeScore: number; // 0–100
  compositeDelta: number; // vs prior quarter
  bullishCount: number;
  neutralCount: number;
  bearishCount: number;
  lastIngested: string; // ISO date
  signals: Signal[];
}

export interface CorrelationPair {
  id: string;
  title: string;
  description: string;
  status: CorrelationStatus;
  persistenceQuarters: number; // how many consecutive quarters observed
  confidence: 'Low' | 'Medium' | 'High' | '—';
  interpretation: string;
  balancingContext: string[];
  history: { quarter: string; status: CorrelationStatus }[];
}

export interface CycleRun {
  runDate: string; // ISO date
  quarter: string;
  cycleScore: number;
  cyclePosition: CyclePosition;
  supplyTrajectory: 'Tightening' | 'Stable' | 'Loosening';
  demandTrajectory: 'Accelerating' | 'Stable' | 'Decelerating';
  gatesPassed: number; // out of 4
  sourcesFresh: number; // out of 8
  analystDelta: number; // analyst composite minus hard data composite (negative = analysts more bearish)
  changedSignals: { company: string; signal: string; from: SignalScore; to: SignalScore }[];
  notes?: string;
}

export interface AnalystSource {
  id: string;
  name: string;
  firm: string;
  supplyEstimate: string;
  demandEstimate: string;
  cyclecall: string;
  delta: number; // vs hard data composite — positive = more bullish than data
  quotes: { text: string; sourceUrl: string }[];
  history: { quarter: string; delta: number }[];
}

// ─── QUARTERS ────────────────────────────────────────────────────────────────
const QUARTERS = ['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q1 2026'];

// ─── COMPANIES ───────────────────────────────────────────────────────────────
export const companies: Company[] = [
  {
    id: 'sndk',
    name: 'SanDisk',
    ticker: 'SNDK',
    role: 'vendor',
    isPrimary: true,
    compositeScore: 79,
    compositeDelta: -3,
    bullishCount: 8,
    neutralCount: 4,
    bearishCount: 1,
    lastIngested: '2026-04-20',
    signals: [
      {
        id: 'sndk-bit-growth-yoy',
        name: 'Bit shipment growth YoY',
        category: 'supply',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 8, score: 'neutral' },
          { quarter: 'Q2 2024', value: 14, score: 'bullish' },
          { quarter: 'Q3 2024', value: 22, score: 'bullish' },
          { quarter: 'Q4 2024', value: 28, score: 'bullish' },
          { quarter: 'Q1 2025', value: 31, score: 'bullish' },
          { quarter: 'Q2 2025', value: 29, score: 'bullish' },
          { quarter: 'Q3 2025', value: 26, score: 'bullish' },
          { quarter: 'Q1 2026', value: 24, score: 'neutral' },
        ],
        quote: 'Bit shipments grew approximately 24% year over year, in line with our guidance range.',
      },
      {
        id: 'sndk-inventory-days',
        name: 'Inventory days on hand',
        category: 'supply',
        weight: 8,
        unit: 'days',
        history: [
          { quarter: 'Q1 2024', value: 148, score: 'bearish' },
          { quarter: 'Q2 2024', value: 132, score: 'bearish' },
          { quarter: 'Q3 2024', value: 112, score: 'neutral' },
          { quarter: 'Q4 2024', value: 94, score: 'neutral' },
          { quarter: 'Q1 2025', value: 78, score: 'bullish' },
          { quarter: 'Q2 2025', value: 68, score: 'bullish' },
          { quarter: 'Q3 2025', value: 62, score: 'bullish' },
          { quarter: 'Q1 2026', value: 67, score: 'bullish' },
        ],
        quote: 'Inventory exited the quarter at approximately 67 days, slightly above our target range.',
      },
      {
        id: 'sndk-asp-seq',
        name: 'Sequential ASP change',
        category: 'pricing',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: -8, score: 'bearish' },
          { quarter: 'Q2 2024', value: 2, score: 'neutral' },
          { quarter: 'Q3 2024', value: 7, score: 'bullish' },
          { quarter: 'Q4 2024', value: 9, score: 'bullish' },
          { quarter: 'Q1 2025', value: 11, score: 'bullish' },
          { quarter: 'Q2 2025', value: 8, score: 'bullish' },
          { quarter: 'Q3 2025', value: 5, score: 'bullish' },
          { quarter: 'Q1 2026', value: 2, score: 'neutral' },
        ],
        quote: 'Contract pricing improved approximately 2% sequentially, reflecting continued enterprise SSD demand.',
      },
      {
        id: 'sndk-gross-margin',
        name: 'Gross margin',
        category: 'demand',
        weight: 8,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 12, score: 'bearish' },
          { quarter: 'Q2 2024', value: 18, score: 'neutral' },
          { quarter: 'Q3 2024', value: 26, score: 'neutral' },
          { quarter: 'Q4 2024', value: 34, score: 'bullish' },
          { quarter: 'Q1 2025', value: 38, score: 'bullish' },
          { quarter: 'Q2 2025', value: 41, score: 'bullish' },
          { quarter: 'Q3 2025', value: 43, score: 'bullish' },
          { quarter: 'Q1 2026', value: 42, score: 'bullish' },
        ],
        quote: 'Gross margin of 42.1% reflects strong enterprise mix and disciplined pricing.',
      },
      {
        id: 'sndk-mgmt-tone',
        name: 'Management tone score',
        category: 'qualitative',
        weight: 6,
        unit: '/5',
        history: [
          { quarter: 'Q1 2024', value: 2, score: 'bearish' },
          { quarter: 'Q2 2024', value: 3, score: 'neutral' },
          { quarter: 'Q3 2024', value: 3, score: 'neutral' },
          { quarter: 'Q4 2024', value: 4, score: 'bullish' },
          { quarter: 'Q1 2025', value: 4, score: 'bullish' },
          { quarter: 'Q2 2025', value: 4, score: 'bullish' },
          { quarter: 'Q3 2025', value: 5, score: 'bullish' },
          { quarter: 'Q1 2026', value: 4, score: 'bullish' },
        ],
        quote: 'We remain constructive on the demand environment, particularly in data center and AI inference workloads.',
      },
      {
        id: 'sndk-capex',
        name: 'CapEx guidance YoY',
        category: 'supply',
        weight: 7,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: -22, score: 'bullish' },
          { quarter: 'Q2 2024', value: -15, score: 'bullish' },
          { quarter: 'Q3 2024', value: -8, score: 'bullish' },
          { quarter: 'Q4 2024', value: 4, score: 'neutral' },
          { quarter: 'Q1 2025', value: 12, score: 'neutral' },
          { quarter: 'Q2 2025', value: 18, score: 'neutral' },
          { quarter: 'Q3 2025', value: 24, score: 'bearish' },
          { quarter: 'Q1 2026', value: 28, score: 'bearish' },
        ],
        quote: 'We are increasing technology investment to support node transitions and next-generation capacity.',
      },
    ],
  },
  {
    id: 'mu',
    name: 'Micron',
    ticker: 'MU',
    role: 'vendor',
    isPrimary: false,
    compositeScore: 74,
    compositeDelta: -5,
    bullishCount: 7,
    neutralCount: 4,
    bearishCount: 2,
    lastIngested: '2026-04-02',
    signals: [
      {
        id: 'mu-bit-growth-yoy',
        name: 'Bit shipment growth YoY',
        category: 'supply',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 10, score: 'neutral' },
          { quarter: 'Q2 2024', value: 18, score: 'bullish' },
          { quarter: 'Q3 2024', value: 25, score: 'bullish' },
          { quarter: 'Q4 2024', value: 30, score: 'bullish' },
          { quarter: 'Q1 2025', value: 28, score: 'bullish' },
          { quarter: 'Q2 2025', value: 24, score: 'bullish' },
          { quarter: 'Q3 2025', value: 22, score: 'bullish' },
          { quarter: 'Q1 2026', value: 20, score: 'neutral' },
        ],
        quote: 'NAND bit shipments grew approximately 20% year over year, at the high end of industry estimates.',
      },
      {
        id: 'mu-inventory-days',
        name: 'Inventory days on hand',
        category: 'supply',
        weight: 8,
        unit: 'days',
        history: [
          { quarter: 'Q1 2024', value: 162, score: 'bearish' },
          { quarter: 'Q2 2024', value: 141, score: 'bearish' },
          { quarter: 'Q3 2024', value: 118, score: 'neutral' },
          { quarter: 'Q4 2024', value: 97, score: 'neutral' },
          { quarter: 'Q1 2025', value: 82, score: 'bullish' },
          { quarter: 'Q2 2025', value: 71, score: 'bullish' },
          { quarter: 'Q3 2025', value: 65, score: 'bullish' },
          { quarter: 'Q1 2026', value: 72, score: 'bullish' },
        ],
        quote: 'Inventory days increased modestly to 72 as we built strategic buffer for anticipated H2 demand.',
      },
      {
        id: 'mu-asp-seq',
        name: 'Sequential ASP change',
        category: 'pricing',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: -10, score: 'bearish' },
          { quarter: 'Q2 2024', value: 0, score: 'neutral' },
          { quarter: 'Q3 2024', value: 6, score: 'bullish' },
          { quarter: 'Q4 2024', value: 10, score: 'bullish' },
          { quarter: 'Q1 2025', value: 12, score: 'bullish' },
          { quarter: 'Q2 2025', value: 7, score: 'bullish' },
          { quarter: 'Q3 2025', value: 4, score: 'bullish' },
          { quarter: 'Q1 2026', value: 1, score: 'neutral' },
        ],
        quote: 'NAND ASP improved approximately 1% sequentially as enterprise mix remained strong.',
      },
    ],
  },
  {
    id: 'samsung',
    name: 'Samsung',
    ticker: 'SSNLF',
    role: 'vendor',
    isPrimary: false,
    compositeScore: 61,
    compositeDelta: -8,
    bullishCount: 5,
    neutralCount: 3,
    bearishCount: 5,
    lastIngested: '2026-04-28',
    signals: [
      {
        id: 'samsung-bit-growth-yoy',
        name: 'Bit shipment growth YoY',
        category: 'supply',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 15, score: 'neutral' },
          { quarter: 'Q2 2024', value: 22, score: 'bullish' },
          { quarter: 'Q3 2024', value: 28, score: 'bullish' },
          { quarter: 'Q4 2024', value: 32, score: 'bullish' },
          { quarter: 'Q1 2025', value: 35, score: 'bullish' },
          { quarter: 'Q2 2025', value: 38, score: 'bullish' },
          { quarter: 'Q3 2025', value: 40, score: 'bearish' },
          { quarter: 'Q1 2026', value: 44, score: 'bearish' },
        ],
        quote: 'NAND bit output increased approximately 44% year over year driven by G9 node transition acceleration.',
      },
      {
        id: 'samsung-capex',
        name: 'CapEx guidance YoY',
        category: 'supply',
        weight: 7,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: -10, score: 'bullish' },
          { quarter: 'Q2 2024', value: 5, score: 'neutral' },
          { quarter: 'Q3 2024', value: 18, score: 'neutral' },
          { quarter: 'Q4 2024', value: 24, score: 'bearish' },
          { quarter: 'Q1 2025', value: 31, score: 'bearish' },
          { quarter: 'Q2 2025', value: 36, score: 'bearish' },
          { quarter: 'Q3 2025', value: 38, score: 'bearish' },
          { quarter: 'Q1 2026', value: 42, score: 'bearish' },
        ],
        quote: 'We are accelerating investment in next-generation NAND technology to capture AI storage demand.',
      },
    ],
  },
  {
    id: 'skhynix',
    name: 'SK Hynix',
    ticker: 'HXSCL',
    role: 'vendor',
    isPrimary: false,
    compositeScore: 76,
    compositeDelta: -2,
    bullishCount: 7,
    neutralCount: 4,
    bearishCount: 2,
    lastIngested: '2026-04-25',
    signals: [
      {
        id: 'skh-bit-growth-yoy',
        name: 'Bit shipment growth YoY',
        category: 'supply',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 9, score: 'neutral' },
          { quarter: 'Q2 2024', value: 16, score: 'bullish' },
          { quarter: 'Q3 2024', value: 21, score: 'bullish' },
          { quarter: 'Q4 2024', value: 26, score: 'bullish' },
          { quarter: 'Q1 2025', value: 28, score: 'bullish' },
          { quarter: 'Q2 2025', value: 25, score: 'bullish' },
          { quarter: 'Q3 2025', value: 22, score: 'bullish' },
          { quarter: 'Q1 2026', value: 21, score: 'bullish' },
        ],
        quote: 'NAND bit shipments grew 21% year over year, consistent with our disciplined supply strategy.',
      },
    ],
  },
  {
    id: 'msft',
    name: 'Microsoft',
    ticker: 'MSFT',
    role: 'hyperscaler',
    isPrimary: false,
    compositeScore: 72,
    compositeDelta: -4,
    bullishCount: 6,
    neutralCount: 5,
    bearishCount: 2,
    lastIngested: '2026-04-30',
    signals: [
      {
        id: 'msft-capex',
        name: 'CapEx actual YoY',
        category: 'demand',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 62, score: 'bullish' },
          { quarter: 'Q2 2024', value: 78, score: 'bullish' },
          { quarter: 'Q3 2024', value: 71, score: 'bullish' },
          { quarter: 'Q4 2024', value: 65, score: 'bullish' },
          { quarter: 'Q1 2025', value: 54, score: 'bullish' },
          { quarter: 'Q2 2025', value: 42, score: 'bullish' },
          { quarter: 'Q3 2025', value: 31, score: 'neutral' },
          { quarter: 'Q1 2026', value: 18, score: 'neutral' },
        ],
        quote: 'Capital expenditures grew 18% year over year as we optimize infrastructure spend against workload efficiency gains.',
      },
      {
        id: 'msft-storage-commentary',
        name: 'Storage sufficiency score',
        category: 'demand',
        weight: 7,
        unit: '/5',
        history: [
          { quarter: 'Q1 2024', value: 2, score: 'bullish' },
          { quarter: 'Q2 2024', value: 2, score: 'bullish' },
          { quarter: 'Q3 2024', value: 3, score: 'bullish' },
          { quarter: 'Q4 2024', value: 3, score: 'bullish' },
          { quarter: 'Q1 2025', value: 3, score: 'bullish' },
          { quarter: 'Q2 2025', value: 4, score: 'neutral' },
          { quarter: 'Q3 2025', value: 4, score: 'neutral' },
          { quarter: 'Q1 2026', value: 4, score: 'neutral' },
        ],
        quote: 'We are increasingly satisfied with storage availability and see improved lead times across our supplier base.',
      },
    ],
  },
  {
    id: 'goog',
    name: 'Alphabet',
    ticker: 'GOOG',
    role: 'hyperscaler',
    isPrimary: false,
    compositeScore: 75,
    compositeDelta: -3,
    bullishCount: 7,
    neutralCount: 4,
    bearishCount: 2,
    lastIngested: '2026-04-29',
    signals: [
      {
        id: 'goog-capex',
        name: 'CapEx actual YoY',
        category: 'demand',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 91, score: 'bullish' },
          { quarter: 'Q2 2024', value: 104, score: 'bullish' },
          { quarter: 'Q3 2024', value: 88, score: 'bullish' },
          { quarter: 'Q4 2024', value: 72, score: 'bullish' },
          { quarter: 'Q1 2025', value: 58, score: 'bullish' },
          { quarter: 'Q2 2025', value: 41, score: 'bullish' },
          { quarter: 'Q3 2025', value: 28, score: 'neutral' },
          { quarter: 'Q1 2026', value: 22, score: 'neutral' },
        ],
        quote: 'We invested $17.2B in CapEx this quarter, growth moderating as prior commitments roll into production.',
      },
    ],
  },
  {
    id: 'amzn',
    name: 'Amazon',
    ticker: 'AMZN',
    role: 'hyperscaler',
    isPrimary: false,
    compositeScore: 78,
    compositeDelta: 1,
    bullishCount: 8,
    neutralCount: 4,
    bearishCount: 1,
    lastIngested: '2026-05-01',
    signals: [
      {
        id: 'amzn-capex',
        name: 'CapEx actual YoY',
        category: 'demand',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 55, score: 'bullish' },
          { quarter: 'Q2 2024', value: 68, score: 'bullish' },
          { quarter: 'Q3 2024', value: 81, score: 'bullish' },
          { quarter: 'Q4 2024', value: 74, score: 'bullish' },
          { quarter: 'Q1 2025', value: 62, score: 'bullish' },
          { quarter: 'Q2 2025', value: 55, score: 'bullish' },
          { quarter: 'Q3 2025', value: 48, score: 'bullish' },
          { quarter: 'Q1 2026', value: 38, score: 'bullish' },
        ],
        quote: 'AWS infrastructure investment remains robust. We are committed to our $100B+ 2026 CapEx program.',
      },
    ],
  },
  {
    id: 'meta',
    name: 'Meta',
    ticker: 'META',
    role: 'hyperscaler',
    isPrimary: false,
    compositeScore: 80,
    compositeDelta: 2,
    bullishCount: 8,
    neutralCount: 3,
    bearishCount: 1,
    lastIngested: '2026-04-30',
    signals: [
      {
        id: 'meta-capex',
        name: 'CapEx actual YoY',
        category: 'demand',
        weight: 9,
        unit: '%',
        history: [
          { quarter: 'Q1 2024', value: 48, score: 'bullish' },
          { quarter: 'Q2 2024', value: 62, score: 'bullish' },
          { quarter: 'Q3 2024', value: 74, score: 'bullish' },
          { quarter: 'Q4 2024', value: 82, score: 'bullish' },
          { quarter: 'Q1 2025', value: 78, score: 'bullish' },
          { quarter: 'Q2 2025', value: 71, score: 'bullish' },
          { quarter: 'Q3 2025', value: 65, score: 'bullish' },
          { quarter: 'Q1 2026', value: 58, score: 'bullish' },
        ],
        quote: 'We are accelerating AI infrastructure investment. The Louisiana facility construction is on track.',
      },
    ],
  },
];

// ─── CORRELATION PAIRS ────────────────────────────────────────────────────────
export const correlationPairs: CorrelationPair[] = [
  {
    id: 'supply-demand-gap',
    title: 'Vendor bit growth ↑ + Hyperscaler CapEx ↓',
    description: 'Supply/demand gap narrowing from both sides simultaneously — highest conviction signal',
    status: 'Emerging',
    persistenceQuarters: 1,
    confidence: 'Medium',
    interpretation: 'Supply growth accelerating while demand investment growth moderates. The gap is narrowing but not yet at a critical threshold.',
    balancingContext: [
      'No corroborating inventory deterioration across vendor base',
      'Hyperscaler absolute CapEx remains elevated — only growth rate is slowing',
      'Samsung is the primary driver; SanDisk and SK Hynix remain disciplined',
    ],
    history: [
      { quarter: 'Q1 2024', status: 'Not observed' },
      { quarter: 'Q2 2024', status: 'Not observed' },
      { quarter: 'Q3 2024', status: 'Not observed' },
      { quarter: 'Q4 2024', status: 'Not observed' },
      { quarter: 'Q1 2025', status: 'Not observed' },
      { quarter: 'Q2 2025', status: 'Not observed' },
      { quarter: 'Q3 2025', status: 'Forming' },
      { quarter: 'Q1 2026', status: 'Emerging' },
    ],
  },
  {
    id: 'asp-inventory',
    title: 'ASP flat + Inventory ↑ (same vendor)',
    description: 'That vendor is seeing early cycle turn',
    status: 'Not observed',
    persistenceQuarters: 0,
    confidence: '—',
    interpretation: 'No vendor showing combined price stagnation and inventory build simultaneously. Inventory uptick at SanDisk and Micron is modest and within normal range.',
    balancingContext: [],
    history: QUARTERS.map(q => ({ quarter: q, status: 'Not observed' as CorrelationStatus })),
  },
  {
    id: 'mgmt-tone-capex',
    title: 'Mgmt tone bullish + CapEx guidance ↑',
    description: 'Late cycle psychology forming',
    status: 'Forming',
    persistenceQuarters: 2,
    confidence: 'Medium',
    interpretation: 'Samsung showing aggressive late-cycle investment posture. SanDisk and Micron remain measured. Requires cross-vendor confirmation to escalate.',
    balancingContext: [
      'Samsung historically front-runs the cycle',
      'SanDisk management tone remains disciplined (4/5, not 5/5)',
    ],
    history: [
      { quarter: 'Q1 2024', status: 'Not observed' },
      { quarter: 'Q2 2024', status: 'Not observed' },
      { quarter: 'Q3 2024', status: 'Not observed' },
      { quarter: 'Q4 2024', status: 'Not observed' },
      { quarter: 'Q1 2025', status: 'Not observed' },
      { quarter: 'Q2 2025', status: 'Forming' },
      { quarter: 'Q3 2025', status: 'Forming' },
      { quarter: 'Q1 2026', status: 'Forming' },
    ],
  },
  {
    id: 'spot-contract-divergence',
    title: 'Spot ↘ vs Contract →',
    description: '1–2 quarter leading indicator of cycle turn',
    status: 'Not observed',
    persistenceQuarters: 0,
    confidence: '—',
    interpretation: 'Spot and contract pricing remain broadly aligned. No divergence visible in extracted data. Monitor closely as Samsung supply acceleration could pressure spot rates first.',
    balancingContext: [],
    history: QUARTERS.map(q => ({ quarter: q, status: 'Not observed' as CorrelationStatus })),
  },
];

// ─── CYCLE RUN HISTORY ────────────────────────────────────────────────────────
export const cycleRuns: CycleRun[] = [
  {
    runDate: '2024-02-15',
    quarter: 'Q1 2024',
    cycleScore: 28,
    cyclePosition: 'Cycle Turning',
    supplyTrajectory: 'Loosening',
    demandTrajectory: 'Decelerating',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: -8,
    changedSignals: [],
  },
  {
    runDate: '2024-05-10',
    quarter: 'Q2 2024',
    cycleScore: 38,
    cyclePosition: 'Early Warning',
    supplyTrajectory: 'Stable',
    demandTrajectory: 'Stable',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: 4,
    changedSignals: [],
  },
  {
    runDate: '2024-08-12',
    quarter: 'Q3 2024',
    cycleScore: 52,
    cyclePosition: 'Mid Expansion',
    supplyTrajectory: 'Tightening',
    demandTrajectory: 'Accelerating',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: 6,
    changedSignals: [],
  },
  {
    runDate: '2024-11-08',
    quarter: 'Q4 2024',
    cycleScore: 64,
    cyclePosition: 'Mid Expansion',
    supplyTrajectory: 'Tightening',
    demandTrajectory: 'Accelerating',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: 3,
    changedSignals: [],
  },
  {
    runDate: '2025-02-20',
    quarter: 'Q1 2025',
    cycleScore: 74,
    cyclePosition: 'Deep Expansion',
    supplyTrajectory: 'Tightening',
    demandTrajectory: 'Accelerating',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: -2,
    changedSignals: [],
  },
  {
    runDate: '2025-05-14',
    quarter: 'Q2 2025',
    cycleScore: 80,
    cyclePosition: 'Deep Expansion',
    supplyTrajectory: 'Tightening',
    demandTrajectory: 'Accelerating',
    gatesPassed: 4,
    sourcesFresh: 8,
    analystDelta: -5,
    changedSignals: [],
  },
  {
    runDate: '2025-08-18',
    quarter: 'Q3 2025',
    cycleScore: 81,
    cyclePosition: 'Deep Expansion',
    supplyTrajectory: 'Stable',
    demandTrajectory: 'Accelerating',
    gatesPassed: 4,
    sourcesFresh: 7,
    analystDelta: -9,
    changedSignals: [],
  },
  {
    runDate: '2026-04-20',
    quarter: 'Q1 2026',
    cycleScore: 78,
    cyclePosition: 'Deep Expansion',
    supplyTrajectory: 'Stable',
    demandTrajectory: 'Stable',
    gatesPassed: 4,
    sourcesFresh: 7,
    analystDelta: -14,
    changedSignals: [
      { company: 'Samsung', signal: 'Bit shipment growth YoY', from: 'bullish', to: 'bearish' },
      { company: 'Micron', signal: 'Bit shipment growth YoY', from: 'bullish', to: 'neutral' },
      { company: 'SanDisk', signal: 'Sequential ASP change', from: 'bullish', to: 'neutral' },
      { company: 'Microsoft', signal: 'CapEx actual YoY', from: 'neutral', to: 'neutral' },
    ],
    notes: 'Samsung G9 transition commentary stronger than expected — flagged as primary watch item.',
  },
];

// ─── ANALYST SOURCES ─────────────────────────────────────────────────────────
export const analystSources: AnalystSource[] = [
  {
    id: 'trendforce',
    name: 'TrendForce',
    firm: 'TrendForce',
    supplyEstimate: '+22% industry bit growth 2026',
    demandEstimate: 'Strong AI SSD demand through H2 2026',
    cyclecall: 'Extended upcycle through 2026, risk emerging in 2027',
    delta: -12,
    quotes: [
      { text: 'NAND contract prices expected to hold stable through Q2 2026 before potential softening.', sourceUrl: 'https://trendforce.com' },
      { text: 'Enterprise SSD demand from AI inference remains the key support factor.', sourceUrl: 'https://trendforce.com' },
    ],
    history: [
      { quarter: 'Q1 2024', delta: 4 },
      { quarter: 'Q2 2024', delta: 6 },
      { quarter: 'Q3 2024', delta: 8 },
      { quarter: 'Q4 2024', delta: 5 },
      { quarter: 'Q1 2025', delta: 2 },
      { quarter: 'Q2 2025', delta: -4 },
      { quarter: 'Q3 2025', delta: -8 },
      { quarter: 'Q1 2026', delta: -12 },
    ],
  },
  {
    id: 'idc',
    name: 'IDC Storage',
    firm: 'IDC',
    supplyEstimate: '+19% industry bit growth 2026',
    demandEstimate: 'Solid demand, some consumer softness',
    cyclecall: 'Cycle peak likely Q2–Q3 2026',
    delta: -16,
    quotes: [
      { text: 'Supply discipline among tier-2 vendors remains supportive of pricing in near term.', sourceUrl: 'https://idc.com' },
      { text: 'Consumer NAND softness partially offset by enterprise AI storage strength.', sourceUrl: 'https://idc.com' },
    ],
    history: [
      { quarter: 'Q1 2024', delta: 2 },
      { quarter: 'Q2 2024', delta: 4 },
      { quarter: 'Q3 2024', delta: 6 },
      { quarter: 'Q4 2024', delta: 3 },
      { quarter: 'Q1 2025', delta: -1 },
      { quarter: 'Q2 2025', delta: -6 },
      { quarter: 'Q3 2025', delta: -11 },
      { quarter: 'Q1 2026', delta: -16 },
    ],
  },
  {
    id: 'bernstein',
    name: 'Bernstein Research',
    firm: 'Bernstein',
    supplyEstimate: '+24% industry bit growth 2026',
    demandEstimate: 'AI demand decelerating from peak',
    cyclecall: 'Cautious — cycle turn visible in data by Q3 2026',
    delta: -18,
    quotes: [
      { text: 'Samsung supply acceleration is the key risk to our constructive view on the sector.', sourceUrl: 'https://bernstein.com' },
      { text: 'Hard data from Q1 earnings suggests supply is building faster than consensus expects.', sourceUrl: 'https://bernstein.com' },
    ],
    history: [
      { quarter: 'Q1 2024', delta: -2 },
      { quarter: 'Q2 2024', delta: 0 },
      { quarter: 'Q3 2024', delta: 2 },
      { quarter: 'Q4 2024', delta: -2 },
      { quarter: 'Q1 2025', delta: -5 },
      { quarter: 'Q2 2025', delta: -9 },
      { quarter: 'Q3 2025', delta: -14 },
      { quarter: 'Q1 2026', delta: -18 },
    ],
  },
  {
    id: 'ubs',
    name: 'UBS Semiconductors',
    firm: 'UBS',
    supplyEstimate: '+21% industry bit growth 2026',
    demandEstimate: 'Stable, led by enterprise AI workloads',
    cyclecall: 'Constructive through 2026, monitoring Samsung closely',
    delta: -10,
    quotes: [
      { text: 'Our channel checks suggest enterprise SSD pricing has been stable through April.', sourceUrl: 'https://ubs.com' },
      { text: 'Hyperscaler storage procurement commentary remains positive for the near-term outlook.', sourceUrl: 'https://ubs.com' },
    ],
    history: [
      { quarter: 'Q1 2024', delta: 6 },
      { quarter: 'Q2 2024', delta: 8 },
      { quarter: 'Q3 2024', delta: 10 },
      { quarter: 'Q4 2024', delta: 7 },
      { quarter: 'Q1 2025', delta: 4 },
      { quarter: 'Q2 2025', delta: -1 },
      { quarter: 'Q3 2025', delta: -6 },
      { quarter: 'Q1 2026', delta: -10 },
    ],
  },
];

// ─── CURRENT RUN (convenience export) ────────────────────────────────────────
export const currentRun = cycleRuns[cycleRuns.length - 1];
export const priorRun = cycleRuns[cycleRuns.length - 2];