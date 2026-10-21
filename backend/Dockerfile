# Build from the repo root (render.yaml sets dockerContext: .) so content/ is included.
FROM python:3.12-slim

# ffmpeg: loudnorm + opus encoding for packs (app/voice).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# Lessons, district profiles and consented voice clips; settings.content_dir resolves to /srv/content.
COPY content/ /srv/content/

RUN useradd --create-home app
USER app
EXPOSE 8000
# && throughout: a failed migration must stop the deploy, not start the server on the old schema.
CMD ["sh", "-c", "alembic upgrade head && python -m app.seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
