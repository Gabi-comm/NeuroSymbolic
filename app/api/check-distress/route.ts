import { NextResponse } from 'next/server';

// "Is this photo road distress?" for Captured Distress, answered by the Python
// backend's /check-distress (road gate + at least one detected defect). Same
// backend location and key as /api/analyze.
const API_BASE_URL = (process.env.BACKEND_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE_URL}/check-distress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BACKEND_API_KEY ?? '',
      },
      body: JSON.stringify({ image_base64: body.image_base64 }),
    });

    const detail = await res.json().catch(() => null);

    if (res.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          error: 'check_unavailable',
          message: 'The photo check is not running. Restart the Python backend so it picks up /check-distress.',
        },
        { status: 503 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: detail?.error ?? 'check_failed',
          message: detail?.message ?? `The photo check returned ${res.status}.`,
          detail,
        },
        { status: res.status }
      );
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error('check-distress route error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'backend_unreachable',
        message: `Could not reach the analysis backend to check the photo (${API_BASE_URL}). Make sure the Python server is running.`,
      },
      { status: 502 }
    );
  }
}
