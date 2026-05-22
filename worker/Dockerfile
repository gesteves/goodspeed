# Build context is the REPO ROOT (so we can COPY both worker/ and schema/).
# Build: docker build -t gdspd-worker -f worker/Dockerfile .
# Fly:   fly deploy --config worker/fly.toml --dockerfile worker/Dockerfile
#        (run from the repo root)
FROM python:3.12-slim

RUN pip install --no-cache-dir uv==0.4.27

WORKDIR /app

# Install only the dependencies — the project itself runs from /app/src via
# PYTHONPATH (see below), so there's no wheel to build. Installing from
# pyproject.toml avoids needing README.md / src present for a hatchling build,
# and keeps this layer cached until the dependency list changes.
COPY worker/pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

COPY worker/src /app/src
COPY schema /app/schema

ENV PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    TZ=UTC \
    GOODSPEED_SCHEMA_PATH=/app/schema/sfbofs-sfb1204.schema.json

ENTRYPOINT ["python", "-m", "goodspeed.main"]
CMD ["serve"]
