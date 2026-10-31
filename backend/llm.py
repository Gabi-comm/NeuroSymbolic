"""Text generation for the maintenance bulletin, behind one function.

The bulletin's opening paragraph is the only LLM output in OASYS (see
api.generate_maintenance_bulletin: interventions and priority come from the
fuzzy engine, never from the model). This module decides *which* model writes
that paragraph, so swapping it is an .env change, not a code change.

Providers (LLM_PROVIDER in backend/.env):

  ollama  (default) Local Ollama at OLLAMA_HOST running OLLAMA_MODEL. Nothing
          leaves the machine.

  remote  PLACEHOLDER for the planned VPS + Hugging Face service. Expects the
          contract below at LLM_API_URL; the reference server lives in
          backend/llm_server/. Until that is deployed, leave LLM_PROVIDER=ollama.

Remote contract (keep llm_server/app.py in step with this):

  POST {LLM_API_URL}/generate
    headers: Authorization: Bearer {LLM_API_KEY}   (omitted when no key is set)
    body:    {"prompt": str, "max_new_tokens": int, "temperature": float}
    200:     {"text": str, "model": str}

  GET  {LLM_API_URL}/health
    200:     {"status": "ok", "model": str}

Privacy (paper section 3.5, RA 10173): only the measured-findings text below is
sent -- crack density, distress names, counts and severities. No image, no
location, no user data. Switching to `remote` still moves processing off the
machine, so the thesis wording should be updated when it goes live.
"""

from __future__ import annotations

import os

import requests

PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
OLLAMA_NUM_PREDICT = int(os.environ.get("OLLAMA_NUM_PREDICT", "80"))
OLLAMA_NUM_THREAD = int(os.environ.get("OLLAMA_NUM_THREAD", "0"))

LLM_API_URL = os.environ.get("LLM_API_URL", "").rstrip("/")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL_LABEL = os.environ.get("LLM_MODEL_LABEL", "Hugging Face model")
LLM_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "120"))

MAX_NEW_TOKENS = 220
TEMPERATURE = 0.2


def describe() -> str:
    """One line for the startup log."""
    if PROVIDER == "remote":
        return f"remote API at {LLM_API_URL or '(LLM_API_URL not set)'}"
    return f"{OLLAMA_MODEL} via Ollama at {OLLAMA_HOST}"


def _headers() -> dict:
    return {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}

def _ollama_options() -> dict:
    options = {"num_predict": OLLAMA_NUM_PREDICT, "temperature": TEMPERATURE}
    if OLLAMA_NUM_THREAD > 0:
        options["num_thread"] = OLLAMA_NUM_THREAD
    return options

def _generate_ollama(prompt: str) -> str:
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": -1,
                "options": _ollama_options(),
            },
            timeout=180,
        )
        response.raise_for_status()
        return response.json().get("response", "").strip()
    except requests.exceptions.ConnectionError:
        return (
            f"[Local LLM unavailable: could not reach Ollama at {OLLAMA_HOST}. "
            f"Start it with 'ollama serve' and ensure '{OLLAMA_MODEL}' is pulled.]"
        )
    except Exception as e:
        return f"[Error generating summary with local model: {e}]"


def _generate_remote(prompt: str) -> str:
    if not LLM_API_URL:
        return "[Remote LLM not configured: set LLM_API_URL in backend/.env, or LLM_PROVIDER=ollama.]"
    try:
        response = requests.post(
            f"{LLM_API_URL}/generate",
            json={"prompt": prompt, "max_new_tokens": MAX_NEW_TOKENS, "temperature": TEMPERATURE},
            headers=_headers(),
            timeout=LLM_TIMEOUT_S,
        )
        response.raise_for_status()
        return str(response.json().get("text", "")).strip()
    except requests.exceptions.ConnectionError:
        return f"[Remote LLM unavailable: could not reach {LLM_API_URL}.]"
    except Exception as e:
        return f"[Error generating summary with remote model: {e}]"


def generate(prompt: str) -> str:
    """The model's reply to `prompt`, or a bracketed note explaining why there is none.

    Never raises: a missing paragraph must not fail the whole analysis.
    """
    if PROVIDER == "remote":
        return _generate_remote(prompt)
    return _generate_ollama(prompt)


def status() -> dict:
    """What the admin console shows under "Bulletin model". Cheap: one short request."""
    if PROVIDER == "remote":
        info = {"provider": "remote", "model": LLM_MODEL_LABEL, "endpoint": LLM_API_URL or None}
        if not LLM_API_URL:
            return {**info, "reachable": False, "detail": "LLM_API_URL is not set"}
        try:
            r = requests.get(f"{LLM_API_URL}/health", headers=_headers(), timeout=5)
            r.raise_for_status()
            return {**info, "model": r.json().get("model", LLM_MODEL_LABEL), "reachable": True}
        except Exception as e:
            return {**info, "reachable": False, "detail": str(e)[:160]}

    info = {"provider": "ollama", "model": OLLAMA_MODEL, "endpoint": OLLAMA_HOST}
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        r.raise_for_status()
        names = [m.get("name", "") for m in r.json().get("models", [])]
        pulled = any(n == OLLAMA_MODEL or n.startswith(f"{OLLAMA_MODEL}:") for n in names)
        return {**info, "reachable": True, "detail": None if pulled else f"'{OLLAMA_MODEL}' is not pulled"}
    except Exception:
        return {**info, "reachable": False, "detail": "Ollama is not running"}
