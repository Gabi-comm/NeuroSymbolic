# Analysis backend (FastAPI + YOLOv8 + SAM) as a Vercel container service.
# See vercel.json: the Next.js app reaches it privately through BACKEND_URL;
# it has no public route of its own.
#
# A container rather than the plain Python runtime because torch, ultralytics,
# opencv and the SAM checkpoint together exceed the 500 MB Python bundle limit,
# and PyPI's Linux torch wheel pulls in ~2 GB of CUDA libraries we cannot use.
# Here torch comes from the CPU-only index.

FROM python:3.14-slim

# libGL/glib for opencv-python; curl to fetch weights at build time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Only /tmp is writable at runtime; keep library caches and configs there.
    HOME=/tmp \
    YOLO_CONFIG_DIR=/tmp/Ultralytics \
    YOLO_AUTOINSTALL=false \
    MPLCONFIGDIR=/tmp/matplotlib \
    TORCH_HOME=/tmp/torch

WORKDIR /app

# CPU torch first, so requirements.txt finds torch/torchvision already satisfied.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.13.0 torchvision==0.28.0 \
 && pip install -r requirements.txt

COPY . .

# Weights that are not in git are downloaded here (fetch_weights.sh).
RUN sh fetch_weights.sh

# Vercel sends traffic to $PORT (80 unless set in the project settings).
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-80}"]
