#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


REQUIRED_DECISIONS = {"ignore", "defer", "apply"}
CLEARABLE_LIST_EVENT_KEYS = {"blockers", "next3", "active_issues"}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def extract_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        fence = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text, re.IGNORECASE)
        if fence:
            text = fence.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise SystemExit("ops-sync-normalize: no JSON object found")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ops-sync-normalize: invalid JSON: {exc}") from exc


def ensure_string_list(value: Any, field_name: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise SystemExit(f"ops-sync-normalize: {field_name} must be list[str]")
    return [item.strip() for item in value if item.strip()]


def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    decision = str(payload.get("decision", "")).strip().lower()
    if decision not in REQUIRED_DECISIONS:
        raise SystemExit("ops-sync-normalize: decision must be ignore, defer, or apply")

    reason = str(payload.get("reason", "")).strip()
    summary = str(payload.get("summary", "")).strip()
    event = payload.get("event")
    if not isinstance(event, dict):
        raise SystemExit("ops-sync-normalize: event must be an object")

    source = str(event.get("source", "")).strip()
    intent = str(event.get("intent", "")).strip()
    result = str(event.get("result", "")).strip()
    if source != "ops-judge":
        raise SystemExit("ops-sync-normalize: event.source must be ops-judge")
    if not intent or not result:
        raise SystemExit("ops-sync-normalize: event.intent and event.result are required")

    normalized_event: dict[str, Any] = {
        "source": source,
        "intent": intent,
        "result": result,
    }
    for key in ("focus", "issue_id", "issue_status", "kb_id", "kb_pattern", "kb_root_cause", "brief_append"):
        value = event.get(key)
        if isinstance(value, str) and value.strip():
            normalized_event[key] = value.strip()

    for key in ("tags", "links", "blockers", "next3", "active_issues", "done_add", "notes", "issue_debug_add", "kb_fix", "kb_precheck"):
        values = ensure_string_list(event.get(key), f"event.{key}")
        if values or (key in CLEARABLE_LIST_EVENT_KEYS and key in event):
            normalized_event[key] = values

    canonical_basis = {
        "decision": decision,
        "event": normalized_event,
    }
    dedupe_key = hashlib.sha256(
        json.dumps(canonical_basis, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]

    normalized: dict[str, Any] = {
        "schema_version": "ops-event/v3",
        "decision": decision,
        "reason": reason,
        "summary": summary,
        "dedupe_key": dedupe_key,
        "event": normalized_event,
    }
    return normalized


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Normalize raw ops-judge output into canonical JSON.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    project_root = Path(args.project_root).resolve()
    state_dir = project_root / ".codex" / "state"

    raw_payload = extract_json_object(read_text(Path(args.input)))
    normalized = normalize_payload(raw_payload)

    if normalized["decision"] == "ignore":
        print(
            json.dumps(
                {
                    "status": "ignored",
                    "decision": normalized["decision"],
                    "dedupe_key": normalized["dedupe_key"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    # apply → events/, defer → tmp/ (avoid polluting formal state)
    if normalized["decision"] == "apply":
        out_dir = state_dir / "events"
    else:
        out_dir = state_dir / "tmp"
    output_path = out_dir / f"{normalized['dedupe_key']}.json"
    write_text(output_path, json.dumps(normalized, ensure_ascii=False, indent=2))

    print(
        json.dumps(
            {
                "status": "normalized",
                "decision": normalized["decision"],
                "dedupe_key": normalized["dedupe_key"],
                "event_file": str(output_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

