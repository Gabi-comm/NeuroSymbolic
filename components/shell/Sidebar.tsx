'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import Logo from './Logo';
import { ThemeSwitch } from './ThemeToggle';
import { ADMIN_LINKS, INFO_LINKS, USER_LINKS, SHELL_EVENTS, isActive, type NavLink } from './nav';
import { IconCompass, IconLogin, IconLogout, IconSearch } from './icons';

export const SIDEBAR_WIDTH = 264;

/**
 * Desktop navigation (md and up), after the clean reference: logo, search,
 * grouped links with a sliding active marker, then guide, theme and account.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { authUser, authChecked, profile, isAdmin, openLogin, logout } = useAuth();

  const groups: { title: string; links: NavLink[] }[] = isAdmin
    ? [{ title: 'Console', links: ADMIN_LINKS }]
    : [
        { title: 'Platform', links: USER_LINKS },
        { title: 'Info', links: INFO_LINKS },
      ];

  // The marker is one element that glides to the active link, rather than a
  // background that blinks from one item to the next.
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    // Measuring the DOM after layout is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarker(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
  }, [pathname, isAdmin, authUser]);

  const name = profile?.username || authUser?.email?.split('@')[0] || 'Signed in';

  return (
    <aside
      aria-label="Main"
      className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-surface border-r border-line"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div className="px-5 pt-6 pb-5">
        <Link href={isAdmin ? '/admin' : '/'} aria-label={isAdmin ? 'OASYS admin console' : 'OASYS home'}>
          <Logo />
        </Link>
      </div>

      <div className="px-4">
        <button
          onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.palette))}
          data-tour="search"
          className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl bg-inset border border-line text-sm text-fg-muted hover:border-line-strong hover:text-fg transition-colors"
        >
          <IconSearch className="w-4 h-4" />
          <span className="grow text-left">Search</span>
          <kbd className="font-mono text-[11px] text-fg-faint">Ctrl K</kbd>
        </button>
      </div>

      <nav ref={navRef} className="relative mt-5 px-4 grow overflow-y-auto custom-scrollbar">
        {marker && (
          <span
            aria-hidden="true"
            className="nav-indicator absolute left-4 right-4 rounded-xl bg-accent-soft"
            style={{ transform: `translateY(${marker.top}px)`, height: marker.height, top: 0 }}
          />
        )}

        {groups.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.links.map((link) => {
                const active = isActive(pathname, link.href);
                const locked = link.needsAuth && authChecked && !authUser;
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      data-tour={link.tour}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => {
                        if (locked) {
                          e.preventDefault();
                          openLogin();
                        }
                      }}
                      className={`relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm transition-colors ${
                        active
                          ? 'text-accent font-semibold'
                          : 'text-fg-soft hover:text-fg hover:bg-fg/5'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
              {/* The tour lives in Info as one more row, styled like the links. */}
              {group.title === 'Info' && (
                <li>
                  <button
                    onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.tour))}
                    data-tour="guide"
                    className="group w-full flex items-center gap-3 h-10 px-3 rounded-xl text-sm text-fg-soft hover:text-fg hover:bg-fg/5 transition-colors"
                  >
                    <IconCompass className="w-[18px] h-[18px] shrink-0 transition-transform duration-500 group-hover:rotate-[200deg]" />
                    Guide
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}

      </nav>

      <div className="px-4 pb-5 flex flex-col gap-3">
        <ThemeSwitch />

        <div className="flex items-center gap-3 pt-3 border-t border-line">
          {!authChecked ? (
            <div aria-hidden="true" className="skeleton h-10 w-full rounded-xl" />
          ) : authUser ? (
            <>
              <span
                aria-hidden="true"
                className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-brand text-brand-fg text-sm font-semibold uppercase"
              >
                {name.charAt(0)}
              </span>
              <span className="grow min-w-0">
                <span className="block text-sm font-semibold text-fg truncate">{name}</span>
                <span className="block text-xs text-fg-muted">{isAdmin ? 'Administrator' : 'Reporter'}</span>
              </span>
              <button
                onClick={logout}
                aria-label="Log out"
                title="Log out"
                className="grid place-items-center w-9 h-9 rounded-full text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <IconLogout className="w-[18px] h-[18px]" />
              </button>
            </>
          ) : (
            <button
              onClick={openLogin}
              className="btn-blue w-full flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold"
            >
              <IconLogin className="w-[18px] h-[18px]" />
              Sign in
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
