import { NextResponse } from 'next/server';

// Which model writes the maintenance bulletin, for the admin console. Proxies
// GET /llm/status on the Python backend (backend/llm.py). The endpoint URL is
// dropped here so the VPS address never reaches the browser.
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:8000';

export const dynamic = 'force-dynamic';

export interface LlmStatus {
  provider: 'ollama' | 'remote' | 'unknown';
  model: string | null;
  reachable: boolean;
  detail: string | null;
  backend: boolean;
}

export async function GET() {
  try {
    const res = await fetch(`${API_BASE_URL}/llm/status`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const s = await res.json();
    return NextResponse.json<LlmStatus>({
      provider: s.provider === 'remote' ? 'remote' : s.provider === 'ollama' ? 'ollama' : 'unknown',
      model: s.model ?? null,
      reachable: Boolean(s.reachable),
      detail: s.detail ?? null,
      backend: true,
    });
  } catch {
    return NextResponse.json<LlmStatus>({
      provider: 'unknown',
      model: null,
      reachable: false,
      detail: 'Analysis backend is not reachable',
      backend: false,
    });
  }
}
