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
  { title: 'Crack density measurement', detail: 'Defect area as a share of the road surface, not just per-defect size.' },
  { title: 'Real-world size estimation', detail: 'Lengths in metres and areas in square metres, not pixels.' },
  { title: 'Automated summary reports', detail: 'A maintenance bulletin generated locally, with no data leaving the device.' },
];

const AUDIENCES = [
  { name: 'Government agencies', detail: 'Objective, standardised condition data for budget planning.' },
  { name: 'Road engineers', detail: 'A visible reason for every severity grade assigned.' },
  { name: 'Local authorities', detail: 'Faster triage of which repairs to fund first.' },
];

export default function AboutUs() {
  return (
    <div className="pt-28 sm:pt-32 px-4 sm:px-10 pb-20 min-h-screen max-w-6xl mx-auto flex flex-col gap-6">
      {/* Intro */}
      <section className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5 flex flex-col justify-between gap-8">
          <div>
            <p className="text-oasys-blue font-bold mb-4 uppercase tracking-widest text-sm">
              Why are we here?
            </p>
            <h1 className="text-5xl sm:text-6xl font-black text-white leading-none">
              About
              <br />
              OASYS
            </h1>
          </div>
          <p className="text-gray-400 leading-relaxed">
            Road condition monitoring in the Philippines is largely manual: inspectors
            document defects by eye before maintenance decisions are made. It works,
            but it is slow, labour-intensive and open to subjective judgement.
          </p>
        </div>

        <div className="flex-1 bg-brand-gradient rounded-oasys p-8 sm:p-12 text-white shadow-xl border border-white/10 flex flex-col justify-center">
          <h2 className="text-3xl font-black mb-5 uppercase">What it does</h2>
          <p className="text-lg leading-relaxed text-gray-300">
            A web-based tool that detects road defects from uploaded images and rates
            their severity using neural perception combined with rule-based reasoning
            aligned with engineering standards.
          </p>
        </div>
      </section>

      {/* Defects */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5">
        <h2 className="text-2xl font-black mb-6 uppercase">Defects detected</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEFECTS.map((defect) => (
            <li key={defect.name} className="bg-black/25 rounded-2xl p-5 border border-white/5">
              <p className="font-bold text-white mb-1">{defect.name}</p>
              <p className="text-sm text-gray-400 leading-snug">{defect.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pipeline */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5">
        <h2 className="text-2xl font-black mb-2 uppercase">How it works</h2>
        <p className="text-gray-400 mb-8 max-w-2xl">
          Ten stages, from photograph to maintenance bulletin. Neural perception
          handles what the image contains; symbolic reasoning decides what it means.
        </p>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {PIPELINE.map((stage, index) => (
            <li key={stage.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="shrink-0 w-8 h-8 rounded-full bg-oasys-blue/15 text-oasys-blue border border-oasys-blue/30 font-black text-sm flex items-center justify-center"
              >
                {index + 1}
              </span>
              <div>
                <p className="font-bold text-white">{stage.title}</p>
                <p className="text-sm text-gray-400 leading-snug">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Severity */}
      <section className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5">
        <h2 className="text-2xl font-black mb-2 uppercase">Severity levels</h2>
        <p className="text-gray-400 mb-6 max-w-2xl">
          Graded from measured crack width and crack extent against the DPWH Visual
          Road Condition Assessment Manual — not from how confident the detector was.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          {(['Low', 'Medium', 'High'] as const).map((level) => (
            <div key={level} className="flex-1 bg-black/25 rounded-2xl p-5 border border-white/5">
              <SeverityBadge severity={level} size="md" className="mb-3" />
              <p className="text-sm text-gray-400 leading-snug">
                {level === 'Low' && 'Narrow cracking — 3 mm or less average width — over limited extent.'}
                {level === 'Medium' && 'Wide cracking above 3 mm, or narrow cracking spread across much of the surface.'}
                {level === 'High' && 'Wide cracking over extensive area, or surface failure such as a pothole.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features + evaluation */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5">
          <h2 className="text-2xl font-black mb-6 uppercase">Key features</h2>
          <ul className="flex flex-col gap-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span aria-hidden="true" className="text-oasys-blue font-black">
                  ✓
                </span>
                <div>
                  <p className="font-bold text-white">{feature.title}</p>
                  <p className="text-sm text-gray-400 leading-snug">{feature.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-card-bg rounded-oasys p-8 sm:p-12 border border-white/5">
          <h2 className="text-2xl font-black mb-6 uppercase">How it is evaluated</h2>
          <ul className="flex flex-col gap-4 text-gray-400">
            <li>
              <p className="font-bold text-white">Detection and severity accuracy</p>
              <p className="text-sm leading-snug">
                Precision, recall and segmentation overlap against annotated ground truth.
              </p>
            </li>
            <li>
              <p className="font-bold text-white">Neurosymbolic vs. neural-only output</p>
              <p className="text-sm leading-snug">
                Fuzzy reasoning compared against grading by detection confidence alone.
              </p>
            </li>
            <li>
              <p className="font-bold text-white">Agreement with human inspectors</p>
              <p className="text-sm leading-snug">
                Chance-corrected agreement with licensed engineers grading the same images blind.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* Audience */}
      <section className="bg-brand-gradient rounded-oasys p-8 sm:p-12 text-white shadow-xl border border-white/10">
        <h2 className="text-2xl font-black mb-6 uppercase">Who it helps</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {AUDIENCES.map((audience) => (
            <li key={audience.name}>
              <p className="font-black text-lg mb-1">{audience.name}</p>
              <p className="text-sm text-gray-400 leading-snug">{audience.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-400 border-t border-white/15 pt-6 max-w-3xl">
          OASYS is a decision-support tool that gives engineers objective, repeatable
          condition data to prioritise against.
        </p>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
        <Link href="/upload-media" className="btn-blue px-8 py-4">
          Scan an image
        </Link>
        <Link href="/report-damage" className="btn-blue px-8 py-4 bg-zinc-700 hover:bg-zinc-600">
          Report damage
        </Link>
      </div>
    </div>
  );
}
