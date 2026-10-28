// A top-down street along the bottom of the dashboard hero, with traffic in
// both lanes: cars, a jeepney and a motorcycle. Pure SVG + CSS (`drive` in
// app/globals.css). Daylight asphalt in Light mode, headlights on in Dark.
//
// Every vehicle in a lane shares the lane's speed and they are spaced evenly
// along the loop, so they never catch up with or overlap one another; each
// starts and ends fully off the road, so none pops in or out mid-road.

type Kind = 'car' | 'jeep' | 'moto';

interface Vehicle {
  kind: Kind;
  colour: string;
}

const EASTBOUND: Vehicle[] = [
  { kind: 'car', colour: '#f8fafc' },
  { kind: 'jeep', colour: '#e11d48' },
  { kind: 'car', colour: '#38bdf8' },
];

const WESTBOUND: Vehicle[] = [
  { kind: 'car', colour: '#fbbf24' },
  { kind: 'moto', colour: '#65a30d' },
  { kind: 'car', colour: '#64748b' },
];

/** Seconds for one pass across the hero, per lane. */
const EAST_SPEED = 13;
const WEST_SPEED = 11;

const GLASS = '#0a1430';
const HEAD = '#fff6c7';
const TAIL = '#ff4d4d';

/** Low beam ahead of the vehicle, drawn first so the body sits on top. */
const Beam = ({ x, w }: { x: number; w: number }) => (
  <path className="street-beam" d={`M${x} 4 L${x + w} -4 L${x + w} 26 L${x} 18 Z`} fill="url(#street-beam)" />
);

function Body({ kind, colour }: { kind: Kind; colour: string }) {
  if (kind === 'moto') {
    return (
      <svg width="62" height="22" viewBox="0 0 62 22" overflow="visible" aria-hidden="true">
        <Beam x={24} w={36} />
        <rect x="2" y="8" width="22" height="6" rx="3" fill="#1f2937" />
        <circle cx="12" cy="11" r="4.2" fill={colour} />
        <rect x="21.5" y="9.5" width="2" height="3" rx="1" fill={HEAD} />
        <rect x="1" y="9.6" width="1.6" height="2.8" rx="0.8" fill={TAIL} />
      </svg>
    );
  }
  if (kind === 'jeep') {
    // A jeepney: long body, silver hood, painted roof stripes.
    return (
      <svg width="118" height="24" viewBox="0 0 118 24" overflow="visible" aria-hidden="true">
        <Beam x={76} w={42} />
        <rect x="1" y="1" width="75" height="22" rx="4" fill={colour} />
        <rect x="60" y="2.5" width="15" height="19" rx="3" fill="#cbd5e1" />
        <rect x="55" y="3" width="5" height="18" rx="1.5" fill={GLASS} />
        <rect x="6" y="4" width="47" height="3" rx="1.5" fill="#fbbf24" />
        <rect x="6" y="10.5" width="47" height="3" rx="1.5" fill="#22d3ee" />
        <rect x="6" y="17" width="47" height="3" rx="1.5" fill="#fbbf24" />
        <rect x="73.5" y="3.5" width="2.5" height="4" rx="1" fill={HEAD} />
        <rect x="73.5" y="16.5" width="2.5" height="4" rx="1" fill={HEAD} />
        <rect x="0.5" y="3.5" width="2" height="4" rx="1" fill={TAIL} />
        <rect x="0.5" y="16.5" width="2" height="4" rx="1" fill={TAIL} />
      </svg>
    );
  }
  return (
    <svg width="90" height="22" viewBox="0 0 90 22" overflow="visible" aria-hidden="true">
      <Beam x={48} w={42} />
      <rect x="1" y="1" width="47" height="20" rx="6.5" fill={colour} />
      <rect x="15" y="3" width="15" height="16" rx="2.5" fill="#000" opacity="0.12" />
      <rect x="30" y="3" width="9" height="16" rx="3" fill={GLASS} opacity="0.9" />
      <rect x="9" y="3.5" width="5.5" height="15" rx="2.5" fill={GLASS} opacity="0.75" />
      <rect x="45.5" y="3" width="2.5" height="4" rx="1" fill={HEAD} />
      <rect x="45.5" y="15" width="2.5" height="4" rx="1" fill={HEAD} />
      <rect x="0.5" y="3" width="2" height="4" rx="1" fill={TAIL} />
      <rect x="0.5" y="15" width="2" height="4" rx="1" fill={TAIL} />
    </svg>
  );
}

function Lane({ vehicles, speed, top, reverse }: { vehicles: Vehicle[]; speed: number; top: string; reverse?: boolean }) {
  return (
    <>
      {vehicles.map((v, i) => (
        <div
          key={i}
          className={`street-track ${reverse ? 'street-west' : ''}`}
          // Negative delay = already i/n of the way along, so the lane is evenly
          // filled from the first frame.
          style={{ top, animationDuration: `${speed}s`, animationDelay: `${(-i / vehicles.length) * speed}s` }}
        >
          <div className={`street-vehicle w-max -translate-y-1/2 ${reverse ? '-scale-x-100' : ''}`}>
            <Body kind={v.kind} colour={v.colour} />
          </div>
        </div>
      ))}
    </>
  );
}

export default function Street() {
  return (
    <div aria-hidden="true" className="street absolute inset-x-0 bottom-0 h-[84px] overflow-hidden pointer-events-none">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="street-beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff6c7" stopOpacity="0.38" />
            <stop offset="1" stopColor="#fff6c7" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {/* Kerbs and the centre line */}
      <div className="street-kerb absolute inset-x-0 top-[5px] h-px" />
      <div className="street-kerb absolute inset-x-0 bottom-[5px] h-px" />
      <div className="street-centre absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" />

      <Lane vehicles={WESTBOUND} speed={WEST_SPEED} top="28%" reverse />
      <Lane vehicles={EASTBOUND} speed={EAST_SPEED} top="72%" />
    </div>
  );
}
