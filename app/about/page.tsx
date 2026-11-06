import type { Metadata } from 'next';
import Link from 'next/link';
import { SeverityBadge } from '@/components/Severity';

export const metadata: Metadata = {
  title: 'About',
  description:
    'How OASYS detects road defects and grades their severity using neural ' +
    'perception combined with rule-based reasoning aligned to engineering standards.',
};

const DEFECTS = [
  { name: 'Potholes', note: 'Bowl-shaped surface failures' },
  { name: 'Alligator cracks', note: 'Interconnected fatigue cracking' },
  { name: 'Longitudinal cracks', note: 'Parallel to the centreline' },
  { name: 'Transverse cracks', note: 'Perpendicular to the centreline' },
];

const PIPELINE = [
  { title: 'Upload', detail: 'An inspector photographs the road following capture guidelines.' },
  { title: 'Road detection', detail: 'The road surface is isolated from the surroundings.' },
  { title: 'Perspective correction', detail: 'Inverse Perspective Mapping flattens the view for measurement.' },
  { title: 'Defect detection', detail: 'Defects are located and classified by type.' },
  { title: 'Box filtering', detail: 'Overlapping duplicate detections are removed.' },
  { title: 'SAM masking', detail: 'The exact shape of each defect is segmented.' },
  { title: 'Skeletonization', detail: 'The crack structure is traced to a centreline.' },
  { title: 'Physical metrics', detail: 'Real-world size is computed via Ground Sample Distance.' },
  { title: 'Severity reasoning', detail: 'A fuzzy logic engine grades severity against engineering thresholds.' },
  { title: 'Summary report', detail: 'A local language model writes a readable maintenance bulletin.' },
];

const FEATURES = [
  { title: 'Explainable results', detail: 'Every grade traces to a rule and a measurement, not a score from a black box.' },
  { title: 'Distress density measurement', detail: 'Defect area as a share of the road surface, not just per-defect size.' },
  { title: 'Real-world size estimation', detail: 'Lengths in metres and areas in square metres, not pixels.' },
  { title: 'Automated summary reports', detail: 'A maintenance bulletin generated locally, with no data leaving the device.' },
];

// Every source a number in the calculation comes from, Philippine only. Keep in
// step with backend/fuzzy_engine.py, backend/api.py and proof.md.
const REFERENCES = [
  {
    source: 'DPWH Department Order No. 120, Series of 2019',
    uses: [
      'The 3 mm crack-width line: Narrow ≤ 3 mm, Wide > 3 mm average crack width (Low / Medium boundary).',
      'Crack extent (density): total area of cracking over total area of the segment, as a percentage.',
      'Pothole unit: one pothole is equivalent to 0.25 m² (Medium / High pothole line).',
      'Severity and extent rated together on a two-dimensional scale; VCI weight factors (Table 4) used to make alligator cracking escalate faster than other cracks.',
    ],
  },
  {
    source: 'DPWH Department Order No. 47, Series of 2024',
    uses: [
      'Table 5.1, Beyond Routine Maintenance: alligator cracks over 167.5 m² (continuous), the anchor for the "dense" extent level (about 55% of a 3.05 m lane over 100 m).',
      'Table 4.1, response times: 3 working days for potholes, alligator cracks and cracks.',
      'Table 6.1a, inspection weights (potholes 10%, alligator cracks 9%, cracks 5%), used for the priority order.',
      'Appendix A-9, maintenance activities: Act. 111, 112, 113, 121 and 122 in each repair recommendation.',
    ],
  },
  {
    source: 'DPWH Standard Specifications for Highways, Bridges and Airports, Vol. II (Blue Book)',
    uses: ['Item 311: the repair for High-severity cracking on concrete, full slab reblocking.'],
  },
  {
    source: 'DILG Local Road and Bridge Inventory and Condition Survey (LRBICS) Manual, 2020',
    uses: [
      'Sec. III.5.2.4, pp. 121–122: the same 3 mm Narrow / Wide crack-width line, for local roads.',
      'Sec. III.5.2.5, p. 124: a slab that needs re-blocking is "shattered", the basis for High on concrete.',
      'Sec. III.5.1.2, p. 98: severe cracking with base failure on asphalt is rated as a pothole.',
    ],
  },
  {
    source: 'DPWH Department Order No. 88, Series of 2020',
    uses: [
      'Minimum urban lane width of 3.05 m. The capture guide frames one lane across the 700 px top-down view, so 3,050 mm ÷ 700 px = 4.357 mm per pixel, the scale used to turn pixels into millimetres and square metres.',
    ],
  },
  {
    source: 'City Engineer, City of Caloocan: validated severity criteria for Samson Road',
    uses: [
      'The 10 mm line between Medium (open cracks, 3–10 mm) and High (wide structural cracks, over 10 mm). No Philippine standard publishes a 10 mm cut; this is the City Engineer’s validated criterion for Samson Road.',
      'The High wording: alligator cracking over continuous sections, road no longer serviceable, needing full slab reblocking or structural replacement.',
      'One pothole up to 0.25 m² is Medium; a larger one, or several, is High.',
    ],
  },
  {
    source: 'Republic Act No. 10173, Data Privacy Act of 2012',
    uses: ['Why faces and vehicle plates are blurred before any photo is measured or stored.'],
  },
];

