// Tour card art: a real screenshot of the app (public/tour/*-light|dark.webp,
// taken from the dashboard and Report page at 1280px; admin-* from the admin
// pages at 1280px, a 960x600 crop of the content from 284,20, with sample data)
// with a hand tapping through it. Keyframes live in app/globals.css under "Tour scenes".
//
// Every position is a percentage of the screenshot, measured from the live
// page when the shots were taken. Retake the shots and these move with them.

import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

export type TourSceneKey =
  | 'overview'
  | 'stats'
  | 'map'
  | 'report'
  | 'captures'
  | 'admin-console'
  | 'admin-queue'
  | 'admin-reports'
  | 'admin-dashboard'
  | 'admin-users';

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

/** The bar a tab gets when picked, under the tab at `box`. */
const TabBar = ({ box, after, color = 'var(--accent)' }: { box: Box; after: 1 | 2; color?: string }) => (
  <span
    className={`tour-after-${after} h-[3px] rounded-full`}
    style={{ left: pct(box[0]), top: pct(box[1] + box[3]), width: pct(box[2]), background: color }}
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
  // Admin console: open the queue, then the Needs action tile.
  'admin-console': {
    tap1: [88.5, 8.7],
    tap2: [13.5, 71.4],
    zoom: [50, 40],
    scale: 1.12,
    effects: () => (
      <>
        <Ring box={[78.9, 5, 19.1, 7.3]} after={1} round="rounded-full" />
        <Ring box={[2.1, 57.9, 22.7, 26.9]} after={2} round="rounded-[14px]" />
      </>
    ),
  },
  // Console, scrolled: the High severity tile, then the first report in Next up.
  'admin-queue': {
    tap1: [37.9, 16.4],
    tap2: [33.8, 47.6],
    zoom: [35, 30],
    scale: 1.15,
    effects: () => (
      <>
        <Ring box={[26.5, 2.9, 22.7, 26.9]} after="between" round="rounded-[14px]" />
        <Ring box={[3.8, 42.6, 59.9, 10]} after={2} />
      </>
    ),
  },
  // Reports: filter to High, then open the first card.
  'admin-reports': {
    tap1: [74.8, 29],
    tap2: [89.9, 43],
    zoom: [78, 35],
    scale: 1.15,
    effects: () => (
      <>
        <TabBar box={[71.6, 27, 6.4, 4]} after={1} color="var(--sev-high)" />
        <Ring box={[2.1, 33.7, 95.9, 18.6]} after={2} round="rounded-[14px]" />
      </>
    ),
  },
  // Dashboard: switch the range to 12 months, then the chart to By severity.
  'admin-dashboard': {
    tap1: [19.5, 18.3],
    tap2: [82, 62.7],
    zoom: [50, 40],
    scale: 1.1,
    effects: () => (
      <>
        <TabBar box={[16.1, 16.3, 6.8, 4]} after={1} />
        <TabBar box={[78.3, 60.7, 7.3, 4]} after={2} />
      </>
    ),
  },
  // Users: filter to Inspectors, then make one an admin.
  'admin-users': {
    tap1: [66.6, 22.5],
    tap2: [91.2, 55.1],
    zoom: [70, 40],
    scale: 1.12,
    effects: () => (
      <>
        <TabBar box={[62.5, 20.5, 8.2, 4]} after={1} />
        <Ring box={[85.3, 52.1, 11.7, 6]} after={2} />
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
