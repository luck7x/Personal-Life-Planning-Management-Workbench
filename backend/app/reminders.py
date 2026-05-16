from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo


LOCAL_TZ = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True)
class ReminderCandidate:
    event_key: str
    title: str
    body: str
    kind: str
    due_at: str
    task_id: str
    subtask_id: str = ""


@dataclass(frozen=True)
class ReminderRule:
    enabled: bool = True
    lead_minutes: int = 30
    at_due: bool = True
    overdue: bool = True


def local_now() -> datetime:
    return datetime.now(LOCAL_TZ)


def parse_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on", "y"}:
        return True
    if text in {"0", "false", "no", "off", "n"}:
        return False
    return default


def parse_lead_minutes(value: Any, default: int = 30) -> int:
    try:
        minutes = int(float(value))
    except (TypeError, ValueError):
        minutes = default
    return max(0, min(minutes, 10080))


def global_notification_rule(state: dict[str, Any]) -> ReminderRule:
    raw = state.get("notificationSettings")
    if not isinstance(raw, dict):
        settings = state.get("settings")
        raw = settings.get("notifications") if isinstance(settings, dict) else {}
    raw = raw if isinstance(raw, dict) else {}
    return ReminderRule(
        enabled=parse_bool(raw.get("enabled"), True),
        lead_minutes=parse_lead_minutes(raw.get("leadMinutes"), 30),
        at_due=parse_bool(raw.get("atDue"), True),
        overdue=parse_bool(raw.get("overdue"), True),
    )


def apply_notification_override(base: ReminderRule, config: Any, default_mode: str = "default") -> ReminderRule:
    if not isinstance(config, dict):
        return base
    mode = str(config.get("mode") or default_mode).strip().lower()
    if mode == "off":
        return ReminderRule(enabled=False)
    if mode not in {"custom", "default", "inherit"}:
        return base
    if mode in {"default", "inherit"}:
        return base
    return ReminderRule(
        enabled=parse_bool(config.get("enabled"), True),
        lead_minutes=parse_lead_minutes(config.get("leadMinutes"), base.lead_minutes),
        at_due=parse_bool(config.get("atDue"), base.at_due),
        overdue=parse_bool(config.get("overdue"), base.overdue),
    )


