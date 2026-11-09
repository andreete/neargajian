import Link from 'next/link';
// Transparent, trimmed derivative of public/brand/gajian-logo.jpeg (scripts/make-logo-png.py).
import logo from '../../public/brand/gajian-logo-trim.png';

export function Logo({ href = '/' }: { href?: string }) {
  const height = 32;
  const width = Math.round((logo.width / logo.height) * height);
  return (
    <Link href={href} className="brand" aria-label="GAJIAN home">
      {/* Plain <img>: next/image adds an inline style attribute that our strict CSP blocks. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} alt="GAJIAN" width={width} height={height} />
    </Link>
  );
}

/** Persistent network and test-data badge (PRD J01). */
export function TestnetBadge() {
  return (
    <span className="testnet-badge" title="All payouts use NEAR testnet and zero-value tUSDC. Data is synthetic.">
      <span className="dot" aria-hidden="true" />
      NEAR testnet
      <span className="sr-only">: synthetic data and zero-value test tokens only</span>
    </span>
  );
}
