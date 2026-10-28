'use client';

import Link from 'next/link';
import Logo from '@/components/shell/Logo';
import { useAuth } from '@/components/shell/AuthProvider';
import { IconArrow, IconCamera, IconList, IconReport } from '@/components/shell/icons';

const STEPS = [
  { icon: IconReport, title: 'Pin and upload' },
  { icon: IconCamera, title: 'AI measures the distress' },
  { icon: IconList, title: 'Track it to repair' },
];

/** Home for signed-out visitors. */
export default function Landing() {
  const { openLogin } = useAuth();

  return (
    <main className="px-4 sm:px-8 lg:px-12 pt-6 md:pt-10 pb-12 max-w-6xl mx-auto">
      <section className="stagger relative overflow-hidden rounded-[28px] bg-brand-gradient min-h-[30rem] sm:min-h-[34rem] flex flex-col justify-end p-6 sm:p-12">
        {/* The study area behind the hero, dimmed into the navy. */}
        <iframe
          aria-hidden="true"
          tabIndex={-1}
          title="Map of South Caloocan City"
          loading="lazy"
          src="https://www.openstreetmap.org/export/embed.html?bbox=120.9634,14.6409,120.9958,14.6715&layer=mapnik"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-25 grayscale"
          style={{ border: 0 }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0d1b36] via-[#14295a]/80 to-[#14295a]/40" />
        <ScanLine />

        <div className="relative">
          <Logo size={56} onBrand wordmark={false} />
        </div>
        <h1 className="relative mt-5 text-5xl sm:text-7xl font-semibold tracking-tight text-fg">OASYS</h1>
        <p className="relative mt-3 text-xl sm:text-2xl font-semibold text-fg-soft max-w-xl">
          Report and analyze distresses around you
        </p>
        <div className="relative mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/report-damage"
            className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-white text-[#14295a] font-semibold hover:bg-[#e6edff] transition-colors"
          >
            Report a distress
            <IconArrow className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <button
            onClick={openLogin}
            className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-line-strong text-fg font-semibold hover:bg-fg/10 transition-colors"
          >
            Sign in
          </button>
        </div>
      </section>

      <ol className="stagger mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="lift flex items-center gap-4 rounded-2xl bg-surface border border-line p-5">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-accent-soft text-accent shrink-0">
              <step.icon className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-stat text-sm text-fg-faint">0{i + 1}</span>
              <span className="block font-semibold text-fg">{step.title}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-center text-sm">
        <Link href="/about" className="font-semibold text-accent hover:text-accent-hover">
          How OASYS works &rarr;
        </Link>
      </p>
    </main>
  );
}

/** A slow scan beam sweeping the hero, echoing the intro animation. */
export function ScanLine() {
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="scan-beam absolute inset-y-0 w-40 bg-gradient-to-r from-transparent via-[#7c9dff]/20 to-transparent" />
    </div>
  );
}
