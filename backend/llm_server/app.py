"""OASYS bulletin model server -- runs on the VPS, serves a Hugging Face model.

PLACEHOLDER: the shape is final (it is the contract backend/llm.py calls), the
model code is a starting point to replace with your own.

    pip install -r requirements.txt
    LLM_API_KEY=<long random string> HF_MODEL_ID=<repo/model> \
        uvicorn app:app --host 0.0.0.0 --port 8080

Then on the machine running backend/api.py, in backend/.env:

    LLM_PROVIDER=remote
    LLM_API_URL=https://<your-vps-domain>      # put it behind HTTPS (Caddy/nginx)
    LLM_API_KEY=<the same string>

Contract (keep in step with backend/llm.py):
    POST /generate  {"prompt", "max_new_tokens", "temperature"} -> {"text", "model"}
    GET  /health    -> {"status": "ok", "model"}
"""

from __future__ import annotations

import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")

app = FastAPI(title="OASYS bulletin model")


# --- Model -------------------------------------------------------------------
# TODO(Gab): replace with your own loading / inference code. Anything works as
# long as generate_text(prompt, max_new_tokens, temperature) returns a string.
_pipeline = None


def _load():
    global _pipeline
    if _pipeline is None:
        from transformers import pipeline  # imported lazily so /health starts fast

        _pipeline = pipeline("text-generation", model=HF_MODEL_ID, device_map="auto")
    return _pipeline


def generate_text(prompt: str, max_new_tokens: int, temperature: float) -> str:
    pipe = _load()
    messages = [{"role": "user", "content": prompt}]
    out = pipe(
        messages,
        max_new_tokens=max_new_tokens,
        do_sample=temperature > 0,
        temperature=max(temperature, 1e-5),
        return_full_text=False,
    )
    return str(out[0]["generated_text"]).strip()


# --- API -----------------------------------------------------------------------
def require_key(authorization: str | None = Header(default=None)) -> None:
    """Bearer-token check. With no LLM_API_KEY set the server is open: dev only."""
    if not LLM_API_KEY:
        return
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(supplied, LLM_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    max_new_tokens: int = Field(default=220, ge=1, le=1024)
    temperature: float = Field(default=0.3, ge=0, le=2)


@app.get("/health", dependencies=[Depends(require_key)])
def health():
    return {"status": "ok", "model": HF_MODEL_ID}


@app.post("/generate", dependencies=[Depends(require_key)])
def generate(req: GenerateRequest):
    try:
        text = generate_text(req.prompt, req.max_new_tokens, req.temperature)
    except Exception as e:  # surface the reason; backend/llm.py turns it into a note
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}") from e
    return {"text": text, "model": HF_MODEL_ID}
