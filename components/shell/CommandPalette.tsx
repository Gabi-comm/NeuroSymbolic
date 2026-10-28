'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { setTheme } from './theme';
import { ADMIN_LINKS, INFO_LINKS, USER_LINKS, SHELL_EVENTS } from './nav';
import { IconArrow, IconCompass, IconMoon, IconSearch, IconSun } from './icons';

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

/** Ctrl/⌘ K: jump to a page or run a shell action. */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { authUser, isAdmin, openLogin } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHELL_EVENTS.palette, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHELL_EVENTS.palette, onOpen);
    };
  }, []);

  const commands = useMemo<Command[]>(() => {
    const close = () => {
      setOpen(false);
      setQuery('');
    };
    const pages = (isAdmin ? ADMIN_LINKS : [...USER_LINKS, ...INFO_LINKS]).map<Command>((link) => ({
      id: link.href,
      label: link.label,
      hint: 'Page',
      icon: link.icon,
      run: () => {
        close();
        if (link.needsAuth && !authUser) openLogin();
        else router.push(link.href);
      },
    }));
    return [
      ...pages,
      { id: 'light', label: 'Light theme', hint: 'Theme', icon: IconSun, run: () => (close(), setTheme('light')) },
      { id: 'dark', label: 'Dark theme', hint: 'Theme', icon: IconMoon, run: () => (close(), setTheme('dark')) },
      ...(isAdmin
        ? []
        : [
            {
              id: 'tour',
              label: 'Take the tour',
              hint: 'Guide',
              icon: IconCompass,
              run: () => {
                close();
                window.dispatchEvent(new Event(SHELL_EVENTS.tour));
              },
            },
          ]),
    ];
  }, [isAdmin, authUser, openLogin, router]);

  const results = commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));
  const active = Math.min(cursor, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[14vh] bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="pop-in w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <IconSearch className="w-5 h-5 text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') results[active]?.run();
            }}
            placeholder="Go to a page or run a command"
            aria-label="Search pages and commands"
            className="grow bg-transparent text-fg placeholder:text-fg-faint outline-none text-[15px]"
          />
          <kbd className="font-mono text-[11px] text-fg-faint">Esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto custom-scrollbar p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-muted">No matches</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={c.run}
                className={`w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm text-left transition-colors ${
                  i === active ? 'bg-accent-soft text-accent' : 'text-fg-soft'
                }`}
              >
                <c.icon className="w-[18px] h-[18px]" />
                <span className="grow font-medium">{c.label}</span>
                <span className="text-xs text-fg-faint">{c.hint}</span>
                {i === active && <IconArrow className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
