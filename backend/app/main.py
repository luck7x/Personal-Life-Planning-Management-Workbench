from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, Header, HTTPException, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.notifications import NotificationResult, send_notification
from app.reminders import ReminderCandidate, collect_due_reminders


BASE_DIR = Path(__file__).resolve().parents[1]
CONFIGURED_DB_PATH = os.getenv("MINGXIN_DB_PATH", "").strip()
DB_PATH = Path(CONFIGURED_DB_PATH).expanduser() if CONFIGURED_DB_PATH else BASE_DIR / "data" / "mingxintai.sqlite3"
DATA_DIR = DB_PATH.parent


class WorkspaceStateIn(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)
    reason: str = "manual"


class NotificationTestIn(BaseModel):
    title: str = "明心台测试提醒"
    content: str = "这是一条来自明心台后端的测试通知。"


class ReminderScanIn(BaseModel):
    soon_hours: int = Field(default=24, ge=1, le=168)
    dry_run: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def require_api_token(x_mingxin_token: str | None = Header(default=None)) -> None:
    expected = os.getenv("MINGXIN_API_TOKEN", "").strip()
    allow_dev_no_token = os.getenv("MINGXIN_ALLOW_NO_TOKEN", "").strip() == "1"
    if not expected:
        if allow_dev_no_token:
            return
        raise HTTPException(
            status_code=503,
            detail="MINGXIN_API_TOKEN is required for state APIs",
        )
    supplied = (x_mingxin_token or "").strip()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Mingxintai API token")


