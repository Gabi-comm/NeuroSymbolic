'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import Logo from './Logo';
import { ThemeButton } from './ThemeToggle';
import { SHELL_EVENTS } from './nav';
import { IconHelp, IconLogin, IconLogout, IconSearch } from './icons';

/** Navy band at the top of every page below md, as in the mobile mockups. */
export default function MobileHeader() {
  const { authUser, authChecked, profile, isAdmin, openLogin, logout } = useAuth();
  const name = profile?.username || authUser?.email?.split('@')[0] || '';
  const [menuOpen, setMenuOpen] = useState(false);

  const iconButton = 'grid place-items-center w-11 h-11 rounded-full hover:bg-fg/10 transition-colors';

  return (
    <header className="md:hidden sticky top-0 z-40 bg-header-gradient text-fg pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1 h-16 pl-4 pr-2">
        <Link href={isAdmin ? '/admin' : '/'} aria-label="OASYS home" className="mr-auto">
          <Logo size={28} onBrand />
        </Link>

        <button
          onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.palette))}
          aria-label="Search"
          className={iconButton}
        >
          <IconSearch className="w-5 h-5" />
        </button>
        {!isAdmin && (
          <button
            onClick={() => window.dispatchEvent(new Event(SHELL_EVENTS.tour))}
            aria-label="Guide"
            data-tour="guide-mobile"
            className={iconButton}
          >
            <IconHelp className="w-5 h-5" />
          </button>
        )}
        <ThemeButton />

        {!authChecked ? (
          <span aria-hidden="true" className="w-11 h-11 grid place-items-center">
            <span className="w-8 h-8 rounded-full bg-fg/10 animate-pulse" />
          </span>
        ) : authUser ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account"
              aria-expanded={menuOpen}
              className={iconButton}
            >
              <span className="grid place-items-center w-8 h-8 rounded-full bg-fg text-brand text-sm font-semibold uppercase">
                {name.charAt(0) || '·'}
              </span>
            </button>
            {menuOpen && (
              // off-brand: back to page tokens, outside the navy band's scope.
              <div className="pop-in absolute right-0 top-12 w-56 rounded-2xl bg-surface border border-line shadow-2xl p-2 off-brand">
                <p className="px-3 pt-2 pb-3 text-sm">
                  <span className="block font-semibold truncate">{name}</span>
                  <span className="block text-xs text-fg-muted">{isAdmin ? 'Administrator' : 'Reporter'}</span>
                </p>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 h-11 px-3 rounded-xl text-sm font-semibold text-danger hover:bg-danger/10"
                >
                  <IconLogout className="w-[18px] h-[18px]" />
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={openLogin} aria-label="Sign in" className={iconButton}>
            <IconLogin className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
}
