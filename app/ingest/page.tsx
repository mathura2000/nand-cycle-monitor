'use client';

import { useState } from 'react';

const COMPANIES = [
  { ticker: 'SNDK', name: 'SanDisk', role: 'vendor', primary: true },
  { ticker: 'MU', name: 'Micron', role: 'vendor', primary: false },
  { ticker: 'SSNLF', name: 'Samsung', role: 'vendor', primary: false },
  { ticker: 'HXSCL', name: 'SK Hynix', role: 'vendor', primary: false },
  { ticker: 'MSFT', name: 'Microsoft', role: 'hyperscaler', primary: false },
  { ticker: 'GOOG', name: 'Alphabet', role: 'hyperscaler', primary: false },
  { ticker: 'AMZN', name: 'Amazon', role: 'hyperscaler', primary: false },
  { ticker: 'META', name: 'Meta', role: 'hyperscaler', primary: false },
];

type Phase = 'idle' | 'fetching' | 'extracting' | 'ready' | 'failed';

interface CompanyState {
  phase: Phase;
  transcriptUrl?: string;
  transcriptText?: string;
  source?: string;
  claude?: Record<string, unknown>;
  openai?: Record<string, unknown>;
  divergences?: Array<{ field: string; claude: unknown; openai: unknown; needs_review: boolean }>;
  confirmed?: Record<string, unknown>;
  manualUrl?: string;
  error?: string;
}

interface FlaggedField {
  ticker: string;
  name: string;
  field: string;
  claude: unknown;
  openai: unknown;
  divergence_magnitude: number | null;
  resolved?: 'claude' | 'openai' | 'edit';
  editValue?: string;
}

