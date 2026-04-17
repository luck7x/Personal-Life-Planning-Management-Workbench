#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "ops-sync" / "templates"

ALLOWED_TOP_KEYS = {
    "schema_version", "decision", "reason", "summary", "dedupe_key", "event",
}


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def seed(path: Path, template_name: str, replacements: dict[str, str] | None = None) -> None:
    if path.exists():
        return
    text = read_text(TEMPLATES_DIR / template_name)
    for old, new in (replacements or {}).items():
        text = text.replace(old, new)
    write_text(path, text)


def ensure_state(state_dir: Path) -> list[str]:
    issues_dir = state_dir / "issues"
    kb_dir = state_dir / "kb"
    events_dir = state_dir / "events"
    tmp_dir = state_dir / "tmp"
    actions: list[str] = []
    for d in (issues_dir, kb_dir, events_dir, tmp_dir):
        d.mkdir(parents=True, exist_ok=True)
        actions.append(f"ensure dir: {d}")
    for filename, template in {
        "BRIEF.md": "brief.md",
        "progress.md": "progress.md",
        "interaction-log.md": "interaction-log.md",
    }.items():
        target = state_dir / filename
        existed = target.exists()
        seed(target, template)
        actions.append(("exists" if existed else "seed") + f": {target}")
    return actions


def replace_markdown_section(md: str, heading: str, items: list[str], ordered: bool = False) -> str:
    pattern = rf"(## {re.escape(heading)}\n).*?(?=\n## |\Z)"
    if ordered:
        if items:
            lines = [f"{i}. {item}" for i, item in enumerate(items, 1)]
        else:
            lines = ["1. None", "2. None", "3. None"]
    else:
        lines = [f"- {item}" for item in items] or ["- None"]
    body = "\n" + "\n".join(lines) + "\n"
    return re.sub(pattern, rf"\g<1>{body}", md, flags=re.DOTALL)


def append_markdown_section(md: str, heading: str, items: list[str]) -> str:
    pattern = rf"(## {re.escape(heading)}\n)(.*?)(?=\n## |\Z)"
    match = re.search(pattern, md, flags=re.DOTALL)
    if not match:
        return md
    existing = match.group(2).strip()
    lines = existing.split("\n") if existing and existing != "- None" else []
    for item in items:
        line = f"- {item}"
        if line not in lines:
            lines.append(line)
    body = "\n".join(lines or ["- None"]) + "\n"
    return md[:match.start(2)] + body + md[match.end(2):]


# ---------------------------------------------------------------------------
# Validation — strict schema, no fallback
# ---------------------------------------------------------------------------

ALLOWED_EVENT_KEYS = {
    "source", "intent", "result", "tags", "links",
    "focus", "blockers", "next3", "active_issues",
    "done_add", "notes",
    "issue_id", "issue_status", "issue_debug_add",
    "kb_id", "kb_pattern", "kb_root_cause", "kb_fix", "kb_precheck",
    "brief_append",
}


