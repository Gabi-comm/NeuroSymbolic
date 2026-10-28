'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { ADMIN_LINKS, isActive, type NavLink } from './nav';
import { IconCamera, IconHome, IconInfo, IconList, IconPlus } from './icons';

const USER_TABS: (NavLink | 'fab')[] = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/captured-distress', label: 'Captured', icon: IconCamera, needsAuth: true },
  'fab',
  { href: '/my-reports', label: 'Reports', icon: IconList, needsAuth: true },
  { href: '/about', label: 'About', icon: IconInfo },
];

/** Bottom navigation below md, with the mockups' centre "+" for Report. */
export default function BottomTabBar() {
  const pathname = usePathname();
  const { authUser, authChecked, isAdmin, openLogin } = useAuth();
  const tabs = isAdmin ? ADMIN_LINKS : USER_TABS;
  const reportActive = isActive(pathname, '/report-damage');

  return (
    <nav
      aria-label="Tabs"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-end justify-around h-16 px-1">
        {tabs.map((tab) => {
          if (tab === 'fab') {
            return (
              <li key="fab" className="relative w-16 h-16 flex justify-center">
                <Link
                  href="/report-damage"
                  aria-label="Report a distress"
                  aria-current={reportActive ? 'page' : undefined}
                  data-tour="fab"
                  className={`absolute -top-6 grid place-items-center w-14 h-14 rounded-full bg-brand text-brand-fg shadow-[0_10px_24px_-8px_rgba(20,41,90,0.7)] ring-4 ring-bg transition-transform duration-300 active:scale-90 ${
                    reportActive ? 'rotate-45' : ''
                  }`}
                >
                  <IconPlus className="w-6 h-6" />
                </Link>
              </li>
            );
          }

          const active = isActive(pathname, tab.href);
          const locked = tab.needsAuth && authChecked && !authUser;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  if (locked) {
                    e.preventDefault();
                    openLogin();
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] transition-colors ${
                  active ? 'text-accent font-semibold' : 'text-fg-muted'
                }`}
              >
                <Icon className={`w-[22px] h-[22px] transition-transform duration-300 ${active ? '-translate-y-0.5' : ''}`} />
                {tab.label}
                <span
                  aria-hidden="true"
                  className={`h-0.5 rounded-full bg-accent transition-all duration-300 ${active ? 'w-4' : 'w-0'}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
