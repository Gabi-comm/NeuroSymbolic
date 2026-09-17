'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Pointer parallax only. Touch devices get the static map, which is correct:
  // there is no hover on a phone and tracking touch here would fight scrolling.
  const handleMouseMove = (e: React.MouseEvent) => {
    const moveX = (e.clientX / window.innerWidth - 0.5) * 30;
    const moveY = (e.clientY / window.innerHeight - 0.5) * 30;
    setOffset({ x: -moveX, y: -moveY });
  };

  return (
    <main
      className="relative min-h-screen flex items-center justify-center w-full overflow-hidden px-4"
      onMouseMove={handleMouseMove}
    >
      <div
        aria-hidden="true"
        className="absolute z-0 pointer-events-none transition-transform duration-75 ease-out motion-reduce:transform-none"
        style={{
          width: '110vw',
          height: '110vh',
          left: '-5vw',
          top: '-5vh',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        <iframe
          title="Map of South Caloocan City"
          width="100%"
          height="100%"
          frameBorder="0"
          scrolling="no"
          loading="lazy"
          src="https://www.openstreetmap.org/export/embed.html?bbox=120.9634,14.6409,120.9958,14.6715&layer=mapnik"
          className="w-full h-full"
        />
      </div>

      <div aria-hidden="true" className="absolute inset-0 z-0 bg-black/60 pointer-events-none" />

      <div className="z-10 text-white flex flex-col items-center w-full max-w-4xl py-24">
        <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black mb-4 text-center tracking-tight">
          OASYS
        </h1>
        <p className="text-base sm:text-lg max-w-md border-b-2 border-oasys-blue pb-4 mb-10 text-center">
          Neuro-symbolic AI road damage assessment
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6 w-full max-w-xl">
          <Link
            href="/report-damage"
            className="btn-blue flex-1 px-8 py-4 text-lg sm:text-xl whitespace-nowrap"
          >
            Report damage
          </Link>
          <Link
            href="/upload-media"
            className="btn-blue flex-1 px-8 py-4 text-lg sm:text-xl bg-zinc-700 hover:bg-zinc-600"
          >
            Scan
          </Link>
        </div>
      </div>
    </main>
  );
}
