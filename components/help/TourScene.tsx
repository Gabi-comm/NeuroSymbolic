// Tour card art: a real screenshot of the app (public/tour/*-light|dark.webp,
// taken from the dashboard and Report page at 1280px) with a hand tapping
// through it. Keyframes live in app/globals.css under "Tour scenes".
//
// Every position is a percentage of the screenshot, measured from the live
// page when the shots were taken. Retake the shots and these move with them.

import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

export type TourSceneKey = 'overview' | 'stats' | 'map' | 'report' | 'captures';

type Pt = [x: number, y: number];
type Box = [left: number, top: number, width: number, height: number];

interface Taps {
  tap1: Pt;
  tap2: Pt;
}

interface Scene extends Taps {
  /** Where the view eases in, and by how much. */
  zoom: Pt;
  scale: number;
  /** What the taps do, drawn over the screenshot. */
  effects: (taps: Taps) => ReactNode;
}

const pct = (n: number) => `${n}%`;
const boxStyle = ([left, top, width, height]: Box): CSSProperties => ({
  left: pct(left),
  top: pct(top),
  width: pct(width),
  height: pct(height),
});

/** An accent outline that appears around what was tapped. */
/** `between` shows from tap 1 until tap 2, for a choice that tap 2 replaces. */
const Ring = ({ box, after, round = 'rounded-[10px]' }: { box: Box; after: 1 | 2 | 'between'; round?: string }) => (
  <span
    className={`tour-after-${after} ${round} border-2 border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent)]`}
    style={boxStyle(box)}
  />
);

const SCENES: Record<TourSceneKey, Scene> = {
  // Dashboard top: tap Report a distress, then a number tile.
  overview: {
    tap1: [65, 25.2],
    tap2: [38.3, 60.2],
    zoom: [50, 40],
    scale: 1.15,
    effects: () => (
      <>
        <Ring box={[55.2, 21.4, 19.6, 7.6]} after={1} round="rounded-[6px]" />
        <Ring box={[27.4, 50.6, 21.9, 19.2]} after={2} />
      </>
    ),
  },
  // Number tiles: tap Needs action, then Reports filed.
  stats: {
    tap1: [57.7, 50],
    tap2: [20.5, 50],
    zoom: [40, 50],
    scale: 1.2,
    effects: () => (
      <>
        <Ring box={[40.3, 34.75, 34.7, 30.5]} after="between" round="rounded-[14px]" />
        <Ring box={[3.1, 34.75, 34.7, 30.5]} after={2} round="rounded-[14px]" />
      </>
    ),
  },
  // Map: switch to Needs action, then open a pin.
  map: {
    tap1: [77.4, 5.3],
    tap2: [44.2, 40.9],
    zoom: [44, 15],
    scale: 1.15,
    effects: ({ tap2 }) => (
      <>
        <span className="tour-after-1 h-[3px] rounded-full bg-accent" style={{ left: '72.9%', top: '7.3%', width: '9%' }} />
        <span
          className="tour-after-2 -translate-x-1/2 rounded-lg bg-surface border border-line shadow-lg px-2 py-1 text-[9px] leading-tight whitespace-nowrap"
          style={{ left: pct(tap2[0]), top: `calc(${pct(tap2[1])} - 34px)` }}
        >
          <span className="block font-semibold text-fg">Pothole</span>
          <span className="block text-fg-muted">Needs Action</span>
        </span>
      </>
    ),
  },
  // Report page: tap the map to drop a pin, then add a photo.
  report: {
    tap1: [27, 35.1],
    tap2: [78.3, 37.8],
    zoom: [50, 40],
    scale: 1.12,
    effects: ({ tap1 }) => (
      <>
        <svg
          viewBox="0 0 24 32"
          className="tour-drop-1 w-[18px] h-6"
          style={{ left: pct(tap1[0]), top: pct(tap1[1]) }}
          aria-hidden="true"
        >
          <path
            d="M12 31C5 22 1 16.5 1 11.5a11 11 0 0 1 22 0C23 16.5 19 22 12 31Z"
            fill="var(--accent)"
            stroke="#fff"
            strokeWidth="2"
          />
          <circle cx="12" cy="11.5" r="4" fill="#fff" />
        </svg>
        <span className="tour-after-2 overflow-hidden rounded-[8px]" style={boxStyle([60.6, 12.6, 35.5, 50.1])}>
          <Image src="/tour/photo.webp" alt="" fill sizes="140px" unoptimized className="object-cover" />
        </span>
      </>
    ),
  },
  // Captures waiting: pick a photo, then open the list.
  captures: {
    tap1: [18.9, 47.9],
    tap2: [87, 14.6],
    zoom: [70, 25],
    scale: 1.12,
    effects: () => (
      <>
        <Ring box={[4.8, 25.3, 28.3, 45.1]} after={1} />
        <Ring box={[79.5, 8.5, 16, 12.5]} after={2} round="rounded-[6px]" />
      </>
    ),
  },
};

/** A cursor whose tip is the tap point. */
const Hand = () => (
  <svg viewBox="0 0 26 26" className="tour-hand" aria-hidden="true">
    <path d="M5 2v19l5-4.6 3.6 7.7 3.3-1.5-3.6-7.6H20Z" fill="#fff" stroke="#0b1a3a" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

function Shot({ name, theme, scene }: { name: TourSceneKey; theme: 'light' | 'dark'; scene: Scene }) {
  const taps: Taps = { tap1: scene.tap1, tap2: scene.tap2 };
  const vars = {
    '--x1': pct(taps.tap1[0]),
    '--y1': pct(taps.tap1[1]),
    '--x2': pct(taps.tap2[0]),
    '--y2': pct(taps.tap2[1]),
    '--ox': pct(scene.zoom[0]),
    '--oy': pct(scene.zoom[1]),
    '--z': scene.scale,
  } as CSSProperties;

  return (
    <div className={`tour-scene-${theme} absolute inset-0`}>
      <div className="tour-zoom absolute inset-0" style={vars}>
        <Image src={`/tour/${name}-${theme}.webp`} alt="" fill sizes="340px" unoptimized priority className="object-cover" />
        {scene.effects(taps)}
        <span className="tour-ripple tour-ripple-1" style={{ left: pct(taps.tap1[0]), top: pct(taps.tap1[1]) }} />
        <span className="tour-ripple tour-ripple-2" style={{ left: pct(taps.tap2[0]), top: pct(taps.tap2[1]) }} />
        <Hand />
      </div>
    </div>
  );
}

export default function TourScene({ name }: { name: TourSceneKey }) {
  const scene = SCENES[name];
  return (
    <div aria-hidden="true" className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-inset">
      <Shot name={name} theme="light" scene={scene} />
      <Shot name={name} theme="dark" scene={scene} />
    </div>
  );
}
