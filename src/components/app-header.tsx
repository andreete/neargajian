import type { SessionUser } from '@/server/auth/session';
import { ROLE_LABEL } from '@/server/auth/policy';
import { Logo, TestnetBadge } from './brand';
import { NavLinks, SignOutButton } from './app-header-client';

const NAV: Record<SessionUser['role'], { href: string; label: string }[]> = {
  maker: [{ href: '/maker', label: 'My payroll runs' }],
  approver: [{ href: '/approver', label: 'Review queue' }],
  admin: [{ href: '/admin', label: 'Workflow settings' }],
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function AppHeader({ user, csrfToken, roleDetail }: { user: SessionUser; csrfToken: string; roleDetail?: string }) {
  return (
    <header className="site-header">
      <div className="container">
        <Logo href="/" />
        <NavLinks links={NAV[user.role]} />
        <div className="header-end">
          <TestnetBadge />
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials(user.displayName)}</span>
            <span className="meta">
              <span className="name">{user.displayName}</span><br />
              <span className="role">{roleDetail ?? ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <SignOutButton csrfToken={csrfToken} />
        </div>
      </div>
    </header>
  );
}
