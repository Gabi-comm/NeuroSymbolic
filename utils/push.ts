'use client';

import { supabase } from '@/utils/supabase';

/**
 * Browser side of the admin new-report alerts. A phone subscribes through the
 * service worker (public/sw.js) and the subscription is stored with
 * save_push_subscription (migration.sql section K), which only admins may
 * call. The database trigger then hands the subscriptions to
 * /api/push/new-report on every new report.
 */
export type PushState =
  | 'loading'
  | 'unsupported' // no service worker / Push API, or not on HTTPS
  | 'needs-install' // iPhone/iPad: Web Push only works from the Home Screen app
  | 'denied' // the user blocked notifications for this site
  | 'off'
  | 'on';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const supported = () =>
  !!VAPID_PUBLIC_KEY &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** The worker that owns push. ServiceWorker.tsx registers it in production
 *  only; registering the same file again is a no-op, and needed in dev. */
const registration = async () => {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
};

const toKey = (base64: string) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const save = async (sub: PushSubscription) => {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw new Error(error.message);
};

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return 'off';
  // Re-save on every visit: keeps the row pointing at whoever is signed in
  // on this phone now. Best effort; the phone stays subscribed regardless.
  await save(sub).catch(() => {});
  return 'on';
}

/** Must run from a tap: browsers only show the permission prompt then. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }));
  try {
    await save(sub);
  } catch (e) {
    // Not saved means no alerts would ever arrive; do not pretend otherwise.
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
  return 'on';
}

/** Turn alerts off on this phone. Also called before signing out. */
export async function disablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator)) return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}
