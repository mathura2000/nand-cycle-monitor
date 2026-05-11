'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

interface RunMeta {
  latestQuarter: string;
  sourcesCount: number;
  totalSources: number;
  lastIngested: string;
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
}

export default function Nav() {
  const pathname = usePathname();
  const [meta, setMeta] = useState<RunMeta | null>(null);

  useEffect(() => {
    fetch('/api/sheets?action=data')
      .then(r => r.json())
      .then((d) => {
        if (d.latestQuarter) setMeta(d);
      })
      .catch(() => {});
  }, []);

  const navStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    padding: '0 24px',
    height: 44,
    borderBottom: '0.5px solid #1e1c18',
    background: '#0e0c09',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  };

  const linkStyle = (href: string): React.CSSProperties => ({
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: pathname === href ? '#c9a84c' : '#6a6050',
    textDecoration: 'none',
  });

  return (
    <nav style={navStyle}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="7" y="7" width="14" height="14" rx="2" stroke="#c9a84c" strokeWidth="1.5" fill="none"/>
          <rect x="10" y="10" width="8" height="8" rx="1" stroke="#c9a84c" strokeWidth="1" fill="none"/>
          {/* top pins */}
          <line x1="10" y1="7" x2="10" y2="3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="7" x2="14" y2="3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="18" y1="7" x2="18" y2="3" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          {/* bottom pins */}
          <line x1="10" y1="21" x2="10" y2="25" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="21" x2="14" y2="25" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="18" y1="21" x2="18" y2="25" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          {/* left pins */}
          <line x1="7" y1="10" x2="3" y2="10" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="14" x2="3" y2="14" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="7" y1="18" x2="3" y2="18" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          {/* right pins */}
          <line x1="21" y1="10" x2="25" y2="10" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="21" y1="14" x2="25" y2="14" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="21" y1="18" x2="25" y2="18" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#c9a84c',
          fontFamily: inter.style.fontFamily,
          letterSpacing: '-0.01em',
        }}>
          Memory Industry Cycle Monitor [NAND]
        </span>
      </Link>

      <Link href="/" style={linkStyle('/')}>Overview</Link>
      <Link href="/ingest" style={linkStyle('/ingest')}>Ingest</Link>

      {/* Run metadata */}
      <div style={{ marginLeft: 'auto', fontSize: 10, color: '#6a6050' }}>
        {meta ? (
          <>
            {meta.latestQuarter} · {meta.sourcesCount} / {meta.totalSources} sources
            {meta.lastIngested ? ` · last run ${daysSince(meta.lastIngested)}d ago` : ''}
          </>
        ) : null}
      </div>
    </nav>
  );
}
