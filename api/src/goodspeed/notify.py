"""Post failure alerts to a Slack incoming webhook (best-effort)."""

from __future__ import annotations

import logging
import os

import requests

log = logging.getLogger(__name__)

WEBHOOK_ENV = "SLACK_WEBHOOK_URL"
POST_TIMEOUT_S = 10


def slack_failure(event: str, detail: dict[str, object]) -> None:
    """Post a failure notification to Slack, if ``SLACK_WEBHOOK_URL`` is set.

    Best-effort by design:
      * a missing webhook (local runs, tests) is a silent no-op;
      * any error posting is logged and swallowed.

    Alerting must never turn a recoverable run failure into a crash, so this
    function never raises.
    """
    webhook = os.environ.get(WEBHOOK_ENV)
    if not webhook:
        return

    detail_text = "\n".join(f"• {k}: {v}" for k, v in detail.items()) or "(no detail)"
    payload = {
        "text": f":warning: Goodspeed scheduled run failed (`{event}`)",
        "attachments": [
            {
                "color": "danger",
                "fallback": f"Goodspeed scheduled run failed: {event}",
                "text": detail_text,
            }
        ],
    }
    try:
        resp = requests.post(webhook, json=payload, timeout=POST_TIMEOUT_S)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001 - alerting must never break the run
        log.warning(
            "notify.slack_failed",
            extra={"event": event, "error": f"{type(exc).__name__}: {exc}"},
        )
