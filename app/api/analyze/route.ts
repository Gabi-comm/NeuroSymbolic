import { NextResponse } from 'next/server';

// Single server-side entry point to the Python backend.
//
// The browser must never call the FastAPI host directly: a hardcoded
// http://localhost:8000 works only on the developer's machine and breaks the
// moment the app is deployed. Everything goes through this route, which reads
// the backend location from the environment.
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const pythonResponse = await fetch(`${API_BASE_URL}/analyze-road`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!pythonResponse.ok) {
      // Forward the backend's own message rather than a bare status code. A 422
      // is a deliberate, explainable refusal (e.g. no road surface detected) and
      // the user needs to read why, not "the backend returned 422".
      const detail = await pythonResponse.json().catch(() => null);
      if (detail?.message) {
        return NextResponse.json(
          { error: detail.message, reason: detail.error ?? null, detail },
          { status: pythonResponse.status }
        );
      }

      console.error('Python backend error:', await pythonResponse.text());
      return NextResponse.json(
        { error: `Analysis backend returned ${pythonResponse.status}.` },
        { status: pythonResponse.status }
      );
    }

    return NextResponse.json(await pythonResponse.json());
  } catch (error) {
    console.error('Analyze route error:', error);
    return NextResponse.json(
      {
        error:
          'Could not reach the analysis backend. Make sure the Python server is running ' +
          `(uvicorn api:app) and that API_BASE_URL points at it (currently ${API_BASE_URL}).`,
      },
      { status: 502 }
    );
  }
}
