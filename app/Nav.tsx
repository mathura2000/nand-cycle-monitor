'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontSize: 15,
          color: '#c9a84c',
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontWeight: 500,
        }}>
          NAND · CM
          <span style={{
            fontSize: 9,
            color: '#6a6050',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginLeft: 10,
            fontStyle: 'normal',
            fontFamily: 'var(--font-sans)',
          }}>
            cycle monitor
          </span>
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
