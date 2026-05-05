'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CellStatus = 'done' | 'empty' | 'error' | 'review' | 'na';

interface GridCell {
  ticker: string;
  quarter: string;
  status: CellStatus;
}

const TICKERS = ['SNDK', 'MU', 'SSNLF', 'HXSCL', 'MSFT', 'GOOG', 'AMZN', 'META'];
const QUARTERS = ['Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024'];
const QUARTER_LABELS = ['Q1/26', 'Q4/25', 'Q3/25', 'Q2/25', 'Q1/25', 'Q4/24', 'Q3/24', 'Q2/24'];

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

const SNDK_NA = new Set(['Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024', 'Q2 2024']);

// ── Status cell rendering ─────────────────────────────────────────────────────

function CellIcon({ status }: { status: CellStatus }) {
  if (status === 'done')   return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2a5a32' }} />;
  if (status === 'empty')  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#1a1812', border: '0.5px solid #2a2820' }} />;
  if (status === 'error')  return <span style={{ color: '#6a2020', fontSize: 11 }}>✕</span>;
  if (status === 'review') return <span style={{ color: '#6a5020', fontSize: 11 }}>▲</span>;
  return <span style={{ color: '#1e1c18', fontSize: 10 }}>—</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface BatchProgress {
  done: number;
  errors: number;
  total: number;
  current: string;
  finished: boolean;
}

export default function IngestPage() {
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string>('SNDK');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('Q1 2026');
  const [defaultUrl, setDefaultUrl] = useState<string>('');
  const [urlOverride, setUrlOverride] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [naTooltip, setNaTooltip] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchProgress | null>(null);

  // Company dropdown open state
  const [companyOpen, setCompanyOpen] = useState(false);
  const [quarterOpen, setQuarterOpen] = useState(false);

  const loadGrid = useCallback(async () => {
    try {
      const res = await fetch('/api/ingest/status');
      const data = await res.json();
      setGrid(data.grid ?? []);
    } catch {
      // leave grid empty
    }
  }, []);

  const loadDefaultUrl = useCallback(async (ticker: string, quarter: string) => {
    try {
      const res = await fetch(`/api/ingest/config?ticker=${ticker}&quarter=${encodeURIComponent(quarter)}`);
      const data = await res.json();
      setDefaultUrl(data.defaultUrl ?? '');
      setUrlOverride('');
    } catch {
      setDefaultUrl('');
    }
  }, []);

  useEffect(() => { loadGrid(); }, [loadGrid]);

  useEffect(() => {
    loadDefaultUrl(selectedTicker, selectedQuarter);
    setPasteText('');
    setPdfFile(null);
    setStatus('');
  }, [selectedTicker, selectedQuarter, loadDefaultUrl]);

  function cellStatus(ticker: string, quarter: string): CellStatus {
    return grid.find(c => c.ticker === ticker && c.quarter === quarter)?.status ?? 'empty';
  }

  function handleCellClick(ticker: string, quarter: string) {
    if (ticker === 'SNDK' && SNDK_NA.has(quarter)) {
      setNaTooltip(`${ticker} · ${quarter}`);
      setTimeout(() => setNaTooltip(null), 3000);
      return;
    }
    setSelectedTicker(ticker);
    setSelectedQuarter(quarter);
    setCompanyOpen(false);
    setQuarterOpen(false);
  }

  async function handleIngest() {
    setLoading(true);
    setStatus('');

    try {
      let sourceType: 'paste' | 'pdf' | 'url';
      let body: Record<string, unknown> = { ticker: selectedTicker, quarter: selectedQuarter };

      if (pasteText.trim()) {
        sourceType = 'paste';
        body = { ...body, sourceType, rawText: pasteText.trim() };
      } else if (pdfFile) {
        sourceType = 'pdf';
        const b64 = await fileToBase64(pdfFile);
        body = { ...body, sourceType, pdfBase64: b64 };
      } else {
        const fetchUrl = urlOverride.trim() || defaultUrl;
        if (!fetchUrl) {
          setStatus('No input: paste text, upload PDF, or enter a URL.');
          setLoading(false);
          return;
        }
        sourceType = 'url';
        body = { ...body, sourceType, url: fetchUrl };
      }

      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.status === 'quarter-mismatch') {
        setStatus(`Quarter mismatch: transcript looks like ${data.extractedQuarter} but you selected ${data.selectedQuarter}. Re-run to confirm.`);
        // Re-send with the selected quarter (force through)
      } else if (data.success) {
        setStatus('✓ Ingested successfully.');
        setPasteText('');
        setPdfFile(null);
        await loadGrid();
      } else {
        setStatus(`Error: ${data.error ?? 'Unknown error'}`);
      }
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    }

    setLoading(false);
  }

  async function handleIngestAll() {
    setBatch({ done: 0, errors: 0, total: 0, current: 'Loading config…', finished: false });

    // Fetch all config rows with a default URL
    let configRows: { ticker: string; quarter: string; default_url: string }[] = [];
    try {
      const res = await fetch('/api/sheets?action=data');
      const data = await res.json();
      configRows = (data.config ?? []).filter((r: { default_url: string }) => r.default_url);
    } catch {
      setBatch(b => b ? { ...b, current: 'Failed to load config', finished: true } : null);
      return;
    }

    // Load current grid to skip already-done cells
    let currentGrid: GridCell[] = [];
    try {
      const res = await fetch('/api/ingest/status');
      const data = await res.json();
      currentGrid = data.grid ?? [];
    } catch { /* proceed anyway */ }

    const doneSet = new Set(
      currentGrid.filter(c => c.status === 'done').map(c => `${c.ticker}|${c.quarter}`)
    );

    const queue = configRows.filter(r => !doneSet.has(`${r.ticker}|${r.quarter}`));

    if (queue.length === 0) {
      setBatch({ done: 0, errors: 0, total: 0, current: 'Nothing to ingest — all cells with URLs are already done.', finished: true });
      return;
    }

    setBatch({ done: 0, errors: 0, total: queue.length, current: '', finished: false });

    let done = 0;
    let errors = 0;

    for (const row of queue) {
      const label = `${row.ticker} ${row.quarter}`;
      setBatch(b => b ? { ...b, current: label } : null);

      try {
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: row.ticker, quarter: row.quarter, sourceType: 'url', url: row.default_url }),
        });
        const data = await res.json();
        if (data.success) { done++; } else { errors++; }
      } catch {
        errors++;
      }

      // Refresh grid after each cell so status updates live
      try {
        const res = await fetch('/api/ingest/status');
        const data = await res.json();
        setGrid(data.grid ?? []);
      } catch { /* non-fatal */ }

      setBatch(b => b ? { ...b, done, errors } : null);
    }

    setBatch({ done, errors, total: queue.length, current: '', finished: true });
  }

  const companyLabel = `${COMPANY_META[selectedTicker]?.name ?? selectedTicker} (${selectedTicker})`;

  return (
    <div style={{ background: '#0e0c09', minHeight: '100vh', padding: '0 0 40px' }}>
      <style>{`
        .grid-cell:hover { background: #161410; }
        .grid-cell.sel { background: #16120a; border-color: rgba(201,168,76,0.4) !important; }
        .fake-dd { position: relative; }
        .fake-dd-menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; background: #161410; border: 0.5px solid #2a2520; border-radius: 5px; margin-top: 2px; max-height: 220px; overflow-y: auto; }
        .fake-dd-item { padding: 6px 10px; font-size: 11px; color: #c9a84c; cursor: pointer; }
        .fake-dd-item:hover { background: #1e1a14; }
        .upload-zone { border: 0.5px dashed #1e1c18; border-radius: 5px; padding: 10px; text-align: center; font-size: 10px; color: #252218; cursor: pointer; }
        .upload-zone:hover { border-color: #2a2520; }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:.25} }
      `}</style>

      <div style={{ display: 'flex', gap: 14, padding: '20px 24px' }}>

        {/* ── Left: grid ── */}
        <div style={{ flex: '0 0 390px', background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: '#3a3528', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Data history status
            </div>
            <button
              onClick={handleIngestAll}
              disabled={!!batch && !batch.finished}
              title="Fetch all cells that have a default URL. Cells that can't be fetched server-side will show ✕."
              style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 3, cursor: (batch && !batch.finished) ? 'default' : 'pointer', background: '#0e1208', color: (batch && !batch.finished) ? '#2a4a2a' : '#4a9a6a', border: `0.5px solid ${(batch && !batch.finished) ? '#1a2a1a' : 'rgba(74,154,106,0.35)'}`, opacity: (batch && !batch.finished) ? 0.6 : 1 }}
            >
              {(batch && !batch.finished) ? '…running' : 'Ingest all →'}
            </button>
          </div>

          {/* Batch progress */}
          {batch && (
            <div style={{ marginBottom: 10, padding: '6px 8px', background: '#0c110c', border: '0.5px solid #1a2a1a', borderRadius: 5 }}>
              {batch.finished ? (
                <div style={{ fontSize: 9, color: '#4a9a6a' }}>
                  Done — {batch.done} ingested
                  {batch.errors > 0 && <span style={{ color: '#9a4a4a', marginLeft: 6 }}>{batch.errors} failed (earningscall.ai / no server fetch)</span>}
                </div>
              ) : (
                <div style={{ fontSize: 9, color: '#3a6a3a' }}>
                  <span style={{ animation: 'pulseDot 1.2s ease-in-out infinite', display: 'inline-block', marginRight: 4 }}>·</span>
                  {batch.done} / {batch.total} done · {batch.errors} errors
                  {batch.current && <span style={{ color: '#2a4a2a', marginLeft: 6 }}>{batch.current}</span>}
                </div>
              )}
            </div>
          )}


          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ fontSize: 9, fontWeight: 500, color: '#3a3528', letterSpacing: '0.06em', padding: '3px 4px', textAlign: 'left', borderBottom: '0.5px solid #1e1c18', width: 30 }} />
                {TICKERS.map(t => (
                  <th key={t} style={{ fontSize: 9, fontWeight: 500, color: '#3a3528', letterSpacing: '0.06em', padding: '3px 4px', textAlign: 'center', borderBottom: '0.5px solid #1e1c18' }}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUARTERS.map((q, qi) => (
                <tr key={q}>
                  <td style={{ fontSize: 9, color: '#2e2c24', paddingLeft: 6, fontWeight: 500, borderBottom: '0.5px solid #161410', cursor: 'default' }}>
                    {QUARTER_LABELS[qi]}
                  </td>
                  {TICKERS.map(ticker => {
                    const st = cellStatus(ticker, q);
                    const isNA = st === 'na';
                    const isSel = ticker === selectedTicker && q === selectedQuarter;
                    return (
                      <td
                        key={ticker}
                        className={`grid-cell${isSel ? ' sel' : ''}`}
                        onClick={() => handleCellClick(ticker, q)}
                        title={isNA ? "SanDisk IPO'd in 2025 — no prior quarters exist" : `${ticker} · ${q}`}
                        style={{ textAlign: 'center', border: '0.5px solid #161410', height: 24, cursor: isNA ? 'default' : 'pointer' }}
                      >
                        <CellIcon status={st} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'done',    el: <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2a5a32' }} /> },
              { label: 'empty',   el: <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#1a1812', border: '0.5px solid #2a2820' }} /> },
              { label: 'error',   el: <span style={{ color: '#6a2020', fontSize: 11 }}>✕</span> },
              { label: 'review',  el: <span style={{ color: '#6a5020', fontSize: 11 }}>▲</span> },
              { label: 'pre-IPO', el: <span style={{ color: '#252218', fontSize: 10 }}>—</span> },
            ].map(({ label, el }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#2e2c24' }}>
                {el} {label}
              </div>
            ))}
          </div>

          {/* NA tooltip */}
          {naTooltip && (
            <div style={{ fontSize: 9, color: '#4a7a4a', borderLeft: '1.5px solid #2a4a2a', padding: '5px 7px', marginTop: 7, lineHeight: 1.6, background: '#0c110c', borderRadius: '0 4px 4px 0' }}>
              SanDisk IPO&rsquo;d in 2025 — no prior quarters exist.
            </div>
          )}

          <div style={{ fontSize: 9, color: '#4a7a4a', borderLeft: '1.5px solid #2a4a2a', padding: '5px 7px', marginTop: 7, lineHeight: 1.6, background: '#0c110c', borderRadius: '0 4px 4px 0' }}>
            Click any cell to load company + quarter into the ingest panel. Gold outline = selected ({COMPANY_META[selectedTicker]?.name} · {selectedQuarter}).
          </div>
        </div>

        {/* ── Right: panel ── */}
        <div style={{ flex: 1, minWidth: 0, background: '#0b0906', border: '0.5px solid #1e1c18', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 9, color: '#3a3528', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Data ingestion
          </div>

          {/* Company + Quarter selectors */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, color: '#3a3528', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Company <span style={{ fontSize: 8, color: '#252218', textTransform: 'none', letterSpacing: 0, marginLeft: 3 }}>(set by grid)</span>
              </div>
              <div className="fake-dd">
                <div
                  onClick={() => { setCompanyOpen(o => !o); setQuarterOpen(false); }}
                  style={{ background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5, color: '#c9a84c', fontSize: 11, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  {companyLabel}
                  <span style={{ fontSize: 8, color: '#3a3528', marginLeft: 6 }}>▾</span>
                </div>
                {companyOpen && (
                  <div className="fake-dd-menu">
                    {TICKERS.map(t => (
                      <div
                        key={t}
                        className="fake-dd-item"
                        onClick={() => { setSelectedTicker(t); setCompanyOpen(false); }}
                      >
                        {COMPANY_META[t].name} ({t})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, color: '#3a3528', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                Quarter <span style={{ fontSize: 8, color: '#252218', textTransform: 'none', letterSpacing: 0, marginLeft: 3 }}>(set by grid)</span>
              </div>
              <div className="fake-dd">
                <div
                  onClick={() => { setQuarterOpen(o => !o); setCompanyOpen(false); }}
                  style={{ background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5, color: '#c9a84c', fontSize: 11, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  {selectedQuarter}
                  <span style={{ fontSize: 8, color: '#3a3528', marginLeft: 6 }}>▾</span>
                </div>
                {quarterOpen && (
                  <div className="fake-dd-menu">
                    {QUARTERS.map(q => (
                      <div
                        key={q}
                        className="fake-dd-item"
                        onClick={() => { setSelectedQuarter(q); setQuarterOpen(false); }}
                      >
                        {q}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid #1a1812', margin: '12px 0' }} />

          <div style={{ fontSize: 9, color: '#3a3528', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Input source <span style={{ color: '#252218', textTransform: 'none', letterSpacing: 0, fontSize: 8, marginLeft: 4 }}>· first populated wins · raw text always stored</span>
          </div>

          {/* Priority 1: Paste */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 500, flexShrink: 0, background: '#0d1a08', color: '#2a5a32', border: '0.5px solid #2a4a2a' }}>1</div>
              <span style={{ fontSize: 10, color: '#6a6050' }}>Paste transcript</span>
              <span style={{ fontSize: 9, color: '#252218', marginLeft: 'auto' }}>highest priority</span>
            </div>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="paste raw transcript text here…"
              rows={pasteText ? 6 : 3}
              style={{ width: '100%', background: '#0b0906', border: `0.5px solid ${pasteText ? '#3a3020' : '#1e1c18'}`, borderRadius: 5, color: '#c8b87a', fontSize: 10, padding: '6px 8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 9, color: '#4a7a4a', borderLeft: '1.5px solid #2a4a2a', padding: '5px 7px', marginTop: 4, lineHeight: 1.6, background: '#0c110c', borderRadius: '0 4px 4px 0' }}>
              Use when you have the text. Stored verbatim. No fetch needed.
            </div>
          </div>

          {/* Priority 2: PDF */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 500, flexShrink: 0, background: '#161008', color: '#6a5020', border: '0.5px solid #4a3a18' }}>2</div>
              <span style={{ fontSize: 10, color: '#6a6050' }}>Upload PDF</span>
              <span style={{ fontSize: 9, color: '#252218', marginLeft: 'auto' }}>if no paste</span>
            </div>
            <label className="upload-zone" style={{ display: 'block' }}>
              <input
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
              {pdfFile ? (
                <span style={{ color: '#6a5020' }}>{pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)</span>
              ) : (
                'drag PDF here or click to choose'
              )}
            </label>
            <div style={{ fontSize: 9, color: '#4a7a4a', borderLeft: '1.5px solid #2a4a2a', padding: '5px 7px', marginTop: 4, lineHeight: 1.6, background: '#0c110c', borderRadius: '0 4px 4px 0' }}>
              For Samsung / SK Hynix PDFs. Text extracted then stored.
            </div>
          </div>

          {/* Priority 3: URL */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 500, flexShrink: 0, background: '#100a08', color: '#5a2a20', border: '0.5px solid #3a2018' }}>3</div>
              <span style={{ fontSize: 10, color: '#6a6050' }}>Default URL</span>
              <span style={{ fontSize: 9, color: '#252218', marginLeft: 'auto' }}>fallback · editable</span>
            </div>
            <input
              type="text"
              value={urlOverride}
              onChange={e => setUrlOverride(e.target.value)}
              placeholder={defaultUrl || 'no default URL for this quarter — enter one or paste above'}
              style={{ display: 'block', width: '100%', background: '#161410', border: '0.5px solid #2a2520', borderRadius: 5, color: '#6a6050', fontSize: 10, padding: '5px 8px', outline: 'none', fontFamily: 'sans-serif', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 9, color: '#4a7a4a', borderLeft: '1.5px solid #2a4a2a', padding: '5px 7px', marginTop: 4, lineHeight: 1.6, background: '#0c110c', borderRadius: '0 4px 4px 0' }}>
              Pre-populated from config table. Override if wrong. Server fetches + stores raw text.
            </div>
          </div>

          <div style={{ borderTop: '0.5px solid #1a1812', margin: '12px 0' }} />

          <button
            onClick={handleIngest}
            disabled={loading}
            style={{ width: '100%', padding: 8, background: '#0b0906', border: '0.5px solid rgba(201,168,76,0.55)', borderRadius: 5, color: '#c9a84c', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer', fontFamily: 'sans-serif', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? <span style={{ animation: 'pulseDot 1.2s ease-in-out infinite', display: 'inline-block' }}>ingesting…</span> : 'Ingest → extract signals'}
          </button>

          <div style={{ fontSize: 9, color: status.startsWith('✓') ? '#4a9a6a' : status.startsWith('Error') ? '#9a4a4a' : '#252218', textAlign: 'center', marginTop: 5, minHeight: 14 }}>
            {status || 'stores raw transcript → extracts signals → grid cell turns green'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
