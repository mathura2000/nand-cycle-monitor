import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentRun } from '@/lib/mockData';
import { daysSince } from '@/lib/scoring';

export const metadata: Metadata = {
  title: 'NAND Cycle Monitor',
  description: 'NAND supply/demand cycle tracking for SNDK position management',
};

const NAV_LINKS = [
  { href: '/', label: 'Regime' },
  { href: '/forensics', label: 'Forensics' },
  { href: '/trends', label: 'Trends' },
  { href: '/divergence', label: 'Divergence' },
  { href: '/evidence', label: 'Evidence' },
  { href: '/ingest', label: 'Ingest' },
  { href: '/config', label: 'Config' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const daysSinceRun = daysSince(currentRun.runDate);
  const analystDelta = currentRun.analystDelta;
  const analystDeltaStr = `${analystDelta > 0 ? '+' : ''}${analystDelta}`;
  const analystAlert = Math.abs(analystDelta) > 15;

  return (
    <html lang="en" className="dark">
      <body>
        {/* ── Top nav ─────────────────────────────────────────────────────── */}
        <header
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
          }}
          className="sticky top-0 z-50"
        >
          <div className="max-w-screen-xl mx-auto px-6 h-11 flex items-center gap-6">
            {/* Wordmark */}
            <span
              className="text-xs font-semibold tracking-widest uppercase tabular"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}
            >
              NAND<span style={{ color: 'var(--accent-sndk)' }}>·</span>CM
            </span>

            {/* Nav links */}
            <nav className="flex items-center gap-1 flex-1">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1 rounded text-xs transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Status chips */}
            <div className="flex items-center gap-2">
              {/* Freshness chip */}
              <span
                className="tabular text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: daysSinceRun > 60 ? '#f59e0b' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {currentRun.sourcesFresh}/8 fresh · {daysSinceRun}d ago
              </span>

              {/* Analyst delta chip */}
              <span
                className="tabular text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: analystAlert ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)',
                  color: analystAlert ? '#f59e0b' : 'var(--text-muted)',
                  border: `1px solid ${analystAlert ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                }}
              >
                Δ analyst {analystDeltaStr}
              </span>

              {/* Run button */}
              <Link
                href="/ingest"
                className="text-xs px-3 py-1 rounded font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--accent-sndk)',
                  color: '#fff',
                }}
              >
                Run
              </Link>
            </div>
          </div>
        </header>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <main className="max-w-screen-xl mx-auto px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}