def parse_due_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        if len(text) == 10:
            return datetime.combine(date.fromisoformat(text), time(23, 59), tzinfo=LOCAL_TZ)
        parsed = datetime.fromisoformat(text.replace(" ", "T"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=LOCAL_TZ)
        return parsed.astimezone(LOCAL_TZ)
    except ValueError:
        return None


def task_is_done(task: dict[str, Any]) -> bool:
    return task.get("status") == "done" or task.get("gtdBucket") == "done" or bool(task.get("doneAt"))


def task_is_memo(task: dict[str, Any]) -> bool:
    return task.get("status") == "memo" or task.get("gtdBucket") == "memo"


def subtask_is_done(subtask: dict[str, Any]) -> bool:
    return bool(subtask.get("done") or subtask.get("doneAt"))


def classify_due(now: datetime, due_at: datetime, soon_hours: int, rule: ReminderRule) -> str | None:
    if not rule.enabled:
        return None
    delta_minutes = (due_at - now).total_seconds() / 60
    if delta_minutes < 0:
        return "overdue" if rule.overdue else None
    if rule.at_due and delta_minutes <= 1:
        return "due_now"
    lead_cap = min(rule.lead_minutes, max(0, soon_hours) * 60)
    if lead_cap > 0 and delta_minutes <= lead_cap:
        return "due_soon"
    return None


def format_due(due_at: datetime) -> str:
    return due_at.strftime("%Y-%m-%d %H:%M")


def build_task_candidate(task: dict[str, Any], kind: str, due_at: datetime) -> ReminderCandidate:
    title = str(task.get("title") or "未命名任务")
    due_text = format_due(due_at)
    heading = "任务已逾期" if kind == "overdue" else "任务到期" if kind == "due_now" else "任务快到期"
    body = f"### {heading}\n\n- 任务：{title}\n- 到期：{due_text}\n- 状态：{task.get('status') or 'todo'}"
    task_id = str(task.get("id") or title)
    return ReminderCandidate(
        event_key=f"{kind}:task:{task_id}:{due_at.strftime('%Y%m%dT%H%M')}",
        title=f"明心台提醒：{heading}",
        body=body,
        kind=kind,
        due_at=due_at.isoformat(),
        task_id=task_id,
    )


def build_subtask_candidate(task: dict[str, Any], subtask: dict[str, Any], kind: str, due_at: datetime) -> ReminderCandidate:
    parent_title = str(task.get("title") or "未命名任务")
    title = str(subtask.get("title") or "未命名子任务")
    due_text = format_due(due_at)
    heading = "子任务已逾期" if kind == "overdue" else "子任务到期" if kind == "due_now" else "子任务快到期"
    body = f"### {heading}\n\n- 父任务：{parent_title}\n- 子任务：{title}\n- 到期：{due_text}"
    task_id = str(task.get("id") or parent_title)
    subtask_id = str(subtask.get("id") or title)
    return ReminderCandidate(
        event_key=f"{kind}:subtask:{task_id}:{subtask_id}:{due_at.strftime('%Y%m%dT%H%M')}",
        title=f"明心台提醒：{heading}",
        body=body,
        kind=kind,
        due_at=due_at.isoformat(),
        task_id=task_id,
        subtask_id=subtask_id,
    )


def parse_started_datetime(item: dict[str, Any]) -> datetime | None:
    value = item.get("startedAt") or item.get("started_at")
    if value:
        parsed = parse_due_datetime(value)
        if parsed:
            return parsed
    started_ts = item.get("startedAtTs")
    try:
        millis = int(float(started_ts))
    except (TypeError, ValueError):
        return None
    if millis <= 0:
        return None
    return datetime.fromtimestamp(millis / 1000, LOCAL_TZ)


def collect_active_focus_items(state: dict[str, Any]) -> list[dict[str, Any]]:
    focus = state.get("focus") if isinstance(state.get("focus"), dict) else {}
    items: list[dict[str, Any]] = []
    for item in focus.get("activeItems") or []:
        if isinstance(item, dict):
            items.append(item)
    active = focus.get("active")
    if isinstance(active, dict):
        items.append(active)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in items:
        item_id = str(item.get("id") or "")
        if item_id and item_id in seen:
            continue
        if item_id:
            seen.add(item_id)
        unique.append(item)
    return unique


def build_focus_candidate(item: dict[str, Any], kind: str, target_at: datetime, elapsed_minutes: int) -> ReminderCandidate:
    title = str(item.get("title") or "未命名专注")
    focus_id = str(item.get("id") or title)
    task_id = str(item.get("taskId") or "")
    subtask_id = str(item.get("subtaskId") or "")
    heading = "专注预计结束" if kind == "focus_due" else "专注即将到点"
    body = (
        f"### {heading}\n\n"
        f"- 专注：{title}\n"
        f"- 已进行：{elapsed_minutes} 分钟\n"
        f"- 目标时间：{format_due(target_at)}"
    )
    return ReminderCandidate(
        event_key=f"{kind}:focus:{focus_id}:{target_at.strftime('%Y%m%dT%H%M')}",
        title=f"明心台提醒：{heading}",
        body=body,
        kind=kind,
        due_at=target_at.isoformat(),
        task_id=task_id,
        subtask_id=subtask_id,
    )


def collect_focus_reminders(state: dict[str, Any], now: datetime) -> list[ReminderCandidate]:
    settings = state.get("notificationSettings") if isinstance(state.get("notificationSettings"), dict) else {}
    if not parse_bool(settings.get("enabled"), True):
        return []
    lead_minutes = parse_lead_minutes(settings.get("focusLeadMinutes"), 5)
    candidates: list[ReminderCandidate] = []
    for item in collect_active_focus_items(state):
        expected_minutes = parse_lead_minutes(item.get("expectedMinutes"), 0)
        if expected_minutes <= 0:
            continue
        started_at = parse_started_datetime(item)
        if not started_at:
            continue
        due_at = started_at + timedelta(minutes=expected_minutes)
        elapsed = max(0, int((now - started_at).total_seconds() // 60))
        if now >= due_at:
            candidates.append(build_focus_candidate(item, "focus_due", due_at, elapsed))
            continue
        if lead_minutes > 0 and now >= due_at - timedelta(minutes=lead_minutes):
            candidates.append(build_focus_candidate(item, "focus_soon", due_at, elapsed))
    return candidates


def collect_due_reminders(state: dict[str, Any], soon_hours: int = 24, now: datetime | None = None) -> list[ReminderCandidate]:
    current = now or local_now()
    global_rule = global_notification_rule(state)
    candidates: list[ReminderCandidate] = []
    for task in state.get("tasks") or []:
        if not isinstance(task, dict) or task_is_done(task) or task_is_memo(task):
            continue
        task_rule = apply_notification_override(global_rule, task.get("notification"), default_mode="default")
        task_due = parse_due_datetime(task.get("dueDate") or task.get("deadline"))
        if task_due:
            kind = classify_due(current, task_due, soon_hours, task_rule)
            if kind:
                candidates.append(build_task_candidate(task, kind, task_due))
        for subtask in task.get("subtasks") or []:
            if not isinstance(subtask, dict) or subtask_is_done(subtask):
                continue
            subtask_rule = apply_notification_override(task_rule, subtask.get("notification"), default_mode="inherit")
            subtask_due = parse_due_datetime(subtask.get("dueDate") or subtask.get("deadline"))
            if not subtask_due:
                continue
            kind = classify_due(current, subtask_due, soon_hours, subtask_rule)
            if kind:
                candidates.append(build_subtask_candidate(task, subtask, kind, subtask_due))
    candidates.extend(collect_focus_reminders(state, current))
    return candidates
