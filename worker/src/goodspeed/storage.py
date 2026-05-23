"""Publish JSON feeds: S3 by default, local files when no bucket is configured.

Both the per-station point feed (``latest.json`` + ``runs/sfbofs-sfb1204-*.json``)
and the gridded field feed for the map (``field-latest.json`` +
``runs/sfbofs-field-*.json``) share the same routing and cache headers; the
:func:`_push_keyed` helper does the heavy lifting and the public ``push_feed``
/ ``push_field_feed`` wrappers just plug in the right key names.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

CONTENT_TYPE = "application/json"
LATEST_CACHE = "public, max-age=300"
RUNS_CACHE = "public, max-age=31536000, immutable"

LATEST_KEY = "latest.json"
FIELD_LATEST_KEY = "field-latest.json"


def run_key(cycle_iso: str) -> str:
    return f"runs/sfbofs-sfb1204-{cycle_iso}.json"


def field_run_key(cycle_iso: str) -> str:
    return f"runs/sfbofs-field-{cycle_iso}.json"


# ---- public API -------------------------------------------------------------


def push_feed(body: bytes, cycle_iso: str, out_dir: Path | None = None) -> dict[str, str]:
    """Publish the per-station point feed."""
    return _push_keyed(body, LATEST_KEY, run_key(cycle_iso), out_dir)


def push_field_feed(
    body: bytes, cycle_iso: str, out_dir: Path | None = None
) -> dict[str, str]:
    """Publish the gridded field (map) feed."""
    return _push_keyed(body, FIELD_LATEST_KEY, field_run_key(cycle_iso), out_dir)


# ---- internals --------------------------------------------------------------


def _push_keyed(
    body: bytes,
    latest_key: str,
    run_path: str,
    out_dir: Path | None = None,
) -> dict[str, str]:
    """Publish ``body`` under the given keys to S3 or to a local directory.

    Rules:
      * If ``out_dir`` is given, write to that directory and skip S3.
      * Else if ``S3_BUCKET`` is set in the env, push to S3.
      * Else write to ``./output/`` and warn.
    """
    if out_dir is not None:
        return _write_local(body, out_dir, latest_key, run_path)

    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        fallback = Path("output")
        log.warning(
            "storage.local_fallback",
            extra={
                "reason": "S3_BUCKET unset and --out-dir not given",
                "path": str(fallback),
                "latest_key": latest_key,
            },
        )
        return _write_local(body, fallback, latest_key, run_path)

    return _push_s3(body, bucket, latest_key, run_path)


def _write_local(
    body: bytes, out_dir: Path, latest_key: str, run_path: str
) -> dict[str, str]:
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    run_file = out_dir / run_path
    run_file.parent.mkdir(parents=True, exist_ok=True)
    run_file.write_bytes(body)

    latest_file = out_dir / latest_key
    latest_file.parent.mkdir(parents=True, exist_ok=True)
    latest_file.write_bytes(body)

    log.info(
        "storage.local_written",
        extra={
            "latest": str(latest_file),
            "run": str(run_file),
            "bytes": len(body),
        },
    )
    return {"latest": str(latest_file), "run": str(run_file)}


def _push_s3(
    body: bytes, bucket: str, latest_key: str, run_path: str
) -> dict[str, str]:
    # boto3 is only imported when actually needed so the local-file path doesn't
    # require AWS deps to be importable.
    import boto3

    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key=run_path,
        Body=body,
        ContentType=CONTENT_TYPE,
        CacheControl=RUNS_CACHE,
    )
    s3.put_object(
        Bucket=bucket,
        Key=latest_key,
        Body=body,
        ContentType=CONTENT_TYPE,
        CacheControl=LATEST_CACHE,
    )
    log.info(
        "storage.s3_pushed",
        extra={
            "bucket": bucket,
            "latest": f"s3://{bucket}/{latest_key}",
            "run": f"s3://{bucket}/{run_path}",
            "bytes": len(body),
        },
    )
    return {
        "latest": f"s3://{bucket}/{latest_key}",
        "run": f"s3://{bucket}/{run_path}",
    }


# ---- skip-check (point feed only) -------------------------------------------


def read_published_cycle(out_dir: Path | None = None) -> str | None:
    """Return the ``model.cycle`` of the currently published ``latest.json``.

    Mirrors the location logic of :func:`push_feed`. Used to skip the heavy
    NetCDF fetch when the latest cycle has already been published.

    Returns ``None`` when nothing is published yet or the feed can't be
    read/parsed — callers treat ``None`` as "go fetch". This must never raise:
    a failure here should only ever cost an unnecessary fetch, never a run.
    """
    try:
        if out_dir is not None:
            return _read_local_cycle(out_dir.expanduser().resolve() / LATEST_KEY)
        bucket = os.environ.get("S3_BUCKET")
        if not bucket:
            return _read_local_cycle(Path("output").resolve() / LATEST_KEY)
        return _read_s3_cycle(bucket)
    except Exception as exc:  # noqa: BLE001 - this optimization must never break a run
        log.warning(
            "storage.cycle_probe_failed",
            extra={"error": f"{type(exc).__name__}: {exc}"},
        )
        return None


def _cycle_from_body(body: bytes) -> str | None:
    cycle = json.loads(body).get("model", {}).get("cycle")
    return cycle if isinstance(cycle, str) else None


def _read_local_cycle(path: Path) -> str | None:
    if not path.is_file():
        return None
    return _cycle_from_body(path.read_bytes())


def _read_s3_cycle(bucket: str) -> str | None:
    import boto3
    from botocore.exceptions import ClientError

    s3 = boto3.client("s3")
    try:
        obj = s3.get_object(Bucket=bucket, Key=LATEST_KEY)
    except ClientError as exc:
        # No feed published yet is the expected first-run state, not an error.
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return None
        raise
    return _cycle_from_body(obj["Body"].read())