const AUDIENCES = [
  { name: 'Government agencies', detail: 'Objective, standardised condition data for budget planning.' },
  { name: 'Road engineers', detail: 'A visible reason for every severity grade assigned.' },
  { name: 'Local authorities', detail: 'Faster triage of which repairs to fund first.' },
];

export default function AboutUs() {
  return (
    <div className="pt-8 md:pt-12 px-4 sm:px-10 pb-20 min-h-screen max-w-6xl mx-auto flex flex-col gap-6">
      {/* Intro */}
      <section className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 bg-card-bg rounded-oasys p-8 sm:p-12 border border-line flex flex-col justify-between gap-8">
          <div>
            <p className="text-oasys-blue font-bold mb-4 uppercase tracking-widest text-sm">
              Why are we here?
            </p>
            <h1 className="text-5xl sm:text-6xl font-semibold text-fg leading-none">
              About
              <br />
              OASYS
            </h1>
          </div>
          <p className="text-fg-muted leading-relaxed">
            Road condition monitoring in the Philippines is largely manual: inspectors
            document defects by eye before maintenance decisions are made. It works,
            but it is slow, labour-intensive and open to subjective judgement.
          </p>
        </div>

        <div className="flex-1 bg-brand-gradient rounded-oasys p-8 sm:p-12 text-white shadow-xl border border-line flex flex-col justify-center">
          <h2 className="text-3xl font-semibold mb-5 uppercase">What it does</h2>
          <p className="text-lg leading-relaxed text-fg-soft">
            A web-based tool that detects road defects from uploaded images and rates
            their severity using neural perception combined with rule-based reasoning
            aligned with engineering standards.
          </p>
        </div>
      </section>

      {/* Defects */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
        <h2 className="text-2xl font-semibold mb-6 uppercase">Defects detected</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEFECTS.map((defect) => (
            <li key={defect.name} className="bg-inset rounded-2xl p-5 border border-line">
              <p className="font-bold text-fg mb-1">{defect.name}</p>
              <p className="text-sm text-fg-muted leading-snug">{defect.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pipeline */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
        <h2 className="text-2xl font-semibold mb-2 uppercase">How it works</h2>
        <p className="text-fg-muted mb-8 max-w-2xl">
          Ten stages, from photograph to maintenance bulletin. Neural perception
          handles what the image contains; symbolic reasoning decides what it means.
        </p>
        {/* Numbered down each column (1-5, then 6-10) so the order reads as a
            sequence. Each step sits under a hairline whose start is marked in
            accent above its number; the number is part of the list's order,
            so the visible one is decorative. */}
        <ol className="grid grid-cols-1 md:grid-cols-2 md:grid-flow-col md:grid-rows-5 gap-x-10">
          {PIPELINE.map((stage, index) => (
            <li key={stage.title} className="relative grid grid-cols-[3.25rem_1fr] gap-x-2 py-4 border-t border-line">
              <span aria-hidden="true" className="absolute -top-px left-0 w-9 h-0.5 rounded-full bg-accent" />
              <span aria-hidden="true" className="font-stat text-[1.9rem] leading-none text-accent tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="pt-0.5">
                <p className="font-bold text-fg leading-tight">{stage.title}</p>
                <p className="mt-1 text-sm text-fg-muted leading-snug">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Severity */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
        <h2 className="text-2xl font-semibold mb-2 uppercase">Severity levels</h2>
        <p className="text-fg-muted mb-6 max-w-2xl">
          Graded from measured crack width and crack extent against the DPWH Visual
          Road Condition Assessment Manual and the City Engineer&apos;s validated bands —
          not from how confident the detector was.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {(['Low', 'Medium', 'High'] as const).map((level) => (
            <div key={level} className="flex-1 bg-inset rounded-2xl p-5 border border-line">
              <SeverityBadge severity={level} size="md" className="mb-3" />
              <p className="text-sm text-fg-muted leading-snug">
                {level === 'Low' && 'Micro cracks under 3 mm (DPWH Narrow), sparse. Routine preventive maintenance.'}
                {level === 'Medium' && 'Open cracks of 3 to 10 mm, or a single pothole up to 0.25 m². Localized patching or sealing.'}
                {level === 'High' && 'Wide structural cracks over 10 mm, alligator cracking over continuous sections, or a larger pothole or several. The road is not serviceable.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* References */}
      <section id="references" className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
        <h2 className="text-2xl font-semibold mb-2 uppercase">References</h2>
        <p className="text-fg-muted mb-8 max-w-3xl">
          Every number OASYS uses to measure and grade a defect comes from one of
          these sources. All are Philippine standards or the study area&apos;s City
          Engineer.
        </p>
        <ol className="flex flex-col gap-4">
          {REFERENCES.map((ref, index) => (
            <li key={ref.source} className="bg-inset rounded-2xl p-5 sm:p-6 border border-line grid grid-cols-[2.25rem_1fr] gap-x-3">
              <span aria-hidden="true" className="font-stat text-xl leading-none text-accent tabular-nums pt-0.5">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-fg leading-snug">{ref.source}</p>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm text-fg-soft leading-snug list-disc pl-4">
                  {ref.uses.map((use) => (
                    <li key={use}>{use}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features + evaluation */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
          <h2 className="text-2xl font-semibold mb-6 uppercase">Key features</h2>
          <ul className="flex flex-col gap-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span aria-hidden="true" className="text-oasys-blue font-semibold">
                  ✓
                </span>
                <div>
                  <p className="font-bold text-fg">{feature.title}</p>
                  <p className="text-sm text-fg-muted leading-snug">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-line">
          <h2 className="text-2xl font-semibold mb-6 uppercase">How it is evaluated</h2>
          <ul className="flex flex-col gap-4 text-fg-muted">
            <li>
              <p className="font-bold text-fg">Detection and severity accuracy</p>
              <p className="text-sm leading-snug">
                Precision, recall and segmentation overlap against annotated ground truth.
              </p>
            </li>
            <li>
              <p className="font-bold text-fg">Neurosymbolic vs. neural-only output</p>
              <p className="text-sm leading-snug">
                Fuzzy reasoning compared against grading by detection confidence alone.
              </p>
            </li>
            <li>
              <p className="font-bold text-fg">Agreement with human inspectors</p>
              <p className="text-sm leading-snug">
                Chance-corrected agreement with licensed engineers grading the same images blind.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* Audience */}
      <section className="bg-brand-gradient rounded-oasys p-8 sm:p-12 text-white shadow-xl border border-line">
        <h2 className="text-2xl font-semibold mb-6 uppercase">Who it helps</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {AUDIENCES.map((audience) => (
            <li key={audience.name}>
              <p className="font-semibold text-lg mb-1">{audience.name}</p>
              <p className="text-sm text-fg-muted leading-snug">{audience.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted border-t border-line-strong pt-6 max-w-3xl">
          OASYS is a decision-support tool that gives engineers objective, repeatable
          condition data to prioritise against.
        </p>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
        <Link href="/report-damage" className="btn-blue px-8 py-4">
          Report distress
        </Link>
      </div>
    </div>
  );
}
