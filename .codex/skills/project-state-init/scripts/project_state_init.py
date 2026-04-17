#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

FALLBACK_SRC = Path(r"D:\lucky\Supplies\个人\AI\CLI\codex\skills\项目持久上下文v2")
SKIP_PARTS = {"__pycache__"}


def _default_src() -> Path:
    self_root = Path(__file__).resolve().parents[4]
    if (self_root / "AGENTS.md").exists() and (self_root / ".codex" / "skills").exists():
        return self_root
    return FALLBACK_SRC


DEFAULT_SRC = _default_src()


def _ts() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _copy_file(src: Path, dst: Path, mode: str) -> str:
    if dst.exists():
        if mode == "skip":
            return f"skip: {dst}"
        if mode == "backup":
            backup = dst.with_name(dst.name + f".backup-{_ts()}")
            dst.rename(backup)
            action = f"backup: {backup}"
        else:
            dst.unlink()
            action = f"overwrite: {dst}"
    else:
        action = f"create: {dst}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return f"{action} <- {src}"


def _copy_dir(src: Path, dst: Path, mode: str) -> str:
    if dst.exists():
        if mode == "skip":
            return f"skip: {dst}"
        if mode == "backup":
            backup = dst.with_name(dst.name + f".backup-{_ts()}")
            dst.rename(backup)
            action = f"backup: {backup}"
        else:
            shutil.rmtree(dst)
            action = f"overwrite: {dst}"
    else:
        action = f"create: {dst}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst)
    return f"{action} <- {src}"


def _iter_tree(src: Path):
    for path in sorted(src.rglob("*")):
        if any(part in SKIP_PARTS for part in path.parts):
            continue
        if path.is_file() and path.suffix == ".pyc":
            continue
        yield path


def _copy_tree_filtered(src: Path, dst: Path) -> list[str]:
    actions: list[str] = []
    dst.mkdir(parents=True, exist_ok=True)
    for path in _iter_tree(src):
        rel = path.relative_to(src)
        target = dst / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        actions.append(f"install: {target} <- {path}")
    return actions


def _is_tree_installed(src: Path, dst: Path) -> bool:
    if not dst.exists() or not dst.is_dir():
        return False
    for path in _iter_tree(src):
        rel = path.relative_to(src)
        target = dst / rel
        if path.is_dir():
            if not target.exists() or not target.is_dir():
                return False
            continue
        if not target.exists() or not target.is_file():
            return False
    return True


def _is_suite_installed(src_agents: Path, src_skills: Path, dest_root: Path) -> bool:
    dest_agents = dest_root / "AGENTS.md"
    dest_skills_root = dest_root / ".codex" / "skills"
    if not dest_agents.exists() or not dest_skills_root.exists():
        return False
    for entry in sorted(src_skills.iterdir()):
        if not entry.is_dir() or entry.name in SKIP_PARTS:
            continue
        if not _is_tree_installed(entry, dest_skills_root / entry.name):
            return False
    return True


def _repair_missing_tree(src: Path, dst: Path) -> list[str]:
    actions: list[str] = []
    dst.mkdir(parents=True, exist_ok=True)
    for path in _iter_tree(src):
        rel = path.relative_to(src)
        target = dst / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        actions.append(f"repair missing: {target} <- {path}")
    return actions


def _install_agents(src: Path, dst: Path, mode: str) -> list[str]:
    if not dst.exists():
        return [_copy_file(src, dst, "skip")]
    if mode == "skip":
        return [f"skip installed: {dst}"]
    return [_copy_file(src, dst, mode)]


def _install_skill_dir(src: Path, dst: Path, mode: str) -> list[str]:
    if _is_tree_installed(src, dst):
        if mode == "skip":
            return [f"skip installed: {dst}"]
        return [_copy_dir(src, dst, mode)]

    if not dst.exists():
        return _copy_tree_filtered(src, dst)

    if mode in {"backup", "overwrite"}:
        return [_copy_dir(src, dst, mode)]

    actions = _repair_missing_tree(src, dst)
    if not actions:
        actions.append(f"skip installed: {dst}")
    return actions


def _paths_overlap(src_root: Path, dest_root: Path) -> bool:
    try:
        src_root.relative_to(dest_root)
        return True
    except ValueError:
        pass
    try:
        dest_root.relative_to(src_root)
        return True
    except ValueError:
        return False


