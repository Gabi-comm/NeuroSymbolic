'use client';

import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, type PushState } from '@/utils/push';
import { IconBell } from '@/components/shell/icons';

/**
 * "New report alerts" on the admin console: turns phone notifications for new
 * reports on or off for this device. Per device, not per account, because a
 * push subscription belongs to one browser on one phone.
 */
const NOTE: Partial<Record<PushState, string>> = {
  'needs-install':
    'On iPhone, add OASYS to your Home Screen first (Share → Add to Home Screen), open it from there, then turn this on.',
  unsupported: 'This browser cannot receive notifications. Use Chrome on Android, or the Home Screen app on iPhone.',
  denied: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.',
};

export default function PushToggle() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('off'));
  }, []);

  const on = state === 'on';
  const usable = state === 'on' || state === 'off';

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      setState(on ? await disablePush() : await enablePush());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change alerts. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // mb-4: the console's blocks space themselves (16px, as the rows below use mt-4).
    <section className="page-enter mb-4 rounded-2xl bg-surface border border-line p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`shrink-0 ${on ? 'text-oasys-blue' : 'text-fg-faint'}`}>
          <IconBell className="w-6 h-6" />
        </span>
        <div className="grow min-w-0">
          <h2 id="push-title" className="text-base font-semibold text-fg">
            New report alerts
          </h2>
          <p className="text-sm text-fg-muted">
            {state === 'loading' ? (
              <span className="skeleton inline-block h-4 w-40 rounded" />
            ) : on ? (
              <>
                <span className="text-ok">●</span> On for this phone
              </>
            ) : (
              <>
                <span className="text-fg-faint">○</span> Off on this phone
              </>
            )}
          </p>
        </div>
        {usable && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="push-title"
            onClick={toggle}
            disabled={busy}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${
              on ? 'bg-oasys-blue' : 'bg-line-strong'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                on ? 'translate-x-5' : ''
              }`}
            />
          </button>
        )}
      </div>
      {(NOTE[state] || error) && (
        <p role={error ? 'alert' : undefined} className={`mt-3 text-sm ${error ? 'text-danger font-bold' : 'text-fg-muted'}`}>
          {error || NOTE[state]}
        </p>
      )}
    </section>
  );
}
