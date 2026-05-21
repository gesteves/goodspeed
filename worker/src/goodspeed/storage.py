"""Publish the JSON feed: S3 by default, local files when no bucket is configured."""

from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)

CONTENT_TYPE = "application/json"
LATEST_CACHE = "public, max-age=300"
RUNS_CACHE = "public, max-age=31536000, immutable"


def run_key(cycle_iso: str) -> str:
    return f"runs/sfbofs-sfb1204-{cycle_iso}.json"


LATEST_KEY = "latest.json"


def push_feed(body: bytes, cycle_iso: str, out_dir: Path | None = None) -> dict[str, str]:
    """Publish ``body`` to S3 or to a local directory.

    Rules:
      * If ``out_dir`` is given, write to that directory and skip S3.
      * Else if ``S3_BUCKET`` is set in the env, push to S3.
      * Else write to ``./output/`` and warn.

    Returns a dict ``{"latest": <location>, "run": <location>}`` for logging.
    """
    run_path = run_key(cycle_iso)

    if out_dir is not None:
        return _write_local(body, out_dir, run_path)

    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        fallback = Path("output")
        log.warning(
            "storage.local_fallback",
            extra={"reason": "S3_BUCKET unset and --out-dir not given", "path": str(fallback)},
        )
        return _write_local(body, fallback, run_path)

    return _push_s3(body, bucket, run_path)


def _write_local(body: bytes, out_dir: Path, run_path: str) -> dict[str, str]:
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    run_file = out_dir / run_path
    run_file.parent.mkdir(parents=True, exist_ok=True)
    run_file.write_bytes(body)

    latest_file = out_dir / LATEST_KEY
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


def _push_s3(body: bytes, bucket: str, run_path: str) -> dict[str, str]:
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
        Key=LATEST_KEY,
        Body=body,
        ContentType=CONTENT_TYPE,
        CacheControl=LATEST_CACHE,
    )
    log.info(
        "storage.s3_pushed",
        extra={
            "bucket": bucket,
            "latest": f"s3://{bucket}/{LATEST_KEY}",
            "run": f"s3://{bucket}/{run_path}",
            "bytes": len(body),
        },
    )
    return {
        "latest": f"s3://{bucket}/{LATEST_KEY}",
        "run": f"s3://{bucket}/{run_path}",
    }
