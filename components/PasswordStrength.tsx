'use client';

import type { PasswordCheck } from '@/utils/passwordPolicy';

const BAR_COLOUR = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-500'];
const TEXT_COLOUR = ['text-danger', 'text-danger', 'text-warn', 'text-ok', 'text-ok'];

/**
 * Strength meter and the reasons a new password is refused. NIST SP 800-63B-4
 * asks for feedback like this rather than a bare "password not allowed".
 */
export default function PasswordStrength({
  password,
  check,
  breachNote,
  id,
}: {
  password: string;
  check: PasswordCheck;
  /** The breach-lookup result, once it has run. */
  breachNote?: string | null;
  id?: string;
}) {
  if (!password) return null;

  const filled = check.score + 1;

  return (
    <div id={id} className="mt-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex gap-1 flex-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < filled ? BAR_COLOUR[check.score] : 'bg-fg/10'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-bold ${TEXT_COLOUR[check.score]}`}>
          {check.label}
        </span>
      </div>
      {(check.problems.length > 0 || check.suggestions.length > 0 || breachNote) && (
        <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-muted leading-snug">
          {[...check.problems, ...check.suggestions].map((p) => (
            <li key={p}>• {p}</li>
          ))}
          {breachNote && <li className="text-danger font-bold">• {breachNote}</li>}
        </ul>
      )}
    </div>
  );
}