def _ensure_state_skeleton(dest_root: Path) -> list[str]:
    # Create empty dirs and seed core files from templates in ops-sync skill if available.
    actions: list[str] = []
    state_dir = dest_root / ".codex" / "state"
    issues_dir = state_dir / "issues"
    kb_dir = state_dir / "kb"
    issues_dir.mkdir(parents=True, exist_ok=True)
    kb_dir.mkdir(parents=True, exist_ok=True)
    actions.append(f"ensure dir: {issues_dir}")
    actions.append(f"ensure dir: {kb_dir}")

    templates_dir = dest_root / ".codex" / "skills" / "ops-sync" / "templates"
    brief_tpl = templates_dir / "brief.md"
    progress_tpl = templates_dir / "progress.md"
    log_tpl = templates_dir / "interaction-log.md"

    def seed(dst: Path, tpl: Path, fallback: str) -> None:
        nonlocal actions
        if dst.exists():
            actions.append(f"exists: {dst}")
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        if tpl.exists():
            shutil.copy2(tpl, dst)
            actions.append(f"seed: {dst} <- {tpl}")
        else:
            dst.write_text(fallback + "\n", encoding="utf-8")
            actions.append(f"seed: {dst} <- (fallback)")

    seed(state_dir / "BRIEF.md", brief_tpl, "# BRIEF\n\n- （待补）\n")
    seed(state_dir / "progress.md", progress_tpl, "# Progress\n\n- （待补）\n")
    seed(state_dir / "interaction-log.md", log_tpl, "# Interaction Log\n\n- （待补）\n")
    return actions


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Initialize Codex project-state kit (AGENTS.md + .codex/skills) into a project root."
    )
    parser.add_argument(
        "--src",
        default=str(DEFAULT_SRC),
        help="Source kit directory (default: your local 项目记忆 path).",
    )
    parser.add_argument(
        "--dest",
        default=".",
        help="Destination project root (default: current directory).",
    )
    parser.add_argument(
        "--mode",
        choices=["backup", "overwrite", "skip"],
        default="skip",
        help="Reinstall policy for existing artifacts: backup, overwrite, or skip (default: skip). Missing skills are always installed.",
    )
    parser.add_argument(
        "--init-state",
        action="store_true",
        help="Create .codex/state skeleton files (BRIEF.md/progress.md/interaction-log.md).",
    )
    args = parser.parse_args()

    src_root = Path(args.src).expanduser().resolve()
    dest_root = Path(args.dest).expanduser().resolve()

    if not src_root.exists():
        print(f"ERROR: source not found: {src_root}", file=sys.stderr)
        return 2
    if _paths_overlap(src_root, dest_root):
        print(
            f"ERROR: source and destination must not overlap: src={src_root} dest={dest_root}",
            file=sys.stderr,
        )
        return 2

    src_agents = src_root / "AGENTS.md"
    src_skills = src_root / ".codex" / "skills"

    if not src_agents.exists():
        print(f"ERROR: missing AGENTS.md in source: {src_agents}", file=sys.stderr)
        return 2
    if not src_skills.exists():
        print(f"ERROR: missing .codex/skills in source: {src_skills}", file=sys.stderr)
        return 2

    dest_agents = dest_root / "AGENTS.md"
    dest_skills_root = dest_root / ".codex" / "skills"
    dest_skills_root.mkdir(parents=True, exist_ok=True)

    print(f"Source: {src_root}")
    print(f"Dest:   {dest_root}")
    print(f"Mode:   {args.mode}")

    actions: list[str] = []
    if args.mode == "skip" and _is_suite_installed(src_agents, src_skills, dest_root):
        actions.append(f"skip suite installed: {dest_root}")
    else:
        actions.extend(_install_agents(src_agents, dest_agents, args.mode))

        # Install each skill into project-local .codex/skills.
        for entry in sorted(src_skills.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name in SKIP_PARTS:
                continue
            actions.extend(_install_skill_dir(entry, dest_skills_root / entry.name, args.mode))

    if args.init_state:
        actions.extend(_ensure_state_skeleton(dest_root))

    print("\nActions:")
    for a in actions:
        print(f"- {a}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
