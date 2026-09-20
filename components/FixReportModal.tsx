'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/utils/supabase';
import { SeverityBadge, type Severity } from './Severity';
import type { Position } from '@/app/report-damage/Map';

const MapComponent = dynamic(() => import('@/app/report-damage/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black/40 text-gray-400 font-bold text-sm">
      Loading map…
    </div>
  ),
});

/**
 * Correct a submitted report.
 *
 * "Mark resolved" was the only action available, which assumed every report was
 * right. In practice a report can be right about the defect and wrong about
 * where it is, or the model can misclassify a crack that an engineer recognises
 * at a glance.
 *
 * Two kinds of field, handled differently on purpose:
 *
 *   LOCATION is user-supplied, not model output. A wrong pin is simply wrong,
 *   so it is corrected in place.
 *
 *   SEVERITY and DAMAGE TYPE are the model's output. Overwriting them would
 *   destroy the evidence research questions 3 and 4 rest on. The original stays
 *   untouched and the admin's verdict is recorded beside it -- which also means
 *   every correction is a licensed engineer disagreeing with the model on a
 *   specific detection: exactly the paired data Cohen's Kappa needs.
 */
export interface FixableReport {
  id: number | string;
  damage_type: string | null;
  severity: string | null;
  corrected_damage_type: string | null;
  corrected_severity: string | null;
  correction_note: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const DAMAGE_TYPES = [
  'Alligator Crack',
  'Longitudinal Crack',
  'Transverse Crack',
  'Pothole',
];
const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];

/** Caloocan City — the study area, used when a report has no coordinates. */
const DEFAULT_CENTRE: Position = { lat: 14.6566, lng: 120.9796 };

interface Props {
  report: FixableReport;
  onClose: () => void;
  onSaved: (patch: Partial<FixableReport>) => void;
}

export default function FixReportModal({ report, onClose, onSaved }: Props) {
  const [damageType, setDamageType] = useState(
    report.corrected_damage_type ?? report.damage_type ?? ''
  );
  const [severity, setSeverity] = useState(
    report.corrected_severity ?? report.severity ?? ''
  );
  const [address, setAddress] = useState(report.address ?? '');
  const [position, setPosition] = useState<Position>(
    report.lat != null && report.lng != null
      ? { lat: Number(report.lat), lng: Number(report.lng) }
      : DEFAULT_CENTRE
  );
  const [note, setNote] = useState(report.correction_note ?? '');
  const [showMap, setShowMap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const lookUpAddress = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data?.display_name) setAddress(data.display_name);
    } catch {
      // Keep whatever the admin typed; the coordinates are what matter.
    }
  };

  const typeChanged = damageType !== (report.damage_type ?? '');
  const severityChanged = severity !== (report.severity ?? '');

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const patch = {
        // In place: user-supplied, no evidence to preserve.
        address: address.trim() || null,
        lat: position.lat,
        lng: position.lng,
        // Beside the original: only recorded when the admin actually disagrees,
        // so an untouched field does not look like a reviewed one.
        corrected_damage_type: typeChanged ? damageType : null,
        corrected_severity: severityChanged ? severity : null,
        correction_note: note.trim() || null,
        corrected_at: new Date().toISOString(),
        corrected_by: user?.id ?? null,
      };

      const { error } = await supabase
        .from('FileUpload')
        .update(patch)
        .eq('id', report.id);

      if (error) throw new Error(error.message);

      onSaved(patch);
      onClose();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Could not save the correction.');
    } finally {
      setIsSaving(false);
    }
  };

  const field =
    'w-full bg-white text-black px-4 py-2.5 rounded-xl outline-none border border-transparent ' +
    'focus:border-oasys-blue focus:ring-2 focus:ring-oasys-blue/40 transition-all';
  const label = 'block text-xs font-bold text-gray-300 mb-1.5 uppercase tracking-wide';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-report-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-panel-gradient border border-white/10 rounded-oasys shadow-2xl w-full max-w-2xl my-8 p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 id="fix-report-title" className="text-2xl font-black text-white">
            Fix report
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          RPT-{String(report.id).slice(0, 8).toUpperCase()} — correct anything the
          system got wrong.
        </p>

        <div className="flex flex-col gap-5">
          {/* Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fix-type" className={label}>
                Damage type
              </label>
              <select
                id="fix-type"
                value={damageType}
                onChange={(e) => setDamageType(e.target.value)}
                className={field}
              >
                {!DAMAGE_TYPES.includes(damageType) && damageType && (
                  <option value={damageType}>{damageType}</option>
                )}
                {DAMAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {typeChanged && (
                <p className="text-xs text-gray-500 mt-1.5">
                  System said: <span className="text-gray-300">{report.damage_type}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="fix-severity" className={label}>
                Severity
              </label>
              <select
                id="fix-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className={field}
              >
                {SEVERITIES.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
              {severityChanged && (
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                  System said: <SeverityBadge severity={report.severity} />
                </p>
              )}
            </div>
          </div>

          {(typeChanged || severityChanged) && (
            <p className="text-xs text-oasys-blue bg-oasys-blue/10 border border-oasys-blue/25 rounded-xl px-4 py-3 leading-snug">
              The system&apos;s original assessment is kept as recorded evidence. Your
              verdict is stored alongside it, not over it.
            </p>
          )}

          {/* Location */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label htmlFor="fix-address" className={label}>
                Location
              </label>
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="text-xs font-bold text-oasys-blue hover:underline"
              >
                {showMap ? 'Hide map' : 'Correct on map'}
              </button>
            </div>

            <input
              id="fix-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={field}
              placeholder="Street address"
            />

            {showMap && (
              <div className="mt-3">
                <div className="h-64 rounded-2xl overflow-hidden border border-white/10">
                  <MapComponent
                    position={position}
                    setPosition={setPosition}
                    fetchAddress={lookUpAddress}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 tabular-nums">
                  Tap the map to move the pin · {position.lat.toFixed(5)},{' '}
                  {position.lng.toFixed(5)}
                </p>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label htmlFor="fix-note" className={label}>
              Note <span className="text-gray-500 normal-case">(optional)</span>
            </label>
            <textarea
              id="fix-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${field} resize-none`}
              placeholder="Why was this corrected?"
            />
          </div>

          <div aria-live="polite" className="min-h-[1.25rem]">
            {errorMsg && (
              <p role="alert" className="text-red-400 text-sm font-bold">
                {errorMsg}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="sm:flex-1 px-6 py-3 rounded-full font-bold bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-blue sm:flex-1 px-6 py-3"
            >
              {isSaving ? 'Saving…' : 'Save correction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
