from __future__ import annotations

import asyncio
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, Header, HTTPException, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.notifications import NotificationResult, send_notification
from app.reminders import ReminderCandidate, collect_due_reminders


BASE_DIR = Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(BASE_DIR / ".env")

CONFIGURED_DB_PATH = os.getenv("MINGXIN_DB_PATH", "").strip()
DB_PATH = Path(CONFIGURED_DB_PATH).expanduser() if CONFIGURED_DB_PATH else BASE_DIR / "data" / "mingxintai.sqlite3"
DATA_DIR = DB_PATH.parent
STATE_EVENT_CONDITION = threading.Condition()
WORKSPACE_MUTATION_LOCK = threading.Lock()
STATE_EVENT_ID = 0
STATE_EVENT_UPDATED_AT: str | None = None


class WorkspaceStateIn(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)
    reason: str = "manual"
    base_updated_at: str | None = None
    force: bool = False


class NotificationTestIn(BaseModel):
    title: str = "明心台测试提醒"
    content: str = "这是一条来自明心台后端的测试通知。"
    wxpusher_spt: str = ""


class ReminderScanIn(BaseModel):
    soon_hours: int = Field(default=24, ge=1, le=168)
    dry_run: bool = False
    wxpusher_spt: str = ""


class EntityUpsertIn(BaseModel):
    item: dict[str, Any] = Field(default_factory=dict)
    base_updated_at: str | None = None
    force: bool = False


class SubtaskUpsertIn(BaseModel):
    item: dict[str, Any] = Field(default_factory=dict)
    base_updated_at: str | None = None
    force: bool = False


class ScheduleBlockUpsertIn(BaseModel):
    date: str = ""
    item: dict[str, Any] = Field(default_factory=dict)
    base_updated_at: str | None = None
    force: bool = False


class FocusStartIn(BaseModel):
    task_id: str = ""
    subtask_id: str = ""
    title: str = ""
    category: str = "research"
    note: str = ""
    expected_minutes: int = Field(default=0, ge=0, le=1440)


class FocusStopIn(BaseModel):
    focus_id: str = ""
    end_at: str = ""


class OperationIn(BaseModel):
    id: str = ""
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class OperationBatchIn(BaseModel):
    operations: list[OperationIn] = Field(default_factory=list)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def local_now() -> datetime:
    from app.reminders import LOCAL_TZ

    return datetime.now(LOCAL_TZ)


