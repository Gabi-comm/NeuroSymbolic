import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import webpush, { type PushSubscription } from 'web-push';

/**
 * Sends the "new report" push to every admin phone that turned alerts on.
 *
 * Called by Postgres, not the browser: the notify_new_report trigger on
 * "FileUpload" (migration.sql section K) posts the new report and the admins'
 * subscriptions here through pg_net, with PUSH_WEBHOOK_SECRET as a bearer
 * token. So the site needs no Supabase service key: everything it needs
 * arrives in the request, and the secret is what keeps strangers from using
 * this route to push messages to the admins.
 *
 * Needs, on the server: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT, PUSH_WEBHOOK_SECRET.
 */
export const runtime = 'nodejs';

type Report = {
  id?: number | string;
  damage_type?: string | null;
  severity?: string | null;
  barangay?: string | null;
  road_name?: string | null;
  address?: string | null;
};

const secretMatches = (header: string | null, secret: string) => {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !publicKey || !privateKey) {
    return NextResponse.json({ error: 'Push is not configured on this server.' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { report?: Report; subscriptions?: PushSubscription[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const report = body.report ?? {};
  const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [];

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:oasysph@gmail.com', publicKey, privateKey);

  const place = report.road_name || report.barangay || report.address || 'an unknown location';
  const severity = report.severity ? `${report.severity} severity` : 'New';
  const payload = JSON.stringify({
    title: 'New road distress report',
    body: `${severity} · ${report.damage_type || 'Road distress'} on ${place}`,
    url: '/admin/reports',
    // One notification per report; a resend replaces rather than stacks.
    tag: `report-${report.id ?? Date.now()}`,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, payload, {
        TTL: 60 * 60 * 24,
        urgency: report.severity === 'High' ? 'high' : 'normal',
      }),
    ),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  // 404/410: the phone unsubscribed or the browser dropped it. Harmless; the
  // row is replaced the next time that admin turns alerts on.
  const gone = results.filter(
    (r) => r.status === 'rejected' && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0),
  ).length;

  return NextResponse.json({ sent, gone, failed: results.length - sent - gone });
}
