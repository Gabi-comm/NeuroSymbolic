import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Geist, Barlow_Condensed, JetBrains_Mono } from 'next/font/google';
import AppShell from '@/components/shell/AppShell';
import PageTransition from '@/components/PageTransition';
import AuthNotice from '@/components/AuthNotice';
import { THEME_BOOT_SCRIPT } from '@/components/shell/themeBoot';
import ServiceWorker from '@/components/shell/ServiceWorker';

// This file was "use client", which opted the entire app out of Server
// Components and made a `metadata` export impossible -- the site had no title,
// no description and no favicon metadata at all. The shell is a client
// component, so the directive was never needed here.

// Geist for everything, Barlow Condensed only for stat numbers, JetBrains Mono
// for coordinates and IDs (approved in the 2026-10 Figma redesign).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'OASYS',
    template: '%s · OASYS',
  },
  description:
    'Neuro-symbolic AI road distress assessment. Detects potholes and cracks from ' +
    'road images and grades severity against DPWH engineering standards.',
  applicationName: 'OASYS',
  keywords: ['road assessment', 'pavement distress', 'DPWH', 'pothole detection'],
  robots: { index: false, follow: false }, // localised research tool, not for search
  // Installable PWA: public/manifest.json + public/sw.js (registered by ServiceWorker).
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'OASYS', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // The mobile header is navy in both themes.
  themeColor: '#14295a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme before React hydrates, so the attribute
    // legitimately differs from the server render.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geist.variable} ${barlow.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="text-fg">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <ServiceWorker />
        <AppShell>
          <AuthNotice />
          {/* Clears the 264px sidebar on desktop and the tab bar on phones. */}
          <div id="content" className="md:pl-[264px] pb-28 md:pb-0">
            <PageTransition>{children}</PageTransition>
          </div>
        </AppShell>
      </body>
    </html>
  );
}