def validate_payload(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    extra_top = set(payload.keys()) - ALLOWED_TOP_KEYS
    if extra_top:
        errors.append(f"undeclared top-level keys: {extra_top}")
    if payload.get("schema_version") != "ops-event/v3":
        errors.append(f"unsupported schema_version: {payload.get('schema_version')}")
    if payload.get("decision") not in ("defer", "apply"):
        errors.append(f"unexpected decision: {payload.get('decision')}")
    if not payload.get("dedupe_key"):
        errors.append("missing dedupe_key")
    event = payload.get("event")
    if not isinstance(event, dict):
        errors.append("missing or invalid event object")
    else:
        extra_event = set(event.keys()) - ALLOWED_EVENT_KEYS
        if extra_event:
            errors.append(f"undeclared event keys: {extra_event}")
    return errors


# ---------------------------------------------------------------------------
# Dedupe
# ---------------------------------------------------------------------------

def load_dedupe(state_dir: Path) -> dict[str, Any]:
    path = state_dir / "_ops-dedupe.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_dedupe(state_dir: Path, data: dict[str, Any]) -> None:
    write_text(state_dir / "_ops-dedupe.json", json.dumps(data, ensure_ascii=False, indent=2))


def is_duplicate(state_dir: Path, dedupe_key: str) -> bool:
    return dedupe_key in load_dedupe(state_dir)


def record_dedupe(state_dir: Path, dedupe_key: str, decision: str) -> None:
    data = load_dedupe(state_dir)
    data[dedupe_key] = {"decision": decision, "ts": now_str()}
    save_dedupe(state_dir, data)


# ---------------------------------------------------------------------------
# State writers — only read from event object, no top-level fallback
# ---------------------------------------------------------------------------

def update_progress(state_dir: Path, event: dict[str, Any]) -> list[str]:
    path = state_dir / "progress.md"
    text = read_text(path)
    actions: list[str] = []

    if event.get("focus"):
        text = replace_markdown_section(text, "Current Focus", [event["focus"]])
        actions.append("progress: set focus")
    if "active_issues" in event:
        text = replace_markdown_section(text, "Active Issues", event["active_issues"])
        actions.append("progress: set active_issues")
    if "blockers" in event:
        text = replace_markdown_section(text, "Blockers", event["blockers"])
        actions.append("progress: set blockers")
    if "next3" in event:
        text = replace_markdown_section(text, "Next 3 Actions", event["next3"], ordered=True)
        actions.append("progress: set next3")
    if event.get("done_add"):
        text = append_markdown_section(text, "Done", event["done_add"])
        actions.append("progress: append done")
    if event.get("notes"):
        text = append_markdown_section(text, "Notes", event["notes"])
        actions.append("progress: append notes")

    if actions:
        write_text(path, text)
    return actions


def check_interaction_log_duplicate(state_dir: Path, dedupe_key: str) -> bool:
    path = state_dir / "interaction-log.md"
    text = read_text(path)
    return f"<!-- dedupe:{dedupe_key} -->" in text


def append_interaction_log(state_dir: Path, event: dict[str, Any], dedupe_key: str, summary: str) -> list[str]:
    path = state_dir / "interaction-log.md"
    if check_interaction_log_duplicate(state_dir, dedupe_key):
        return ["interaction-log: skipped (duplicate)"]
    text = read_text(path)
    entry = f"\n## [{now_str()}] {event.get('intent', 'update')}\n"
    entry += f"<!-- dedupe:{dedupe_key} -->\n"
    entry += f"- **Source**: {event.get('source', 'unknown')}\n"
    entry += f"- **Result**: {event.get('result', summary)}\n"
    if event.get("tags"):
        entry += f"- **Tags**: {', '.join(event['tags'])}\n"
    if event.get("links"):
        entry += f"- **Links**: {', '.join(event['links'])}\n"
    write_text(path, text.rstrip() + "\n" + entry)
    return ["interaction-log: appended"]


def update_issue(state_dir: Path, event: dict[str, Any]) -> list[str]:
    issue_id = event.get("issue_id")
    if not issue_id:
        return []
    path = state_dir / "issues" / f"{issue_id}.md"
    seed(path, "issue.md", {"{ISSUE_ID}": issue_id})
    text = read_text(path)
    actions: list[str] = []
    if event.get("issue_status"):
        text = re.sub(r"(## Status\n).*?(?=\n## |\Z)",
                      rf"\g<1>\n- {event['issue_status']}\n", text, flags=re.DOTALL)
        actions.append(f"issue {issue_id}: set status")
    if event.get("issue_debug_add"):
        debug_items = [f"[{now_str()}] {line}" for line in event["issue_debug_add"]]
        text = append_markdown_section(text, "Debug Log", debug_items)
        actions.append(f"issue {issue_id}: append debug")
    if actions:
        write_text(path, text)
    return actions


def update_kb(state_dir: Path, event: dict[str, Any]) -> list[str]:
    kb_id = event.get("kb_id")
    if not kb_id:
        return []
    path = state_dir / "kb" / f"{kb_id}.md"
    seed(path, "kb.md", {"{KB_ID}": kb_id})
    text = read_text(path)
    actions: list[str] = []
    for field, heading in [
        ("kb_pattern", "Pattern"), ("kb_root_cause", "Root Cause"),
        ("kb_fix", "Fix"), ("kb_precheck", "Precheck"),
    ]:
        val = event.get(field)
        if val:
            # Build bullet lines: val can be str or list[str]
            if isinstance(val, list):
                body = "\n".join(f"- {item}" for item in val)
            else:
                body = f"- {val}"
            text = re.sub(rf"(## {re.escape(heading)}\n).*?(?=\n## |\Z)",
                          rf"\g<1>\n{body}\n", text, flags=re.DOTALL)
            actions.append(f"kb {kb_id}: set {field}")
    if actions:
        write_text(path, text)
    return actions


def update_brief(state_dir: Path, event: dict[str, Any]) -> list[str]:
    val = event.get("brief_append")
    if not val:
        return []
    path = state_dir / "BRIEF.md"
    text = read_text(path)

    if isinstance(val, str):
        items = [val]
    elif isinstance(val, list):
        items = val
    else:
        return []

    text = append_markdown_section(text, "Requirements Evolution", items)
    write_text(path, text)
    return ["brief: appended"]


def save_event(state_dir: Path, payload: dict[str, Any]) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    key = payload["dedupe_key"].replace("/", "_").replace(" ", "_")
    filename = f"{ts}_{key}.json"
    path = state_dir / "events" / filename
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))
    return str(path)


