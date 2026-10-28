'use client';

import { useSyncExternalStore } from 'react';
import { THEME_KEY } from './themeBoot';

export type Theme = 'light' | 'dark';

export { THEME_KEY };

const read = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

// The <html data-theme> attribute is the single source of truth; components
// subscribe to it rather than keeping their own copy in state.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'light');
}

type StartViewTransition = (update: () => void) => { ready: Promise<void> };

/**
 * Switch theme. Where the View Transitions API exists the new theme is revealed
 * as a circle growing out of `origin` (the toggle that was pressed); elsewhere
 * the colours cross-fade. Reduced motion gets an instant swap.
 */
export function setTheme(next: Theme, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice simply lasts for this page.
    }
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }

  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (!start) {
    root.classList.add('theme-fade');
    apply();
    window.setTimeout(() => root.classList.remove('theme-fade'), 420);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  start.call(document, apply).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 680,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });
}
