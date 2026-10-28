// Looping micro-demos for the help popovers. Pure SVG + CSS (keyframes live in
// app/globals.css under "Help demos"), drawn on a 240x140 stage in theme
// colours, so they follow Light / Dark and stop under reduced motion.

import type { ReactNode } from 'react';

export type HelpTopic = 'map' | 'capture' | 'pin' | 'upload' | 'result' | 'track';

const Stage = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 240 140" className="w-full h-auto rounded-xl bg-inset" aria-hidden="true">
    {children}
  </svg>
);

const MapBackdrop = () => (
  <g stroke="var(--line-strong)" strokeWidth="1">
    <path d="M0 40 H240 M0 95 H240 M60 0 V140 M150 0 V140" />
    <path d="M0 125 L240 15" strokeWidth="6" stroke="var(--line)" />
  </g>
);

const Pin = ({ x, y, fill, cls, delay = 0 }: { x: number; y: number; fill: string; cls: string; delay?: number }) => (
  <g className={cls} style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}>
    <circle cx={x} cy={y} r="8" fill={fill} stroke="var(--surface)" strokeWidth="2.5" />
  </g>
);

const DEMOS: Record<HelpTopic, { title: string; body: string; art: ReactNode }> = {
  map: {
    title: 'Your map',
    body: 'Every report you filed, pinned where you took it. Tap a number above or a tab to filter the pins.',
    art: (
      <Stage>
        <MapBackdrop />
        <Pin x={70} y={60} fill="var(--sev-high)" cls="demo-drop" delay={0} />
        <Pin x={130} y={82} fill="var(--sev-medium)" cls="demo-drop" delay={0.3} />
        <Pin x={185} y={45} fill="var(--sev-low)" cls="demo-drop" delay={0.6} />
        <rect className="demo-tab" x="20" y="124" width="40" height="3" rx="1.5" fill="var(--accent)" />
      </Stage>
    ),
  },
  pin: {
    title: 'Pin the location',
    body: 'Use your location or tap the map where the distress is. The address fills in by itself.',
    art: (
      <Stage>
        <MapBackdrop />
        <circle className="demo-ring" cx="120" cy="72" r="10" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ transformOrigin: '120px 72px' }} />
        <g className="demo-drop" style={{ transformOrigin: '120px 72px' }}>
          <path d="M120 80 C108 66 108 52 120 48 C132 52 132 66 120 80Z" fill="var(--accent)" />
          <circle cx="120" cy="59" r="4" fill="var(--surface)" />
        </g>
        <rect className="demo-type" x="60" y="108" width="120" height="14" rx="7" fill="var(--surface)" stroke="var(--line)" />
      </Stage>
    ),
  },
  upload: {
    title: 'Upload a photo',
    body: 'One clear photo of the road surface is enough. Location data inside the photo is read automatically.',
    art: (
      <Stage>
        <rect x="70" y="30" width="100" height="80" rx="12" fill="none" stroke="var(--line-strong)" strokeDasharray="6 5" strokeWidth="1.5" />
        <g className="demo-slide">
          <rect x="88" y="44" width="64" height="48" rx="6" fill="var(--surface)" stroke="var(--line)" />
          <path d="M92 86 L110 66 L122 78 L132 70 L148 86Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1" />
        </g>
        <rect x="70" y="120" width="100" height="4" rx="2" fill="var(--line)" />
        <rect className="demo-progress" x="70" y="120" width="100" height="4" rx="2" fill="var(--accent)" style={{ transformOrigin: '70px 122px' }} />
      </Stage>
    ),
  },
  result: {
    title: 'Read the result',
    body: 'OASYS boxes each distress, measures it in millimetres and grades it against DPWH standards.',
    art: (
      <Stage>
        <rect x="30" y="20" width="180" height="100" rx="10" fill="var(--surface)" stroke="var(--line)" />
        <ellipse cx="110" cy="76" rx="34" ry="14" fill="var(--line-strong)" />
        <rect className="demo-box" x="70" y="56" width="80" height="40" rx="3" fill="none" stroke="#22c55e" strokeWidth="2" pathLength="100" strokeDasharray="100" />
        <g className="demo-pop" style={{ transformOrigin: '170px 40px' }}>
          <path d="M166 31h8l6 6v8l-6 6h-8l-6-6v-8Z" fill="var(--sev-high)" />
          <rect x="150" y="54" width="44" height="6" rx="3" fill="var(--sev-high)" opacity=".5" />
        </g>
      </Stage>
    ),
  },
  capture: {
    title: 'Capture now, report later',
    body: 'On the road with no time? Snap the distress; the place is saved. Report it from Captured Distress later.',
    art: (
      <Stage>
        <rect x="88" y="14" width="64" height="112" rx="12" fill="var(--surface)" stroke="var(--line-strong)" />
        <rect x="95" y="26" width="50" height="70" rx="5" fill="var(--line)" />
        <circle cx="120" cy="110" r="7" fill="none" stroke="var(--accent)" strokeWidth="2" />
        <rect className="demo-flash" x="95" y="26" width="50" height="70" rx="5" fill="#ffffff" />
        <g className="demo-stack">
          <rect x="176" y="70" width="36" height="28" rx="4" fill="var(--surface)" stroke="var(--accent)" />
        </g>
      </Stage>
    ),
  },
  track: {
    title: 'Track each report',
    body: 'Every report stays on My reports. It shows Needs Action until an engineer marks it Resolved.',
    art: (
      <Stage>
        {[30, 62, 94].map((y, i) => (
          <g key={y}>
            <rect x="30" y={y} width="180" height="24" rx="6" fill="var(--surface)" stroke="var(--line)" />
            <rect x="40" y={y + 9} width="70" height="6" rx="3" fill="var(--line-strong)" />
            <circle cx="186" cy={y + 12} r="4" fill={i === 0 ? undefined : 'var(--warn)'} className={i === 0 ? 'demo-status' : undefined} />
          </g>
        ))}
      </Stage>
    ),
  },
};

export default function HelpDemo({ topic }: { topic: HelpTopic }) {
  const demo = DEMOS[topic];
  return (
    <div>
      {demo.art}
      <p className="mt-3 text-sm font-semibold text-fg">{demo.title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{demo.body}</p>
    </div>
  );
}
