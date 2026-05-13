from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


WXPUSHER_SIMPLE_URL = "https://wxpusher.zjiecode.com/api/send/message/simple-push"


@dataclass(frozen=True)
class NotificationResult:
    channel: str
    ok: bool
    detail: str
    response: dict[str, Any] | None = None


def configured_channels() -> list[str]:
    raw = os.getenv("NOTIFY_CHANNELS", "wxpusher")
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def send_wxpusher_message(title: str, content: str, wxpusher_spt: str = "") -> NotificationResult:
    spt = wxpusher_spt.strip()
    if not spt:
        return NotificationResult(
            channel="wxpusher",
            ok=False,
            detail="WXPUSHER_SPT is not configured",
        )

    payload = {
        "spt": spt,
        "summary": title[:100],
        "content": content,
        "contentType": 3,
    }
    req = urllib.request.Request(
        WXPUSHER_SIMPLE_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            body = res.read().decode("utf-8")
    except urllib.error.URLError as exc:
        return NotificationResult(
            channel="wxpusher",
            ok=False,
            detail=str(exc.reason or exc),
        )

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return NotificationResult(
            channel="wxpusher",
            ok=False,
            detail="WxPusher returned non-JSON response",
        )

    success = data.get("success") is True or data.get("code") == 1000
    return NotificationResult(
        channel="wxpusher",
        ok=success,
        detail=str(data.get("msg") or data.get("message") or ("ok" if success else "failed")),
        response=data,
    )


def send_notification(title: str, content: str, wxpusher_spt: str = "") -> list[NotificationResult]:
    results: list[NotificationResult] = []
    channels = configured_channels()
    if "wxpusher" in channels:
        results.append(send_wxpusher_message(title=title, content=content, wxpusher_spt=wxpusher_spt))
    if not results:
        results.append(
            NotificationResult(
                channel="none",
                ok=False,
                detail="No supported notification channel is configured",
            )
        )
    return results
