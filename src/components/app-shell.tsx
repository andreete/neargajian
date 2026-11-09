import type { ReactNode } from 'react';
import type { SessionUser } from '@/server/auth/session';
import { ROLE_LABEL } from '@/server/auth/policy';
import { Logo, TestnetBadge } from './brand';
import { NavItems, SignOutButton, type NavItem } from './app-shell-client';

/** Role-based navigation. Items for later phases are disabled with a short hint. */
export function navFor(role: SessionUser['role']): NavItem[] {
  switch (role) {
    case 'maker':
      return [
        { href: '/maker', label: 'My runs', icon: 'runs' },
        { href: '/maker/runs/new', label: 'New run', icon: 'plus' },
        { href: '/history', label: 'History and reports', icon: 'reports' },
      ];
    case 'approver':
      return [
        { href: '/approver', label: 'Review queue', icon: 'inbox' },
        { href: '/history', label: 'History and reports', icon: 'reports' },
      ];
    case 'admin':
      return [
        { href: '/admin', label: 'Workflow settings', icon: 'workflow' },
        { href: '/history', label: 'Company reports', icon: 'reports' },
      ];
  }
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function AppShell({ user, csrfToken, roleDetail, nav, children }: {
  user: SessionUser; csrfToken: string; roleDetail?: string; nav: NavItem[]; children: ReactNode;
}) {
  return (
    <div className="app-body">
      <header className="app-top">
        <Logo href="/" />
        <div className="header-end">
          <TestnetBadge />
          <div className="user-chip" aria-label={`Signed in as ${user.displayName}, ${roleDetail ?? ROLE_LABEL[user.role]}`}>
            <span className="avatar" aria-hidden="true">{initials(user.displayName)}</span>
            <span className="meta" aria-hidden="true">
              <span className="name">{user.displayName}</span><br />
              <span className="role">{roleDetail ?? ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <SignOutButton csrfToken={csrfToken} />
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Main (compact)"><NavItems items={nav} /></nav>
      <div className="shell">
        <aside className="sidebar" aria-label="Sidebar">
          <nav aria-label="Main">
            <div className="nav-label">{ROLE_LABEL[user.role]}</div>
            <NavItems items={nav} />
          </nav>
          <div className="sidebar-foot">
            <strong>NEAR testnet</strong>
            Synthetic data, zero-value tUSDC. All times in UTC.
          </div>
        </aside>
        <main id="main" className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
