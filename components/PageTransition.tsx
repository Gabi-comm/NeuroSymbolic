'use client';

import { usePathname } from 'next/navigation';

/**
 * Cross-fades page content on navigation.
 *
 * Keyed on the pathname, so React discards the old subtree and mounts a new one
 * whenever the route changes — which is what actually restarts the CSS
 * animation. Without the key the element persists across navigations and the
 * animation only ever plays once, on first load.
 *
 * Deliberately not the View Transitions API: it is still experimental in this
 * Next version and unsupported in Firefox, which is the browser this project is
 * developed in. A keyed CSS animation behaves identically everywhere.
 *
 * The animation is disabled under `prefers-reduced-motion` by the global rule in
 * globals.css, so nothing here needs to check for it.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
