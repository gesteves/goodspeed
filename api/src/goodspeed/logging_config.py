"""Stdlib logging configured to emit one JSON object per line."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

_STD_ATTRS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "asctime", "message", "taskName",
}


class JsonFormatter(logging.Formatter):
    """Render a ``LogRecord`` as a single JSON object.

    Standard ``LogRecord`` attributes (timestamp, level, logger, message) are
    promoted to top-level keys; anything passed via ``log.info(..., extra={...})``
    is merged in alongside. Non-JSON-serializable extras are stringified rather
    than raising so a bad ``extra=`` payload never silences the log.
    """

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _STD_ATTRS or key.startswith("_"):
                continue
            payload[key] = _safe(value)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def _safe(value: object) -> object:
    """Coerce non-JSON-serializable values to strings (best-effort sanitization)."""
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def configure(level: str = "INFO") -> None:
    """Install :class:`JsonFormatter` on the root logger writing to stdout.

    Idempotent: drops any handlers already on the root logger before adding
    ours, so calling this twice (e.g. from the warm-up thread and the CLI) does
    not double-emit each log line. Quiets ``botocore`` and ``urllib3`` because
    they spam INFO at ``DEBUG``-worthy granularity.
    """
    root = logging.getLogger()
    root.setLevel(level)
    # Drop any pre-existing handlers (e.g. from libraries or repeated imports).
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    # Tame noisy libs.
    logging.getLogger("botocore").setLevel("WARNING")
    logging.getLogger("urllib3").setLevel("WARNING")
    logging.getLogger("apscheduler").setLevel("INFO")
