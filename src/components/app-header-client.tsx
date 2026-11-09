'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LogOutIcon } from './icons';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'page' : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}

export function SignOutButton({ csrfToken }: { csrfToken: string }) {
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, credentials: 'same-origin' });
    } finally {
      // Full page load on purpose: drops every client-side cache of the signed-in session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    }
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={signOut} disabled={pending}>
      <LogOutIcon size={16} /><span className="btn-label-long">{pending ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}