# ---------------------------------------------------------------------------
# Main apply logic
# ---------------------------------------------------------------------------

def apply_payload(payload: dict[str, Any], project_root: Path) -> dict[str, Any]:
    state_dir = project_root / ".codex" / "state"

    errors = validate_payload(payload)
    if errors:
        return {"status": "error", "errors": errors}

    dedupe_key = payload["dedupe_key"]
    decision = payload["decision"]
    summary = payload.get("summary", "")
    event = payload.get("event", {})

    # Duplicate check — only needs state_dir to exist for dedupe file
    state_dir.mkdir(parents=True, exist_ok=True)
    if is_duplicate(state_dir, dedupe_key):
        return {"status": "duplicate", "dedupe_key": dedupe_key}

    actions: list[str] = []

    if decision == "defer":
        # defer: only write _ops-deferred.jsonl + _ops-dedupe.json
        # Do NOT call ensure_state, do NOT create formal state files
        deferred_path = state_dir / "_ops-deferred.jsonl"
        line = json.dumps(payload, ensure_ascii=False)
        with open(deferred_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        actions.append("deferred: appended")
        # Write dedupe AFTER successful deferred write
        record_dedupe(state_dir, dedupe_key, decision)
        return {"status": decision, "dedupe_key": dedupe_key, "actions": actions}

    elif decision == "apply":
        # apply: full state initialization + writes
        ensure_state(state_dir)
        # Note: canonical event file is already written by normalize stage
        # Do NOT call save_event here to avoid duplicate event files
        # Update all state files from event object only
        actions.extend(update_progress(state_dir, event))
        actions.extend(append_interaction_log(state_dir, event, dedupe_key, summary))
        actions.extend(update_issue(state_dir, event))
        actions.extend(update_kb(state_dir, event))
        actions.extend(update_brief(state_dir, event))

    report = {"status": decision, "dedupe_key": dedupe_key, "actions": actions}
    write_text(
        state_dir / "_ops-sync-report.json",
        json.dumps(report, ensure_ascii=False, indent=2),
    )
    # Write dedupe LAST — after all state + report writes succeed
    record_dedupe(state_dir, dedupe_key, decision)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="ops-apply: write canonical event to state")
    parser.add_argument("--project-root", required=True, help="Project root directory")
    parser.add_argument("--input", required=True, help="Path to canonical event JSON file")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    input_path = Path(args.input).resolve()

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    result = apply_payload(payload, project_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

