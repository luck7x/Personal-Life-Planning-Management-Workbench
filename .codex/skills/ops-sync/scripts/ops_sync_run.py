#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
NORMALIZE_SCRIPT = SKILL_DIR / "scripts" / "ops_sync_normalize.py"
APPLY_SCRIPT = SKILL_DIR.parent / "ops-apply" / "scripts" / "ops_apply.py"


def configure_stdio() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream and hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    # Force child Python processes to emit UTF-8 so Chinese paths survive
    # the normalize -> apply handoff on Windows.
    env["PYTHONUTF8"] = "1"
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        check=False,
    )


def extract_json_object(raw: str) -> dict[str, Any]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise SystemExit("ops-sync-run: no JSON object found in child output")
    return json.loads(raw[start : end + 1])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the ops-sync orchestration chain.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True, help="Path to raw ops-judge output text")
    return parser


def main() -> int:
    configure_stdio()
    args = build_parser().parse_args()
    project_root = Path(args.project_root).resolve()
    input_path = Path(args.input).resolve()

    normalize_proc = run(
        [
            sys.executable,
            str(NORMALIZE_SCRIPT),
            "--project-root",
            str(project_root),
            "--input",
            str(input_path),
        ]
    )
    if normalize_proc.returncode != 0:
        sys.stderr.write(normalize_proc.stderr or normalize_proc.stdout)
        return normalize_proc.returncode

    normalize_report = extract_json_object(normalize_proc.stdout)
    decision = normalize_report["decision"]
    status = normalize_report["status"]
    result: dict[str, Any] = {
        "status": status,
        "decision": decision,
        "normalize": normalize_report,
    }

    if decision == "ignore":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    event_file = normalize_report.get("event_file")
    if not event_file:
        raise SystemExit("ops-sync-run: missing event_file for non-ignore decision")

    apply_proc = run(
        [
            sys.executable,
            str(APPLY_SCRIPT),
            "--project-root",
            str(project_root),
            "--input",
            str(event_file),
        ]
    )
    if apply_proc.returncode != 0:
        sys.stderr.write(apply_proc.stderr or apply_proc.stdout)
        return apply_proc.returncode

    apply_report = extract_json_object(apply_proc.stdout)
    result["apply"] = apply_report
    result["status"] = apply_report["status"]

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
