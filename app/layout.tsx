import type { Metadata } from 'next';
import Nav from './Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'NAND Cycle Monitor',
  description: 'NAND supply/demand cycle tracking for SNDK position management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main style={{ padding: '20px 24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