def init_db() -> None:
    with connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_state (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL,
              reason TEXT NOT NULL DEFAULT 'manual'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS notification_events (
              event_key TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              title TEXT NOT NULL,
              sent_at TEXT NOT NULL,
              channel_results TEXT NOT NULL
            )
            """
        )
        conn.commit()


def read_workspace_state() -> dict[str, Any]:
    with connect_db() as conn:
        row = conn.execute(
            "SELECT payload, updated_at FROM workspace_state WHERE id = 1"
        ).fetchone()
    if not row:
        return {"state": {}, "updated_at": None}
    try:
        state = json.loads(row["payload"])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Stored state is not valid JSON") from exc
    return {"state": state, "updated_at": row["updated_at"]}


def clamp_reason(reason: str | None) -> str:
    clean = (reason or "manual").strip()
    return clean[:80] if clean else "manual"


def prune_old_snapshots(conn: sqlite3.Connection, keep: int = 200) -> None:
    conn.execute(
        """
        DELETE FROM workspace_snapshots
        WHERE id NOT IN (
          SELECT id FROM workspace_snapshots ORDER BY id DESC LIMIT ?
        )
        """,
        (keep,),
    )


def write_workspace_state_with_snapshot(state: dict[str, Any], reason: str = "manual") -> dict[str, Any]:
    updated_at = utc_now()
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    with connect_db() as conn:
        current = conn.execute(
            "SELECT payload FROM workspace_state WHERE id = 1"
        ).fetchone()
        if current and current["payload"] != payload:
            conn.execute(
                """
                INSERT INTO workspace_snapshots (payload, created_at, reason)
                VALUES (?, ?, ?)
                """,
                (current["payload"], updated_at, clamp_reason(reason)),
            )
        conn.execute(
            """
            INSERT INTO workspace_state (id, payload, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              payload = excluded.payload,
              updated_at = excluded.updated_at
            """,
            (payload, updated_at),
        )
        prune_old_snapshots(conn)
        conn.commit()
    return {"state": state, "updated_at": updated_at}


def list_workspace_snapshots(limit: int = 20) -> list[dict[str, Any]]:
    safe_limit = min(max(limit, 1), 100)
    with connect_db() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, reason, length(payload) AS size
            FROM workspace_snapshots
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def read_workspace_snapshot(snapshot_id: int) -> dict[str, Any]:
    with connect_db() as conn:
        row = conn.execute(
            "SELECT id, payload, created_at, reason FROM workspace_snapshots WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    try:
        state = json.loads(row["payload"])
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Stored snapshot is not valid JSON") from exc
    return {
        "id": row["id"],
        "state": state,
        "created_at": row["created_at"],
        "reason": row["reason"],
    }


def restore_workspace_snapshot(snapshot_id: int) -> dict[str, Any]:
    snapshot = read_workspace_snapshot(snapshot_id)
    return write_workspace_state_with_snapshot(
        snapshot["state"], reason=f"restore:{snapshot_id}"
    )


def notification_event_exists(event_key: str) -> bool:
    with connect_db() as conn:
        row = conn.execute(
            "SELECT event_key FROM notification_events WHERE event_key = ?",
            (event_key,),
        ).fetchone()
    return bool(row)


def record_notification_event(candidate: ReminderCandidate, results: list[NotificationResult]) -> None:
    sent_at = utc_now()
    payload = json.dumps(
        [result.__dict__ for result in results],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    with connect_db() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO notification_events
              (event_key, kind, title, sent_at, channel_results)
            VALUES (?, ?, ?, ?, ?)
            """,
            (candidate.event_key, candidate.kind, candidate.title, sent_at, payload),
        )
        conn.commit()


def serialize_notification_result(result: NotificationResult) -> dict[str, Any]:
    return {
        "channel": result.channel,
        "ok": result.ok,
        "detail": result.detail,
        "response": result.response,
    }


def serialize_reminder(candidate: ReminderCandidate) -> dict[str, Any]:
    return {
        "event_key": candidate.event_key,
        "title": candidate.title,
        "body": candidate.body,
        "kind": candidate.kind,
        "due_at": candidate.due_at,
        "task_id": candidate.task_id,
        "subtask_id": candidate.subtask_id,
    }


app = FastAPI(title="Mingxintai Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, Any]:
    init_db()
    return {
        "ok": True,
        "service": "mingxintai-backend",
        "db_path": str(DB_PATH),
        "token_required": bool(os.getenv("MINGXIN_API_TOKEN", "").strip()),
        "dev_no_token": os.getenv("MINGXIN_ALLOW_NO_TOKEN", "").strip() == "1",
        "wxpusher_configured": bool(os.getenv("WXPUSHER_SPT", "").strip()),
    }


@app.get("/api/state")
def get_state(_: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return read_workspace_state()


@app.post("/api/state")
def save_state(payload: WorkspaceStateIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return write_workspace_state_with_snapshot(payload.state, reason=payload.reason)


@app.get("/api/snapshots")
def get_snapshots(_: None = Depends(require_api_token), limit: int = 20) -> dict[str, Any]:
    init_db()
    return {"snapshots": list_workspace_snapshots(limit=limit)}


@app.get("/api/snapshots/{snapshot_id}")
def get_snapshot(snapshot_id: int, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return read_workspace_snapshot(snapshot_id)


@app.post("/api/snapshots/{snapshot_id}/restore")
def restore_snapshot(snapshot_id: int, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return restore_workspace_snapshot(snapshot_id)


@app.post("/api/notifications/test")
def test_notification(payload: NotificationTestIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    results = send_notification(title=payload.title, content=payload.content)
    return {
        "ok": any(result.ok for result in results),
        "results": [serialize_notification_result(result) for result in results],
    }


@app.post("/api/reminders/scan")
def scan_reminders(payload: ReminderScanIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    workspace = read_workspace_state()["state"]
    candidates = collect_due_reminders(workspace, soon_hours=payload.soon_hours)
    unsent = [candidate for candidate in candidates if not notification_event_exists(candidate.event_key)]
    sent: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    if not payload.dry_run:
        for candidate in unsent:
            results = send_notification(title=candidate.title, content=candidate.body)
            item = {
                "reminder": serialize_reminder(candidate),
                "results": [serialize_notification_result(result) for result in results],
            }
            if any(result.ok for result in results):
                record_notification_event(candidate, results)
                sent.append(item)
            else:
                failed.append(item)

    return {
        "ok": not failed,
        "dry_run": payload.dry_run,
        "total_candidates": len(candidates),
        "already_sent": len(candidates) - len(unsent),
        "pending": [serialize_reminder(candidate) for candidate in unsent] if payload.dry_run else [],
        "sent": sent,
        "failed": failed,
    }