export default function IngestPage() {
  const [companies, setCompanies] = useState<Record<string, CompanyState>>(
    Object.fromEntries(COMPANIES.map(c => [c.ticker, { phase: 'idle' }]))
  );
  const [semiManual, setSemiManual] = useState('');
  const [runNotes, setRunNotes] = useState('');
  const [flaggedFields, setFlaggedFields] = useState<FlaggedField[]>([]);
  const [phase, setPhase] = useState<'setup' | 'running' | 'review' | 'saving' | 'done'>('setup');
  const [savedRunId, setSavedRunId] = useState<string | null>(null);

  function updateCompany(ticker: string, update: Partial<CompanyState>) {
    setCompanies(prev => ({ ...prev, [ticker]: { ...prev[ticker], ...update } }));
  }

  async function runSingle(ticker: string) {
    const company = COMPANIES.find(c => c.ticker === ticker)!;
    const state = companies[ticker];

    updateCompany(ticker, { phase: 'fetching', error: undefined });

    // Step 1: Fetch transcript
    const fetchRes = await fetch('/api/fetch-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, manualUrl: state.manualUrl || undefined })
    });
    const fetchData = await fetchRes.json();

    if (!fetchRes.ok || !fetchData.text) {
      updateCompany(ticker, { phase: 'failed', error: fetchData.error });
      return;
    }

    updateCompany(ticker, {
      phase: 'extracting',
      transcriptUrl: fetchData.url,
      transcriptText: fetchData.text,
      source: fetchData.source
    });

    // Step 2: Dual extraction
    const extractRes = await fetch('/api/extract-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        transcriptText: fetchData.text,
        transcriptUrl: fetchData.url
      })
    });
    const extractData = await extractRes.json();

    if (!extractRes.ok) {
      updateCompany(ticker, { phase: 'failed', error: extractData.error });
      return;
    }

    // Auto-confirm non-divergent fields
    const confirmed = { ...(extractData.claude || extractData.openai) };

    updateCompany(ticker, {
      phase: 'ready',
      claude: extractData.claude,
      openai: extractData.openai,
      divergences: extractData.divergences,
      confirmed
    });

    // Collect flagged fields
    const newFlags: FlaggedField[] = (extractData.divergences || [])
      .filter((d: { needs_review: boolean }) => d.needs_review)
      .map((d: { field: string; claude: unknown; openai: unknown; divergence_magnitude: number | null }) => ({
        ticker,
        name: company.name,
        field: d.field,
        claude: d.claude,
        openai: d.openai,
        divergence_magnitude: d.divergence_magnitude,
      }));

    setFlaggedFields(prev => [...prev.filter(f => f.ticker !== ticker), ...newFlags]);
  }

  async function runAll() {
    setPhase('running');
    setFlaggedFields([]);
    await Promise.all(COMPANIES.map(c => runSingle(c.ticker)));
    setPhase('review');
  }

  function resolveFlagged(ticker: string, field: string, resolution: 'claude' | 'openai' | 'edit', editValue?: string) {
    setFlaggedFields(prev => prev.map(f =>
      f.ticker === ticker && f.field === field
        ? { ...f, resolved: resolution, editValue }
        : f
    ));

    // Apply resolution to confirmed data
    const state = companies[ticker];
    const value = resolution === 'claude' ? state.claude?.[field]
      : resolution === 'openai' ? state.openai?.[field]
      : editValue;

    updateCompany(ticker, {
      confirmed: { ...state.confirmed, [field]: value }
    });
  }

  async function saveAndScore() {
    setPhase('saving');
    const runId = `run_${Date.now()}`;
    const quarter = companies['MU']?.claude?.['quarter'] as string || 'Unknown';

    // Save each company's confirmed data to Sheets
    for (const company of COMPANIES) {
      const state = companies[company.ticker];
      if (state.phase !== 'ready' || !state.confirmed) continue;

      const tab = company.role === 'vendor' ? 'vendors' : 'hyperscalers';
      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab,
          action: 'append',
          data: {
            ...state.confirmed,
            company: company.name,
            ticker: company.ticker,
            transcript_url: state.transcriptUrl,
            run_id: runId,
            confirmed_at: new Date().toISOString(),
            run_notes: runNotes
          }
        })
      });
    }

    // Save SEMI BBB if entered
    if (semiManual) {
      const bbb = parseFloat(semiManual);
      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tab: 'semi_bbb',
          action: 'append',
          data: {
            month: new Date().toISOString().substring(0, 7),
            book_to_bill: bbb,
            interpretation: bbb < 0.9 ? 'Bullish' : bbb < 1.0 ? 'Neutral' : 'Bearish',
            entered_at: new Date().toISOString()
          }
        })
      });
    }

    // Read config for weights
    const configRes = await fetch('/api/sheets?tab=config');
    const configData = await configRes.json();

    // Run scoring
    const vendorRows = COMPANIES
      .filter(c => c.role === 'vendor')
      .map(c => ({ ...companies[c.ticker]?.confirmed, company: c.name, ticker: c.ticker }))
      .filter(r => r.company);

    const hyperscalerRows = COMPANIES
      .filter(c => c.role === 'hyperscaler')
      .map(c => ({ ...companies[c.ticker]?.confirmed, company: c.name, ticker: c.ticker }))
      .filter(r => r.company);

    const scoreRes = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendorRows,
        hyperscalerRows,
        semiLatest: semiManual || null,
        configRows: configData.rows,
        quarter,
        runId
      })
    });
    const scoreData = await scoreRes.json();

    // Save cycle score
    await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tab: 'cycle_scores',
        action: 'append',
        data: {
          ...scoreData,
          sources_current: COMPANIES.filter(c => companies[c.ticker]?.phase === 'ready').length,
          sources_total: COMPANIES.length,
          run_notes: runNotes
        }
      })
    });

    setSavedRunId(runId);
    setPhase('done');
  }

  const allReady = COMPANIES.every(c =>
    companies[c.ticker].phase === 'ready' || companies[c.ticker].phase === 'failed'
  );
  const unresolvedFlags = flaggedFields.filter(f => !f.resolved);
  const phaseLabel: Record<Phase, string> = {
    idle: 'Waiting',
    fetching: 'Fetching transcript…',
    extracting: 'Extracting (Claude + GPT)…',
    ready: 'Ready',
    failed: 'Failed'
  };
  const phaseColor: Record<Phase, string> = {
    idle: 'text-slate-500',
    fetching: 'text-amber-400',
    extracting: 'text-indigo-400',
    ready: 'text-emerald-400',
    failed: 'text-red-400'
  };

  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-200 p-6 font-sans">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Data Ingestion</h1>
            <p className="text-sm text-slate-500 mt-1">Fetch transcripts → Extract → Review → Score</p>
          </div>
          {phase === 'setup' && (
            <button
              onClick={runAll}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors"
            >
              Run All
            </button>
          )}
          {phase === 'review' && allReady && (
            <button
              onClick={saveAndScore}
              disabled={unresolvedFlags.length > 0}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors"
            >
              {unresolvedFlags.length > 0
                ? `Resolve ${unresolvedFlags.length} flags first`
                : 'Save & Score'}
            </button>
          )}
        </div>

        {/* Company grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {COMPANIES.map(company => {
            const state = companies[company.ticker];
            return (
              <div
                key={company.ticker}
                className={`bg-[#111520] rounded-lg p-4 border ${
                  company.primary ? 'border-indigo-500/40' : 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{company.name}</span>
                      {company.primary && (
                        <span className="text-xs px-1.5 py-0.5 bg-indigo-900/40 text-indigo-400 rounded">PRIMARY</span>
                      )}
                      <span className="text-xs text-slate-600">{company.role}</span>
                    </div>
                    <div className={`text-xs mt-1 ${phaseColor[state.phase]}`}>
                      {phaseLabel[state.phase]}
                    </div>
                    {state.error && (
                      <div className="text-xs text-red-400 mt-1">{state.error}</div>
                    )}
                  </div>
                  {state.phase === 'ready' && (
                    <div className="text-right">
                      <div className="text-xs text-slate-500">
                        {state.divergences?.filter(d => d.needs_review).length || 0} flags
                      </div>
                      <div className="text-xs text-slate-600">{state.source}</div>
                    </div>
                  )}
                </div>

                {/* Manual URL input for failed */}
                {state.phase === 'failed' && (
                  <div className="mt-3">
                    <input
                      type="url"
                      placeholder="Paste transcript URL manually…"
                      className="w-full text-xs bg-[#0a0d12] border border-slate-700 rounded px-2 py-1.5 text-slate-300 placeholder-slate-600"
                      value={state.manualUrl || ''}
                      onChange={e => updateCompany(company.ticker, { manualUrl: e.target.value })}
                    />
                    <button
                      onClick={() => runSingle(company.ticker)}
                      className="mt-1.5 text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Progress bar */}
                {(state.phase === 'fetching' || state.phase === 'extracting') && (
                  <div className="mt-3 h-0.5 bg-slate-800 rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-500 ${
                        state.phase === 'fetching' ? 'w-1/3 bg-amber-500' : 'w-2/3 bg-indigo-500'
                      } animate-pulse`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SEMI BBB + Run Notes */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-[#111520] rounded-lg p-4 border border-slate-800">
            <label className="text-xs text-slate-500 block mb-2">SEMI Book-to-Bill (manual entry)</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 1.05"
              className="w-full text-sm font-mono bg-[#0a0d12] border border-slate-700 rounded px-3 py-2 text-slate-200 placeholder-slate-600"
              value={semiManual}
              onChange={e => setSemiManual(e.target.value)}
            />
            {semiManual && (
              <div className="text-xs mt-1.5 text-slate-500">
                {parseFloat(semiManual) < 0.9 ? '→ Bullish (equipment orders slowing)'
                  : parseFloat(semiManual) < 1.0 ? '→ Neutral'
                  : '→ Bearish (capacity expansion underway)'}
              </div>
            )}
          </div>
          <div className="bg-[#111520] rounded-lg p-4 border border-slate-800">
            <label className="text-xs text-slate-500 block mb-2">Run Notes (optional)</label>
            <textarea
              placeholder="Context not captured in data (e.g. tariff announcement this week)…"
              className="w-full text-sm bg-[#0a0d12] border border-slate-700 rounded px-3 py-2 text-slate-200 placeholder-slate-600 resize-none"
              rows={3}
              value={runNotes}
              onChange={e => setRunNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Flagged fields review */}
        {phase === 'review' && flaggedFields.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-300">
                Flagged Fields — {unresolvedFlags.length} of {flaggedFields.length} remaining
              </h2>
              <div className="text-xs text-slate-500">
                Both models disagree — review and accept one or edit
              </div>
            </div>

            <div className="space-y-2">
              {flaggedFields.map(flag => (
                <div
                  key={`${flag.ticker}-${flag.field}`}
                  className={`bg-[#111520] border rounded-lg p-4 ${
                    flag.resolved ? 'border-emerald-900/40 opacity-60' : 'border-amber-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs px-1.5 py-0.5 bg-slate-800 rounded font-mono text-indigo-400">
                          {flag.ticker}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{flag.field}</span>
                        {flag.divergence_magnitude !== null && (
                          <span className="text-xs text-amber-500">Δ {flag.divergence_magnitude.toFixed(1)}</span>
                        )}
                        {flag.resolved && (
                          <span className="text-xs text-emerald-500">✓ resolved</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className={`bg-[#0a0d12] rounded p-2 border ${
                          flag.resolved === 'claude' ? 'border-emerald-600' : 'border-slate-800'
                        }`}>
                          <div className="text-slate-500 mb-1">Claude</div>
                          <div className="font-mono text-slate-200">{String(flag.claude ?? 'null')}</div>
                        </div>
                        <div className={`bg-[#0a0d12] rounded p-2 border ${
                          flag.resolved === 'openai' ? 'border-emerald-600' : 'border-slate-800'
                        }`}>
                          <div className="text-slate-500 mb-1">OpenAI</div>
                          <div className="font-mono text-slate-200">{String(flag.openai ?? 'null')}</div>
                        </div>
                      </div>
                    </div>
                    {!flag.resolved && (
                      <div className="flex flex-col gap-1.5 min-w-fit">
                        <button
                          onClick={() => resolveFlagged(flag.ticker, flag.field, 'claude')}
                          className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 whitespace-nowrap"
                        >
                          Accept Claude
                        </button>
                        <button
                          onClick={() => resolveFlagged(flag.ticker, flag.field, 'openai')}
                          className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 whitespace-nowrap"
                        >
                          Accept OpenAI
                        </button>
                        <button
                          onClick={() => {
                            const val = prompt(`Enter value for ${flag.field}:`);
                            if (val !== null) resolveFlagged(flag.ticker, flag.field, 'edit', val);
                          }}
                          className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done state */}
        {phase === 'done' && savedRunId && (
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-6 text-center">
            <div className="text-emerald-400 text-lg mb-2">✓ Run Complete</div>
            <div className="text-slate-400 text-sm">
              Run ID: <span className="font-mono text-slate-300">{savedRunId}</span>
            </div>
            <div className="text-slate-500 text-xs mt-1">Data saved to Sheets · Cycle score computed</div>
            <a
              href="/"
              className="mt-4 inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300"
            >
              View Dashboard →
            </a>
          </div>
        )}

        {/* Saving state */}
        {phase === 'saving' && (
          <div className="text-center py-8 text-slate-500 text-sm">
            Saving to Sheets and computing cycle score…
          </div>
        )}
      </div>
    </div>
  );
}
