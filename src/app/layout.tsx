import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { HostedBanner } from '@/components/hosted-banner';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SentFund · Payroll with a clear approval trail', template: '%s · SentFund' },
  description: 'Prepare a payroll batch, route it to the right reviewers, and verify wallet payouts on NEAR testnet.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0a3c90' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <HostedBanner />
        {children}
      </body>
    </html>
  );
}
