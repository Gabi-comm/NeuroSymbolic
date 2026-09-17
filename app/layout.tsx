import './globals.css';
import type { Metadata, Viewport } from 'next';
import Navigation from '@/components/Navigation';
import PageTransition from '@/components/PageTransition';

// This file was "use client", which opted the entire app out of Server
// Components and made a `metadata` export impossible -- the site had no title,
// no description and no favicon metadata at all. Navigation is already a client
// component, so the directive was never needed here.
//
// The removed logic hid the nav on "/admin/reports/<id>". That route does not
// exist; reports expand inline on /admin/reports, so the condition never fired.

export const metadata: Metadata = {
  title: {
    default: 'OASYS — Road Damage Assessment',
    template: '%s · OASYS',
  },
  description:
    'Neuro-symbolic AI road damage assessment. Detects potholes and cracks from ' +
    'road images and grades severity against DPWH engineering standards.',
  applicationName: 'OASYS',
  keywords: ['road assessment', 'pavement distress', 'DPWH', 'pothole detection'],
  robots: { index: false, follow: false }, // localised research tool, not for search
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-dark-bg text-white">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <Navigation />
        <div id="content">
          <PageTransition>{children}</PageTransition>
        </div>
      </body>
    </html>
  );
}