def local_date_time(now: datetime | None = None) -> tuple[str, str, str]:
    current = now or local_now()
    return current.date().isoformat(), current.strftime("%H:%M"), current.isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_projects (
              id TEXT PRIMARY KEY,
              status TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_tasks (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT '',
              lane TEXT NOT NULL DEFAULT '',
              due_at TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_subtasks (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL,
              done INTEGER NOT NULL DEFAULT 0,
              due_at TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_focus_sessions (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL DEFAULT '',
              subtask_id TEXT NOT NULL DEFAULT '',
              date TEXT NOT NULL DEFAULT '',
              start_time TEXT NOT NULL DEFAULT '',
              end_time TEXT NOT NULL DEFAULT '',
              minutes INTEGER NOT NULL DEFAULT 0,
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_time_blocks (
              id TEXT PRIMARY KEY,
              date TEXT NOT NULL,
              task_id TEXT NOT NULL DEFAULT '',
              subtask_id TEXT NOT NULL DEFAULT '',
              start_time TEXT NOT NULL DEFAULT '',
              end_time TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_settings (
              key TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_health_records (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              date TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_daily_reviews (
              date TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_care_entries (
              date TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS entity_submissions (
              id TEXT PRIMARY KEY,
              stage TEXT NOT NULL DEFAULT '',
              deadline TEXT NOT NULL DEFAULT '',
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS operation_log (
              id TEXT PRIMARY KEY,
              operation_type TEXT NOT NULL,
              result TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        row = conn.execute("SELECT payload, updated_at FROM workspace_state WHERE id = 1").fetchone()
        if row:
            try:
                state = json.loads(row["payload"])
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=500, detail="Stored state is not valid JSON") from exc
            if isinstance(state, dict):
                sync_workspace_entities(conn, state, row["updated_at"])
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


def json_compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def as_dict_list(value: Any) -> list[dict[str, Any]]:
    return [item for item in (value or []) if isinstance(item, dict)]


def sync_workspace_entities(conn: sqlite3.Connection, state: dict[str, Any], updated_at: str) -> None:
    for table in (
        "entity_projects",
        "entity_tasks",
        "entity_subtasks",
        "entity_focus_sessions",
        "entity_time_blocks",
        "entity_settings",
        "entity_health_records",
        "entity_daily_reviews",
        "entity_care_entries",
        "entity_submissions",
    ):
        conn.execute(f"DELETE FROM {table}")

    for project in as_dict_list(state.get("projects")):
        project_id = str(project.get("id") or "").strip()
        if not project_id:
            continue
        conn.execute(
            """
            INSERT INTO entity_projects (id, status, payload, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (project_id, str(project.get("status") or ""), json_compact(project), updated_at),
        )

    for task in as_dict_list(state.get("tasks")):
        task_id = str(task.get("id") or "").strip()
        if not task_id:
            continue
        conn.execute(
            """
            INSERT INTO entity_tasks (id, project_id, status, lane, due_at, payload, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                str(task.get("projectId") or ""),
                str(task.get("status") or ""),
                str(task.get("lane") or ""),
                str(task.get("dueDate") or task.get("deadline") or ""),
                json_compact(task),
                updated_at,
            ),
        )
        for subtask in as_dict_list(task.get("subtasks")):
            subtask_id = str(subtask.get("id") or "").strip()
            if not subtask_id:
                continue
            conn.execute(
                """
                INSERT INTO entity_subtasks (id, task_id, done, due_at, payload, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    subtask_id,
                    task_id,
                    1 if subtask.get("done") or subtask.get("doneAt") else 0,
                    str(subtask.get("dueDate") or subtask.get("deadline") or ""),
                    json_compact(subtask),
                    updated_at,
                ),
            )

    focus = state.get("focus") if isinstance(state.get("focus"), dict) else {}
    for session in as_dict_list(focus.get("sessions")):
        session_id = str(session.get("id") or "").strip()
        if not session_id:
            continue
        conn.execute(
            """
            INSERT INTO entity_focus_sessions
              (id, task_id, subtask_id, date, start_time, end_time, minutes, payload, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                str(session.get("taskId") or ""),
                str(session.get("subtaskId") or ""),
                str(session.get("date") or ""),
                str(session.get("start") or ""),
                str(session.get("end") or ""),
                int(float(session.get("minutes") or 0)),
                json_compact(session),
                updated_at,
            ),
        )

    time_blocks = state.get("timeBlocks") if isinstance(state.get("timeBlocks"), dict) else {}
    for date_key, blocks in time_blocks.items():
        for block in as_dict_list(blocks):
            block_id = str(block.get("id") or "").strip()
            if not block_id:
                continue
            conn.execute(
                """
                INSERT INTO entity_time_blocks
                  (id, date, task_id, subtask_id, start_time, end_time, payload, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    block_id,
                    str(block.get("date") or date_key),
                    str(block.get("taskId") or ""),
                    str(block.get("subtaskId") or ""),
                    str(block.get("start") or ""),
                    str(block.get("end") or ""),
                    json_compact(block),
                    updated_at,
                ),
            )

    for key in ("notificationSettings",):
        value = state.get(key)
        if isinstance(value, dict):
            conn.execute(
                """
                INSERT INTO entity_settings (key, payload, updated_at)
                VALUES (?, ?, ?)
                """,
                (key, json_compact(value), updated_at),
            )

    for kind, collection_name in (
        ("food", "foods"),
        ("water", "waters"),
        ("weight", "weights"),
        ("height", "heights"),
        ("habit", "habitRecords"),
    ):
        for index, record in enumerate(as_dict_list(state.get(collection_name))):
            record_id = str(record.get("id") or f"{kind}_{index}")
            conn.execute(
                """
                INSERT INTO entity_health_records (id, kind, date, payload, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    kind,
                    str(record.get("date") or ""),
                    json_compact(record),
                    updated_at,
                ),
            )

    habits = state.get("habits") if isinstance(state.get("habits"), dict) else {}
    for date_key, entry in (habits.get("entries") if isinstance(habits.get("entries"), dict) else {}).items():
        conn.execute(
            """
            INSERT OR REPLACE INTO entity_health_records (id, kind, date, payload, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                f"habit_entry_{date_key}",
                "habit_entry",
                str(date_key),
                json_compact(entry),
                updated_at,
            ),
        )

    for habit in as_dict_list(state.get("healthHabits")):
        habit_id = str(habit.get("id") or "habit")
        for index, record in enumerate(as_dict_list(habit.get("records"))):
            record_id = str(record.get("id") or f"{habit_id}_{index}")
            conn.execute(
                """
                INSERT OR REPLACE INTO entity_health_records (id, kind, date, payload, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    f"habit:{habit_id}",
                    str(record.get("date") or ""),
                    json_compact({"habit": habit, "record": record}),
                    updated_at,
                ),
            )

    review_daily = state.get("reviewDaily") if isinstance(state.get("reviewDaily"), dict) else {}
    for date_key, entry in (review_daily.get("entries") if isinstance(review_daily.get("entries"), dict) else {}).items():
        conn.execute(
            """
            INSERT INTO entity_daily_reviews (date, payload, updated_at)
            VALUES (?, ?, ?)
            """,
            (str(date_key), json_compact(entry), updated_at),
        )

    care = state.get("care") if isinstance(state.get("care"), dict) else {}
    for date_key, entry in (care.get("entries") if isinstance(care.get("entries"), dict) else {}).items():
        conn.execute(
            """
            INSERT INTO entity_care_entries (date, payload, updated_at)
            VALUES (?, ?, ?)
            """,
            (str(date_key), json_compact(entry), updated_at),
        )

    for submission in as_dict_list(state.get("submissions")):
        submission_id = str(submission.get("id") or "").strip()
        if not submission_id:
            continue
        conn.execute(
            """
            INSERT INTO entity_submissions (id, stage, deadline, payload, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                submission_id,
                str(submission.get("stage") or ""),
                str(submission.get("deadline") or ""),
                json_compact(submission),
                updated_at,
            ),
        )


def list_entity_payloads(table: str, order_by: str = "id") -> list[dict[str, Any]]:
    with connect_db() as conn:
        rows = conn.execute(f"SELECT payload FROM {table} ORDER BY {order_by}").fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        try:
            parsed = json.loads(row["payload"])
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            items.append(parsed)
    return items


def read_entities() -> dict[str, Any]:
    with connect_db() as conn:
        counts = {
            "projects": conn.execute("SELECT count(*) FROM entity_projects").fetchone()[0],
            "tasks": conn.execute("SELECT count(*) FROM entity_tasks").fetchone()[0],
            "subtasks": conn.execute("SELECT count(*) FROM entity_subtasks").fetchone()[0],
            "focus_sessions": conn.execute("SELECT count(*) FROM entity_focus_sessions").fetchone()[0],
            "time_blocks": conn.execute("SELECT count(*) FROM entity_time_blocks").fetchone()[0],
            "health_records": conn.execute("SELECT count(*) FROM entity_health_records").fetchone()[0],
            "daily_reviews": conn.execute("SELECT count(*) FROM entity_daily_reviews").fetchone()[0],
            "care_entries": conn.execute("SELECT count(*) FROM entity_care_entries").fetchone()[0],
            "submissions": conn.execute("SELECT count(*) FROM entity_submissions").fetchone()[0],
        }
    return {
        "counts": counts,
        "projects": list_entity_payloads("entity_projects"),
        "tasks": list_entity_payloads("entity_tasks"),
        "subtasks": list_entity_payloads("entity_subtasks"),
        "focus_sessions": list_entity_payloads("entity_focus_sessions"),
        "time_blocks": list_entity_payloads("entity_time_blocks"),
        "health_records": list_entity_payloads("entity_health_records"),
        "daily_reviews": list_entity_payloads("entity_daily_reviews", "date"),
        "care_entries": list_entity_payloads("entity_care_entries", "date"),
        "submissions": list_entity_payloads("entity_submissions"),
    }


def publish_workspace_state_update(updated_at: str) -> int:
    global STATE_EVENT_ID, STATE_EVENT_UPDATED_AT
    with STATE_EVENT_CONDITION:
        STATE_EVENT_ID += 1
        STATE_EVENT_UPDATED_AT = updated_at
        STATE_EVENT_CONDITION.notify_all()
        return STATE_EVENT_ID


def wait_for_workspace_state_update(last_event_id: int, timeout: float = 25.0) -> tuple[int, str | None]:
    with STATE_EVENT_CONDITION:
        if STATE_EVENT_ID <= last_event_id:
            STATE_EVENT_CONDITION.wait(timeout=timeout)
        return STATE_EVENT_ID, STATE_EVENT_UPDATED_AT


def parse_event_id(raw: str | None) -> int:
    try:
        return max(0, int(str(raw or "").strip()))
    except ValueError:
        return 0


def normalize_event_cursor(requested_event_id: int) -> int:
    if requested_event_id > STATE_EVENT_ID:
        return STATE_EVENT_ID
    return requested_event_id


def write_workspace_state_with_snapshot(
    state: dict[str, Any],
    reason: str = "manual",
    base_updated_at: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    updated_at = utc_now()
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    with connect_db() as conn:
        current = conn.execute(
            "SELECT payload, updated_at FROM workspace_state WHERE id = 1"
        ).fetchone()
        current_updated_at = current["updated_at"] if current else None
        clean_base = (base_updated_at or "").strip()
        if current and clean_base and clean_base != current_updated_at and not force:
            try:
                current_state = json.loads(current["payload"])
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=500, detail="Stored state is not valid JSON") from exc
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Workspace state has changed on another device",
                    "updated_at": current_updated_at,
                    "state": current_state,
                },
            )
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
        sync_workspace_entities(conn, state, updated_at)
        prune_old_snapshots(conn)
        conn.commit()
    publish_workspace_state_update(updated_at)
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


def current_workspace_state() -> dict[str, Any]:
    state = read_workspace_state()["state"]
    return state if isinstance(state, dict) else {}


def ensure_workspace_collections(state: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(state.get("projects"), list):
        state["projects"] = []
    if not isinstance(state.get("tasks"), list):
        state["tasks"] = []
    if not isinstance(state.get("timeBlocks"), dict):
        state["timeBlocks"] = {}
    if not isinstance(state.get("focus"), dict):
        state["focus"] = {}
    focus = state["focus"]
    if not isinstance(focus.get("sessions"), list):
        focus["sessions"] = []
    if not isinstance(focus.get("activeItems"), list):
        focus["activeItems"] = []
    if "active" not in focus:
        focus["active"] = None
    return state


def merge_item(existing: dict[str, Any] | None, incoming: dict[str, Any], prefix: str) -> dict[str, Any]:
    now_date, now_time, now_iso = local_date_time()
    base = dict(existing or {})
    base.update(incoming)
    base["id"] = str(base.get("id") or new_id(prefix))
    base["createdAt"] = str(base.get("createdAt") or now_iso)
    base["updatedAt"] = utc_now()
    return base


def assert_record_not_conflicted(
    existing: dict[str, Any] | None,
    base_updated_at: str | None = None,
    force: bool = False,
) -> None:
    clean_base = str(base_updated_at or "").strip()
    current_updated_at = str((existing or {}).get("updatedAt") or "").strip()
    if existing and clean_base and current_updated_at and clean_base != current_updated_at and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Record has changed on another device",
                "updated_at": current_updated_at,
                "record": existing,
            },
        )


def find_by_id(items: list[Any], item_id: str) -> tuple[int, dict[str, Any] | None]:
    for index, item in enumerate(items):
        if isinstance(item, dict) and str(item.get("id") or "") == item_id:
            return index, item
    return -1, None


def replace_or_insert(items: list[dict[str, Any]], item: dict[str, Any]) -> None:
    index, _ = find_by_id(items, str(item.get("id") or ""))
    if index >= 0:
        items[index] = item
    else:
        items.insert(0, item)


def mutate_workspace(mutator, reason: str) -> dict[str, Any]:
    with WORKSPACE_MUTATION_LOCK:
        state = ensure_workspace_collections(current_workspace_state())
        result = mutator(state)
        saved = write_workspace_state_with_snapshot(state, reason=reason, force=True)
    return {"state": saved["state"], "updated_at": saved["updated_at"], "result": result}


def upsert_project_item(payload: dict[str, Any], base_updated_at: str | None = None, force: bool = False) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        incoming = dict(payload or {})
        project_id = str(incoming.get("id") or "")
        _, existing = find_by_id(state["projects"], project_id)
        assert_record_not_conflicted(existing, base_updated_at, force)
        item = merge_item(existing, incoming, "proj")
        replace_or_insert(state["projects"], item)
        return item

    return mutate_workspace(mutator, "project-upsert")


def upsert_task_item(payload: dict[str, Any], base_updated_at: str | None = None, force: bool = False) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        now_date, now_time, now_iso = local_date_time()
        incoming = dict(payload or {})
        task_id = str(incoming.get("id") or "")
        _, existing = find_by_id(state["tasks"], task_id)
        assert_record_not_conflicted(existing, base_updated_at, force)
        item = merge_item(existing, incoming, "task")
        item.setdefault("status", "todo")
        item.setdefault("lane", "today")
        item.setdefault("startAt", now_iso)
        item.setdefault("start", now_time)
        item.setdefault("end", "24:00")
        item.setdefault("subtasks", [])
        replace_or_insert(state["tasks"], item)
        return item

    return mutate_workspace(mutator, "task-upsert")


def upsert_subtask_item(task_id: str, payload: dict[str, Any], base_updated_at: str | None = None, force: bool = False) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        _, task = find_by_id(state["tasks"], task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        if not isinstance(task.get("subtasks"), list):
            task["subtasks"] = []
        incoming = dict(payload or {})
        subtask_id = str(incoming.get("id") or "")
        _, existing = find_by_id(task["subtasks"], subtask_id)
        assert_record_not_conflicted(existing, base_updated_at, force)
        item = merge_item(existing, incoming, "subtask")
        item.setdefault("done", False)
        item.setdefault("startAt", local_date_time()[2])
        item.setdefault("dueDate", task.get("dueDate") or "")
        replace_or_insert(task["subtasks"], item)
        task["updatedAt"] = local_date_time()[2]
        return item

    return mutate_workspace(mutator, "subtask-upsert")


def upsert_time_block(date: str, payload: dict[str, Any], base_updated_at: str | None = None, force: bool = False) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        now_date, now_time, now_iso = local_date_time()
        target_date = str(date or payload.get("date") or now_date)
        blocks = state["timeBlocks"].setdefault(target_date, [])
        incoming = dict(payload or {})
        block_id = str(incoming.get("id") or "")
        _, existing = find_by_id(blocks, block_id)
        assert_record_not_conflicted(existing, base_updated_at, force)
        item = merge_item(existing, incoming, "block")
        item["date"] = target_date
        item.setdefault("start", now_time)
        item.setdefault("end", item["start"])
        replace_or_insert(blocks, item)
        return item

    return mutate_workspace(mutator, "time-block-upsert")


def minutes_between_hm(start: str, end: str) -> int:
    def parse(text: str) -> int | None:
        try:
            hour, minute = str(text).split(":", 1)
            return int(hour) * 60 + int(minute)
        except (TypeError, ValueError):
            return None

    start_min = parse(start)
    end_min = parse(end)
    if start_min is None or end_min is None:
        return 0
    if end_min < start_min:
        end_min += 24 * 60
    return max(0, end_min - start_min)


def start_focus_session(payload: FocusStartIn) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        date_text, time_text, iso_text = local_date_time()
        focus_id = new_id("focus")
        title = payload.title.strip()
        if not title and payload.task_id:
            _, task = find_by_id(state["tasks"], payload.task_id)
            if task:
                if payload.subtask_id:
                    _, subtask = find_by_id(task.get("subtasks") if isinstance(task.get("subtasks"), list) else [], payload.subtask_id)
                    title = str(subtask.get("title") or "") if subtask else ""
                title = title or str(task.get("title") or "")
        entry = {
            "id": focus_id,
            "title": title or "未命名专注",
            "category": payload.category or "research",
            "note": payload.note,
            "date": date_text,
            "start": time_text,
            "startedAt": iso_text,
            "startedAtTs": int(local_now().timestamp() * 1000),
            "taskId": payload.task_id or None,
            "subtaskId": payload.subtask_id or "",
            "expectedMinutes": payload.expected_minutes,
            "source": "subtask" if payload.subtask_id else "task" if payload.task_id else "manual",
        }
        state["focus"]["activeItems"].append(entry)
        if payload.task_id:
            _, task = find_by_id(state["tasks"], payload.task_id)
            if task:
                task["status"] = "active"
                task["activeFocusId"] = focus_id
                task["activeStartedAtTs"] = entry["startedAtTs"]
                task["startedAt"] = iso_text
                if payload.subtask_id and isinstance(task.get("subtasks"), list):
                    _, subtask = find_by_id(task["subtasks"], payload.subtask_id)
                    if subtask:
                        subtask["activeFocusId"] = focus_id
                        subtask["activeStartedAtTs"] = entry["startedAtTs"]
                        subtask["startedAt"] = iso_text
        return entry

    return mutate_workspace(mutator, "focus-start")


def stop_focus_session(payload: FocusStopIn) -> dict[str, Any]:
    def mutator(state: dict[str, Any]) -> dict[str, Any]:
        focus_id = payload.focus_id.strip()
        focus_items = state["focus"]["activeItems"]
        index, entry = find_by_id(focus_items, focus_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="Focus session not active")
        end_time = ""
        if payload.end_at:
            try:
                end_dt = datetime.fromisoformat(payload.end_at.replace(" ", "T"))
                end_time = end_dt.strftime("%H:%M")
            except ValueError:
                end_time = str(payload.end_at)[-5:]
        if not end_time:
            end_time = local_date_time()[1]
        start_time = str(entry.get("start") or end_time)
        minutes = minutes_between_hm(start_time, end_time)
        session = dict(entry)
        session["end"] = end_time
        session["minutes"] = minutes
        session["endedAt"] = local_date_time()[2]
        focus_items.pop(index)
        state["focus"]["sessions"].insert(0, session)
        task_id = str(entry.get("taskId") or "")
        subtask_id = str(entry.get("subtaskId") or "")
        if task_id:
            _, task = find_by_id(state["tasks"], task_id)
            if task and task.get("activeFocusId") == focus_id:
                task["status"] = "todo"
                task["activeFocusId"] = ""
                task["activeStartedAtTs"] = 0
            if task and subtask_id and isinstance(task.get("subtasks"), list):
                _, subtask = find_by_id(task["subtasks"], subtask_id)
                if subtask and subtask.get("activeFocusId") == focus_id:
                    subtask["activeFocusId"] = ""
                    subtask["activeStartedAtTs"] = 0
        return session

    return mutate_workspace(mutator, "focus-stop")


def read_operation_result(operation_id: str) -> dict[str, Any] | None:
    if not operation_id:
        return None
    with connect_db() as conn:
        row = conn.execute("SELECT result FROM operation_log WHERE id = ?", (operation_id,)).fetchone()
    if not row:
        return None
    try:
        parsed = json.loads(row["result"])
    except json.JSONDecodeError:
        return {"ok": True, "cached": True}
    return parsed if isinstance(parsed, dict) else {"ok": True, "cached": True}


def record_operation_result(operation_id: str, operation_type: str, result: dict[str, Any]) -> None:
    if not operation_id:
        return
    with connect_db() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO operation_log (id, operation_type, result, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (operation_id, operation_type, json_compact(result), utc_now()),
        )
        conn.commit()


def apply_operation(operation: OperationIn) -> dict[str, Any]:
    op_id = operation.id.strip()
    if not op_id:
        raise HTTPException(status_code=400, detail="Operation id is required")
    cached = read_operation_result(op_id)
    if cached is not None:
        cached["cached"] = True
        return cached

    op_type = operation.type.strip()
    payload = operation.payload or {}
    base_updated_at = str(payload.get("base_updated_at") or payload.get("baseUpdatedAt") or "").strip() or None
    force = bool(payload.get("force"))
    if op_type == "project.upsert":
        result = upsert_project_item(payload.get("item") or payload, base_updated_at, force)
    elif op_type == "task.upsert":
        result = upsert_task_item(payload.get("item") or payload, base_updated_at, force)
    elif op_type == "subtask.upsert":
        result = upsert_subtask_item(
            str(payload.get("task_id") or payload.get("taskId") or ""),
            payload.get("item") or {},
            base_updated_at,
            force,
        )
    elif op_type == "time_block.upsert":
        result = upsert_time_block(str(payload.get("date") or ""), payload.get("item") or payload, base_updated_at, force)
    elif op_type == "focus.start":
        result = start_focus_session(FocusStartIn(**payload))
    elif op_type == "focus.stop":
        result = stop_focus_session(FocusStopIn(**payload))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported operation type: {op_type}")

    compact = {
        "ok": True,
        "operation_id": op_id,
        "type": op_type,
        "updated_at": result.get("updated_at"),
        "result": result.get("result"),
    }
    record_operation_result(op_id, op_type, compact)
    return compact


def apply_operation_batch(operations: list[OperationIn]) -> dict[str, Any]:
    results = []
    for operation in operations:
        try:
            results.append(apply_operation(operation))
        except HTTPException as exc:
            results.append(
                {
                    "ok": False,
                    "operation_id": operation.id,
                    "type": operation.type,
                    "status_code": exc.status_code,
                    "detail": exc.detail,
                }
            )
        except Exception as exc:
            results.append(
                {
                    "ok": False,
                    "operation_id": operation.id,
                    "type": operation.type,
                    "status_code": 500,
                    "detail": str(exc),
                }
            )
    return {"ok": all(item.get("ok") for item in results), "results": results}


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


def focus_minutes_between(state: dict[str, Any], start: str, end: str) -> int:
    focus = state.get("focus") if isinstance(state.get("focus"), dict) else {}
    total = 0
    for session in as_dict_list(focus.get("sessions")):
        date = str(session.get("date") or "")
        if start <= date <= end:
            total += int(float(session.get("minutes") or 0))
    return total


def ai_context_payload(range_days: int = 7) -> dict[str, Any]:
    from app.reminders import LOCAL_TZ
    from datetime import timedelta

    state = current_workspace_state()
    today = datetime.now(LOCAL_TZ).date()
    start = (today - timedelta(days=max(1, range_days) - 1)).isoformat()
    end = today.isoformat()
    tasks = as_dict_list(state.get("tasks"))
    projects = as_dict_list(state.get("projects"))
    review_daily = state.get("reviewDaily") if isinstance(state.get("reviewDaily"), dict) else {}
    reviews = review_daily.get("entries") if isinstance(review_daily.get("entries"), dict) else {}

    def due_date(task: dict[str, Any]) -> str:
        return str(task.get("dueDate") or task.get("deadline") or "")

    def done(task: dict[str, Any]) -> bool:
        return task.get("status") == "done" or task.get("gtdBucket") == "done" or bool(task.get("doneAt"))

    return {
        "range": {"start": start, "end": end, "days": range_days},
        "today_tasks": [task for task in tasks if task.get("lane") == "today" and not done(task)],
        "future_tasks": [task for task in tasks if task.get("lane") == "future" and not done(task)],
        "overdue_tasks": [task for task in tasks if due_date(task) and due_date(task) < end and not done(task)],
        "completed_recent": [task for task in tasks if str(task.get("doneAt") or "")[:10] >= start],
        "projects": [project for project in projects if project.get("status") != "archived"],
        "focus": {
            "minutes": focus_minutes_between(state, start, end),
            "active": (state.get("focus") if isinstance(state.get("focus"), dict) else {}).get("activeItems") or [],
        },
        "daily_reviews": {date: value for date, value in reviews.items() if start <= date <= end},
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


@app.get("/api/events")
async def stream_state_events(
    _: None = Depends(require_api_token),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    init_db()
    start_event_id = normalize_event_cursor(parse_event_id(last_event_id)) or STATE_EVENT_ID

    async def event_generator():
        last_seen = start_event_id
        yield ": connected\n\n"
        try:
            while True:
                event_id, updated_at = await asyncio.to_thread(wait_for_workspace_state_update, last_seen)
                if event_id > last_seen and updated_at:
                    last_seen = event_id
                    payload = json.dumps(
                        {"updated_at": updated_at, "event_id": event_id},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    yield f"id: {event_id}\nevent: state\ndata: {payload}\n\n"
                else:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/entities")
def get_entities(_: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return read_entities()


@app.post("/api/projects")
def upsert_project(payload: EntityUpsertIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return upsert_project_item(payload.item, payload.base_updated_at, payload.force)


@app.post("/api/tasks")
def upsert_task(payload: EntityUpsertIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return upsert_task_item(payload.item, payload.base_updated_at, payload.force)


@app.post("/api/tasks/{task_id}/subtasks")
def upsert_subtask(task_id: str, payload: SubtaskUpsertIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return upsert_subtask_item(task_id, payload.item, payload.base_updated_at, payload.force)


@app.post("/api/time-blocks")
def upsert_schedule_block(payload: ScheduleBlockUpsertIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return upsert_time_block(payload.date, payload.item, payload.base_updated_at, payload.force)


@app.post("/api/focus/start")
def start_focus(payload: FocusStartIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return start_focus_session(payload)


@app.post("/api/focus/stop")
def stop_focus(payload: FocusStopIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return stop_focus_session(payload)


@app.post("/api/operations/batch")
def apply_operations(payload: OperationBatchIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return apply_operation_batch(payload.operations)


@app.get("/api/ai/context")
def get_ai_context(_: None = Depends(require_api_token), range_days: int = 7) -> dict[str, Any]:
    init_db()
    safe_days = min(max(range_days, 1), 30)
    return ai_context_payload(range_days=safe_days)


@app.post("/api/state")
def save_state(payload: WorkspaceStateIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    return write_workspace_state_with_snapshot(
        payload.state,
        reason=payload.reason,
        base_updated_at=payload.base_updated_at,
        force=payload.force,
    )


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
    results = send_notification(
        title=payload.title,
        content=payload.content,
        wxpusher_spt=payload.wxpusher_spt,
    )
    return {
        "ok": any(result.ok for result in results),
        "results": [serialize_notification_result(result) for result in results],
    }


@app.post("/api/reminders/scan")
def scan_reminders(payload: ReminderScanIn, _: None = Depends(require_api_token)) -> dict[str, Any]:
    init_db()
    workspace = read_workspace_state()["state"]
    notification_settings = workspace.get("notificationSettings", {})
    workspace_spt = ""
    if isinstance(notification_settings, dict):
        workspace_spt = str(notification_settings.get("wxpusherSpt") or "").strip()
    wxpusher_spt = (payload.wxpusher_spt or workspace_spt).strip()
    candidates = collect_due_reminders(workspace, soon_hours=payload.soon_hours)
    unsent = [candidate for candidate in candidates if not notification_event_exists(candidate.event_key)]
    sent: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    if not payload.dry_run:
        for candidate in unsent:
            results = send_notification(
                title=candidate.title,
                content=candidate.body,
                wxpusher_spt=wxpusher_spt,
            )
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
