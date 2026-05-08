from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "mingxintai.sqlite3"


class WorkspaceStateIn(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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


def write_workspace_state(state: dict[str, Any]) -> dict[str, Any]:
    updated_at = utc_now()
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    with connect_db() as conn:
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
        conn.commit()
    return {"state": state, "updated_at": updated_at}


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
    }


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    init_db()
    return read_workspace_state()


@app.post("/api/state")
def save_state(payload: WorkspaceStateIn) -> dict[str, Any]:
    init_db()
    return write_workspace_state(payload.state)
