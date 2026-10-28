'use client';

import type { MouseEvent } from 'react';
import { setTheme, useTheme, type Theme } from './theme';
import { IconMoon, IconSun } from './icons';

const originOf = (e: MouseEvent<HTMLElement>) => {
  const box = e.currentTarget.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** Two-way Light / Dark segmented switch for the sidebar. */
export function ThemeSwitch() {
  const theme = useTheme();
  const options: { value: Theme; label: string; Icon: typeof IconSun }[] = [
    { value: 'light', label: 'Light', Icon: IconSun },
    { value: 'dark', label: 'Dark', Icon: IconMoon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="relative grid grid-cols-2 p-1 rounded-xl bg-inset border border-line"
    >
      <span
        aria-hidden="true"
        className="nav-indicator absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-surface shadow-sm border border-line"
        style={{ transform: theme === 'dark' ? 'translateX(100%)' : 'none' }}
      />
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={(e) => theme !== value && setTheme(value, originOf(e))}
          className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold transition-colors ${
            theme === value ? 'text-fg' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Single sun/moon button for the mobile header. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      onClick={(e) => setTheme(next, originOf(e))}
      aria-label={`Switch to ${next} theme`}
      className={`relative grid place-items-center w-11 h-11 rounded-full hover:bg-fg/10 transition-colors ${className}`}
    >
      {/* Both icons stay mounted so the swap can rotate between them. */}
      <IconSun
        className={`absolute w-5 h-5 transition-all duration-500 ${
          theme === 'light' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
        }`}
      />
      <IconMoon
        className={`absolute w-5 h-5 transition-all duration-500 ${
          theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'
        }`}
      />
    </button>
  );
}
