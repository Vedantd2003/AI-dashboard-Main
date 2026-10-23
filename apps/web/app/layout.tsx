import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'AlphaPulse AI', template: '%s | AlphaPulse AI' },
  description: 'Evidence-backed investment research and workflow automation. From market signals to investment intelligence.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#0a1020', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
