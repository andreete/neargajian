'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { EditIcon, FileIcon, InboxIcon, LayersIcon, LogOutIcon, PlusIcon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon: 'runs' | 'plus' | 'reports' | 'inbox' | 'workflow';
  /** Set while the destination is built in a later phase: rendered disabled with a hint. */
  soon?: string;
}

const ICONS = { runs: FileIcon, plus: PlusIcon, reports: LayersIcon, inbox: InboxIcon, workflow: EditIcon };

export function NavItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        if (item.soon) {
          return (
            <span key={item.href} className="nav-item is-disabled" aria-disabled="true" title={`Coming soon (${item.soon})`}>
              <Icon size={18} />{item.label}<span className="soon">Soon</span>
            </span>
          );
        }
        const active = pathname === item.href || (pathname.startsWith(`${item.href}/`) && !items.some((o) => o.href !== item.href && o.href.length > item.href.length && pathname.startsWith(o.href)));
        return (
          <Link key={item.href} href={item.href} className="nav-item" aria-current={active ? 'page' : undefined}>
            <Icon size={18} />{item.label}
          </Link>
        );
      })}
    </>
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
