import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FilePlus2, LayoutDashboard, LogOut, Settings, type LucideIcon } from 'lucide-react';
import { Button, cx } from '../components/ui';
import { ConfirmHost, Toaster } from '../components/ui/feedback';
import { signOutUser, useSession } from '../features/auth/session.ts';

const LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/invoice/baru', label: 'Invoice baru', icon: FilePlus2 },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings }
];

const NavItem: React.FC<{ to: string; label: string; icon: LucideIcon; compact?: boolean }> = ({ to, label, icon: Icon, compact }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      cx(
        'flex items-center gap-2.5 rounded-md text-[14px] transition-colors',
        compact ? 'h-14 flex-1 flex-col justify-center gap-0.5 text-[11px]' : 'h-9 px-3',
        isActive ? (compact ? 'font-medium text-ink' : 'bg-chip font-medium text-ink') : 'text-ink-2 hover:bg-shell hover:text-ink'
      )
    }
  >
    <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    {label}
  </NavLink>
);

/** The app shell: a sidebar on wide screens, a logo bar and bottom tabs on a phone. */
export const AppShell: React.FC = () => {
  const session = useSession();
  const email = session.state === 'in' ? session.user.email : null;
  return (
  <div className="min-h-screen font-ui md:flex">
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
      <img src="/marka-logo.png" alt="Marka Photobooth" className="mb-6 ml-3 mt-1 h-9 w-fit object-contain" />
      <nav aria-label="Menu utama" className="space-y-1">
        {LINKS.map(l => <NavItem key={l.to} {...l} />)}
      </nav>
      <div className="mt-auto space-y-1 border-t border-rule pt-3">
        <p className="truncate px-3 text-[12px] text-ink-3" title={email ?? undefined}>{email}</p>
        <Button variant="ghost" size="sm" icon={LogOut} className="w-full justify-start" onClick={signOutUser}>Keluar</Button>
      </div>
    </aside>
    <header className="flex h-14 items-center border-b border-line bg-white px-5 md:hidden">
      <img src="/marka-logo.png" alt="Marka Photobooth" className="h-7 object-contain" />
      <Button variant="ghost" size="sm" icon={LogOut} className="ml-auto" aria-label={`Keluar dari ${email}`} onClick={signOutUser} />
    </header>
    <main className="min-w-0 flex-1">
      <Outlet />
    </main>
    <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white md:hidden">
      {LINKS.map(l => <NavItem key={l.to} {...l} compact />)}
    </nav>
    <Toaster />
    <ConfirmHost />
  </div>
  );
};
