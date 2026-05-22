from __future__ import annotations

import pytest

from goodspeed import notify


def test_slack_failure_noop_without_webhook(monkeypatch):
    """No SLACK_WEBHOOK_URL → silent no-op, no HTTP call."""
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)

    def _no_post(*a, **k):
        raise AssertionError("must not POST when the webhook is unset")

    monkeypatch.setattr(notify.requests, "post", _no_post)
    notify.slack_failure("scheduled_run.failed", {"rc": 2})


def test_slack_failure_posts_when_webhook_set(monkeypatch):
    """With the webhook set, a danger-coloured payload is POSTed to it."""
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/abc")
    calls: list[dict] = []

    class _Resp:
        def raise_for_status(self):
            pass

    def _post(url, json, timeout):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return _Resp()

    monkeypatch.setattr(notify.requests, "post", _post)
    notify.slack_failure("scheduled_run.exception", {"error": "RuntimeError: boom"})

    assert len(calls) == 1
    assert calls[0]["url"] == "https://hooks.slack.test/abc"
    payload = calls[0]["json"]
    assert "scheduled_run.exception" in payload["text"]
    assert payload["attachments"][0]["color"] == "danger"
    assert "RuntimeError: boom" in payload["attachments"][0]["text"]


def test_slack_failure_swallows_post_errors(monkeypatch):
    """A failing POST is logged, never raised — alerting can't break the worker."""
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/abc")

    def _post(*a, **k):
        raise ConnectionError("network down")

    monkeypatch.setattr(notify.requests, "post", _post)
    notify.slack_failure("scheduled_run.failed", {"rc": 2})  # must not raise


@pytest.mark.parametrize(
    "rc, raises, expected_event",
    [(2, None, "scheduled_run.failed"), (0, RuntimeError("boom"), "scheduled_run.exception")],
)
def test_safe_run_alerts_on_failure(monkeypatch, rc, raises, expected_event):
    """_safe_run notifies Slack on both a non-zero rc and an exception."""
    from goodspeed import main

    def _run_once(*a, **k):
        if raises is not None:
            raise raises
        return rc

    sent: list[str] = []
    monkeypatch.setattr(main, "run_once", _run_once)
    monkeypatch.setattr(main.notify, "slack_failure", lambda event, detail: sent.append(event))

    main._safe_run(None)
    assert sent == [expected_event]


def test_safe_run_silent_on_success(monkeypatch):
    """A clean run (rc 0) sends nothing."""
    from goodspeed import main

    sent: list[str] = []
    monkeypatch.setattr(main, "run_once", lambda *a, **k: 0)
    monkeypatch.setattr(main.notify, "slack_failure", lambda event, detail: sent.append(event))

    main._safe_run(None)
    assert sent == []
