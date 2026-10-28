'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js so the app is installable as a PWA and shows an
 * offline page instead of the browser's error. Production only: in dev a
 * worker would sit between Turbopack and the page.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
