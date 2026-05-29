import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultProjects, defaultReflection, tabs, themes, todayItems } from "./data.js";
import { renderMarkdown } from "./utils/markdown.js";

const defaultTimelineBlocks = [];
const notificationSettingsStorageKey = "mingxintai:notification-settings:v1";
const defaultNotificationSettings = {
  enabled: true,
  apiBase: defaultApiBase(),
  apiToken: "",
  wxpusherSpt: "",
  taskLeadMinutes: 30,
  taskAtDue: true,
  taskOverdue: true,
  focusLeadMinutes: 5,
  focusGraceMinutes: 60
};
const defaultHealthHabits = [
  { id: "sleep", icon: "🌙", title: "早睡", mode: "single", unit: "", defaultValue: "", placeholder: "例如 00:30 入睡" },
  { id: "wake", icon: "🌞", title: "早起", mode: "single", unit: "", defaultValue: "", placeholder: "例如 07:10 醒来" },
  { id: "exercise", icon: "🏃", title: "运动", mode: "multi", unit: "", defaultValue: "散步", placeholder: "例如 散步 / 健身" },
  { id: "food", icon: "🍽️", title: "饮食", mode: "multi", unit: "", defaultValue: "正餐", placeholder: "例如 早餐 / 牛奶" },
  { id: "water", icon: "💧", title: "饮水", mode: "multi", unit: "ml", defaultValue: "250", placeholder: "例如 250" },
  { id: "height", icon: "📏", title: "身高", mode: "single", unit: "cm", defaultValue: "", placeholder: "例如 172" },
  { id: "weight", icon: "⚖️", title: "体重", mode: "single", unit: "kg", defaultValue: "", placeholder: "例如 62.5" }
];

function Topbar({ kicker, title, right }) {
  return (
    <header className="topbar">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
      </div>
      {right}
    </header>
  );
}

function ThemeRail({ theme, onThemeChange }) {
  return (
    <div className="theme-rail" aria-label="配色选择">
      {themes.map((item) => (
        <button
          className={`theme-choice ${theme === item.key ? "active" : ""}`}
          key={item.key}
          type="button"
          onClick={() => onThemeChange(item.key)}
        >
          <span className="swatches" aria-hidden="true">
            {item.colors.map((color) => (
              <i key={color} style={{ background: color }} />
            ))}
          </span>
          {item.name}
        </button>
      ))}
    </div>
  );
}

function formatTimer(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function formatMinutes(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}min`;
}

function formatHumanDuration(seconds) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes === 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours && restMinutes) return `${hours}h ${restMinutes}m`;
  if (hours) return `${hours}h`;
  return `${restMinutes}m`;
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMinutesToTime(time, minutesToAdd) {
  const total = timeToMinutes(time) + minutesToAdd;
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function secondsBetweenClock(start, end) {
  if (!start || !end) return 0;
  let startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(0, (endMinutes - startMinutes) * 60);
}

function normalizeApiBase(value) {
  const text = String(value || "").trim();
  if (!text) return defaultApiBase();
  return text.replace(/\/+$/, "");
}

function normalizeMinuteValue(value, fallback, min = 0, max = 1440) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function defaultApiBase() {
  if (typeof window === "undefined") return "/api";
  const { hostname, port } = window.location;
  const isLocalDev = (hostname === "127.0.0.1" || hostname === "localhost") && /^517\d$/.test(port);
  return isLocalDev ? "http://127.0.0.1:8000/api" : "/api";
}

function normalizeNotificationSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    ...defaultNotificationSettings,
    ...source,
    enabled: Boolean(source.enabled ?? defaultNotificationSettings.enabled),
    apiBase: normalizeApiBase(source.apiBase ?? defaultNotificationSettings.apiBase),
    apiToken: String(source.apiToken || ""),
    wxpusherSpt: String(source.wxpusherSpt || ""),
    taskLeadMinutes: normalizeMinuteValue(source.taskLeadMinutes, defaultNotificationSettings.taskLeadMinutes),
    taskAtDue: Boolean(source.taskAtDue ?? defaultNotificationSettings.taskAtDue),
    taskOverdue: Boolean(source.taskOverdue ?? defaultNotificationSettings.taskOverdue),
    focusLeadMinutes: normalizeMinuteValue(source.focusLeadMinutes, defaultNotificationSettings.focusLeadMinutes),
    focusGraceMinutes: normalizeMinuteValue(source.focusGraceMinutes, defaultNotificationSettings.focusGraceMinutes, 0, 1440)
  };
}

function loadNotificationSettings() {
  if (typeof window === "undefined") return defaultNotificationSettings;
  try {
    const saved = window.localStorage.getItem(notificationSettingsStorageKey);
    return saved ? normalizeNotificationSettings(JSON.parse(saved)) : defaultNotificationSettings;
  } catch {
    return defaultNotificationSettings;
  }
}

function publicNotificationSettings(settings) {
  const normalized = normalizeNotificationSettings(settings);
  const publicSettings = { ...normalized };
  delete publicSettings.apiBase;
  delete publicSettings.apiToken;
  return {
    ...publicSettings,
    leadMinutes: normalized.taskLeadMinutes,
    atDue: normalized.taskAtDue,
    overdue: normalized.taskOverdue
  };
}

function mergeServerNotificationSettings(localSettings, serverSettings) {
  if (!serverSettings || typeof serverSettings !== "object") return normalizeNotificationSettings(localSettings);
  const { apiBase, apiToken } = normalizeNotificationSettings(localSettings);
  return normalizeNotificationSettings({
    ...serverSettings,
    taskLeadMinutes: serverSettings.taskLeadMinutes ?? serverSettings.leadMinutes,
    taskAtDue: serverSettings.taskAtDue ?? serverSettings.atDue,
    taskOverdue: serverSettings.taskOverdue ?? serverSettings.overdue,
    apiBase,
    apiToken
  });
}

function hasWorkspacePayload(state) {
  return Boolean(
    state
    && typeof state === "object"
    && (
      Array.isArray(state.tasks)
      || Array.isArray(state.projects)
      || Array.isArray(state.completedRecords)
      || Array.isArray(state.healthHabits)
      || state.reviewDaily
      || state.notificationSettings
    )
  );
}

function normalizeWorkspaceTask(task, projects = defaultProjects) {
  const tone = task.tone || task.lane || "today";
  const config = taskLaneConfig(tone);
  const subtasks = (Array.isArray(task.subtasks) ? task.subtasks : []).map((subtask) => ({
    ...subtask,
    done: Boolean(subtask.done || subtask.doneAt),
    meta: buildSubtaskMeta(subtask)
  }));
  const normalized = {
    ...task,
    tone: config.value,
    lane: config.value,
    status: task.status || (config.value === "memo" ? "memo" : "todo"),
    draggable: Boolean(config.draggable),
    action: config.action,
    subtasks
  };
  return {
    ...normalized,
    meta: buildTaskMeta(normalized, projects, Array.isArray(task.meta) ? task.meta : [])
  };
}

function normalizeWorkspaceProject(project) {
  return {
    ...project,
    archived: Boolean(project.archived),
    archivedAt: project.archivedAt || ""
  };
}

function defaultHealthState() {
  return defaultHealthHabits.map((habit) => ({ ...habit, records: [] }));
}

function workspaceTodayKey() {
  return formatDateValue(new Date());
}

function inferDateFromId(id) {
  const match = String(id || "").match(/(\d{12,})$/);
  if (!match) return "";
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return "";
  return formatDateValue(new Date(timestamp));
}

function entityDate(entity, fallbackDate = "") {
  return entity?.date || entity?.createdDate || inferDateFromId(entity?.id) || fallbackDate;
}

function restoreTimestamp(value, fallback = Date.now()) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function workspaceStateFromApp({
  items,
  projects,
  timelineBlocks,
  completedRecords,
  reflection,
  healthHabits,
  notificationSettings,
  activeFocus,
  activeRest,
  theme
}) {
  const todayKey = workspaceTodayKey();
  const focusActive = activeFocus
    ? {
        ...activeFocus,
        taskId: activeFocus.itemId,
        startedAtTs: activeFocus.startedAt,
        startedAt: new Date(activeFocus.startedAt).toISOString(),
        start: activeFocus.sessionStartedClock || activeFocus.startedClock,
        date: todayKey
      }
    : null;
  return {
    version: 2,
    theme,
    tasks: items.map((item) => ({
      ...item,
      lane: item.tone
    })),
    projects,
    timeBlocks: {
      [todayKey]: timelineBlocks
    },
    completedRecords,
    focus: {
      active: focusActive,
      activeItems: focusActive ? [focusActive] : [],
      sessions: completedRecords
        .filter((record) => record.durationSeconds > 0)
        .map((record) => ({
          id: record.id,
          title: record.title,
          taskId: record.itemId,
          subtaskId: record.subtaskId || "",
          date: entityDate(record, todayKey),
          start: record.startedClock,
          end: record.endedClock,
          minutes: Math.max(1, Math.round(record.durationSeconds / 60))
        }))
    },
    rest: {
      active: activeRest
    },
    reviewDaily: {
      entries: {
        [todayKey]: {
          reflection
        }
      }
    },
    healthHabits,
    notificationSettings: publicNotificationSettings(notificationSettings)
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatRecordTime(start, end) {
  if (!start) return "未记录时间";
  if (!end || start === end) return start;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const diff = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  const duration = hours && minutes ? `${hours}h${minutes}min` : hours ? `${hours}h` : `${minutes}min`;
  return `${start} - ${end} · ${duration}`;
}

function formatHealthValue(record, habit) {
  if (!record?.value) return "";
  return habit.unit ? `${record.value} ${habit.unit}` : record.value;
}

function getElapsedSeconds(startedAt, tick) {
  return Math.max(0, Math.floor((tick - startedAt) / 1000));
}

function makeFocusBlock(focus, elapsedSeconds, { id, endedClock, live = false }) {
  const date = focus.date || workspaceTodayKey();
  return {
    id,
    date,
    start: focus.startedClock,
    title: live ? `正在专注：${focus.title}` : `${focus.title}（至 ${endedClock}）`,
    duration: formatMinutes(elapsedSeconds),
    durationSeconds: elapsedSeconds,
    type: "focus",
    live
  };
}

function makeRestBlock(rest, elapsedSeconds, { id, live = false }) {
  const date = rest.date || workspaceTodayKey();
  return {
    id,
    date,
    start: rest.startedClock,
    title: live ? "休息中" : "休息",
    duration: formatMinutes(elapsedSeconds),
    durationSeconds: elapsedSeconds,
    type: "rest",
    live
  };
}

function NowPanel({ focus, elapsedSeconds, notificationSettings, onEndFocus, onOpenRest }) {
  if (!focus) {
    return (
      <section className="now-panel idle">
        <div className="now-title">
          <strong>当前没有专注</strong>
          <span className="timer">00:00</span>
        </div>
        <p className="now-meta">从今日执行或子任务开始，时间会进入今天的记录。</p>
      </section>
    );
  }

  const expectedSeconds = focus.expectedMinutes ? focus.expectedMinutes * 60 : null;
  const notifyMinutes = normalizeMinuteValue(focus.notifyBeforeMinutes, notificationSettings.focusLeadMinutes);
  const graceMinutes = normalizeMinuteValue(notificationSettings.focusGraceMinutes, 60);
  const notifyText = notifyMinutes ? `结束前 ${notifyMinutes} 分钟提醒` : "不提醒";
  const isOverExpected = expectedSeconds ? elapsedSeconds > expectedSeconds : false;
  const isLongOvertime = expectedSeconds ? elapsedSeconds > expectedSeconds + graceMinutes * 60 : false;

  return (
    <section className={`now-panel ${isOverExpected ? "overtime" : ""}`}>
      <div className="now-title">
        <strong>正在专注：{focus.title}</strong>
        <span className="timer">{formatTimer(elapsedSeconds)}</span>
      </div>
      <p className="now-meta">
        {focus.parentTitle ? `归属：${focus.parentTitle} · ` : ""}
        {focus.expectedMinutes ? `预计 ${focus.expectedMinutes} 分钟 · ${notifyText}` : "未设置预计时长"}
      </p>
      {isLongOvertime && (
        <p className="focus-warning">已超过兜底时间，系统会暂停计时并要求校正真实结束时间。</p>
      )}
      <div className="now-actions">
        <button className="solid-btn" type="button" onClick={onEndFocus}>结束专注</button>
        <button className="ghost-btn" type="button" onClick={onOpenRest}>一键休息</button>
      </div>
    </section>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <span>{hint}</span>
      </div>
      {children}
    </section>
  );
}

const sectionMeta = {
  memo: { title: "备忘", hint: "轻提醒，不压迫" },
  today: { title: "今日执行", hint: "可拖拽排序" },
  future: { title: "未来提醒", hint: "只露出最近" },
  idea: { title: "想法池", hint: "无期限，先收起来" },
  overdue: { title: "逾期", hint: "需要重新安排" },
  done: { title: "已完成", hint: "默认轻展示" }
};

const taskLaneOptions = [
  { value: "memo", label: "备忘", action: "完成", fallback: "轻提醒" },
  { value: "today", label: "今日执行", action: "专注", fallback: "今日推进", draggable: true },
  { value: "future", label: "未来待办", action: "排入", fallback: "未来待办" },
  { value: "idea", label: "想法池", action: "看看", fallback: "无期限" },
  { value: "overdue", label: "逾期", action: "重排", fallback: "已逾期" },
  { value: "done", label: "已完成", action: "完成", fallback: "已完成" }
];

const taskStatusOptions = [
  { value: "todo", label: "未开始" },
  { value: "planned", label: "已计划" },
  { value: "active", label: "进行中" },
  { value: "paused", label: "暂停" },
  { value: "done", label: "已完成" },
  { value: "memo", label: "备忘" },
  { value: "overdue", label: "逾期" }
];

const taskQuadrantOptions = [
  { value: "q1", label: "重要紧急" },
  { value: "q2", label: "重要不紧急" },
  { value: "q3", label: "不重要紧急" },
  { value: "q4", label: "不重要不紧急" }
];

function optionLabel(options, value, fallback = "") {
  return options.find((option) => option.value === value)?.label || fallback || value;
}

function taskLaneConfig(value) {
  return taskLaneOptions.find((option) => option.value === value) || taskLaneOptions[1];
}

function subtaskSummary(subtasks = []) {
  if (!subtasks.length) return null;
  const doneCount = subtasks.filter((subtask) => subtask.done).length;
  return `子任务 ${doneCount}/${subtasks.length}`;
}

function withSubtaskSummary(meta = [], subtasks = []) {
  const summary = subtaskSummary(subtasks);
  const cleanedMeta = meta.filter((item) => !/^子任务\s+\d+\/\d+$/.test(item) && !/^\d+\/\d+\s+子任务$/.test(item));
  return summary ? [...cleanedMeta, summary] : cleanedMeta;
}

function buildTaskMeta(task, projects, previousMeta = []) {
  const project = projects.find((item) => item.id === task.projectId);
  const generatedLabels = new Set([
    "未关联项目",
    ...projects.map((item) => item.title),
    ...taskStatusOptions.map((option) => option.label),
    ...taskQuadrantOptions.map((option) => option.label),
    ...taskLaneOptions.map((option) => option.fallback)
  ]);
  const generatedPatterns = [
    /^计划\s+/,
    /^到期\s+/,
    /^\d{2}:\d{2}(\s+-\s+\d{2}:\d{2})?$/,
    /^预计\s+\d+min$/,
    /^子任务\s+\d+\/\d+$/
  ];
  const preservedMeta = previousMeta.filter((meta) => (
    !generatedLabels.has(meta) && !generatedPatterns.some((pattern) => pattern.test(meta))
  ));
  const schedule = taskScheduleDetails(task);
  const fallback = schedule.length ? [] : [taskLaneConfig(task.tone).fallback];

  return [...new Set([
    project?.title || "未关联项目",
    optionLabel(taskStatusOptions, task.status, "未开始"),
    task.quadrant ? optionLabel(taskQuadrantOptions, task.quadrant, "") : null,
    ...schedule,
    ...fallback,
    ...preservedMeta,
    subtaskSummary(task.subtasks)
  ].filter(Boolean))];
}

function buildSubtaskMeta(subtask) {
  return [
    subtask.done ? "已完成" : "未完成",
    subtask.startDate ? `开始 ${subtask.startDate}` : null,
    subtask.dueDate ? `到期 ${subtask.dueDate}` : null,
    "可单独专注"
  ].filter(Boolean);
}

function taskScheduleDetails(task) {
  return [
    task.planDate ? `计划 ${task.planDate}` : null,
    task.dueDate ? `到期 ${task.dueDate}` : null,
    task.startTime && task.endTime ? `${task.startTime} - ${task.endTime}` : task.startTime,
    task.estimateMinutes ? `预计 ${task.estimateMinutes}min` : null
  ].filter(Boolean);
}

function taskListDetails(task) {
  const visibleMeta = (task.meta || []).filter((meta) => !/^子任务\s+\d+\/\d+$/.test(meta));
  return [...new Set([
    taskLaneConfig(task.tone).label,
    optionLabel(taskStatusOptions, task.status, ""),
    ...taskScheduleDetails(task),
    ...visibleMeta,
    subtaskSummary(task.subtasks)
  ].filter(Boolean))];
}

function buildWeekDays() {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date,
      dateText: formatDateValue(date),
      label: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index],
      isToday: formatDateValue(date) === formatDateValue(today)
    };
  });
}

function taskBelongsToDate(task, dateText, isToday) {
  if (task.tone === "memo" || !task.startTime) return false;
  if (task.planDate === dateText || task.dueDate === dateText) return true;
  return isToday && ["today", "done"].includes(task.tone) && !task.planDate && !task.dueDate;
}

function eventDurationMinutes(start, end) {
  if (!start || !end) return 45;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  return Math.max(1, (endMinutes - startMinutes + 24 * 60) % (24 * 60));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildWeekEvents(items, completedRecords, timelineBlocks, weekBlocks, weekDays) {
  const weekDateSet = new Set(weekDays.map((day) => day.dateText));
  const completedTaskIds = new Set(completedRecords.map((record) => record.itemId));
  const taskEvents = weekDays.flatMap((day) => (
    items
      .filter((item) => taskBelongsToDate(item, day.dateText, day.isToday))
      .map((task, index) => {
        const fallbackHour = 9 + (index % 8);
        const start = task.startTime || `${String(fallbackHour).padStart(2, "0")}:00`;
        const end = task.endTime || addMinutesToTime(start, task.estimateMinutes || 45);
        return {
          id: `task-week-${task.id}-${day.dateText}`,
          sourceId: task.id,
          date: day.dateText,
          title: task.title,
          start,
          end,
          tone: task.tone,
          completed: completedTaskIds.has(task.id) || task.status === "done",
          meta: taskListDetails(task).slice(0, 3).join(" · ")
        };
      })
  ));
  const recordEvents = completedRecords
    .filter((record) => record.durationSeconds > 0)
    .map((record) => {
      const date = entityDate(record);
      if (!weekDateSet.has(date)) return null;
      return {
        id: `record-week-${record.id}`,
        date,
        title: record.parentTitle ? `${record.parentTitle} / ${record.title}` : record.title,
        start: record.startedClock,
        end: record.endedClock,
        tone: "done",
        completed: true,
        meta: formatHumanDuration(record.durationSeconds)
      };
    })
    .filter(Boolean);
  const timelineEvents = timelineBlocks
    .filter((block) => block.start && block.durationSeconds)
    .map((block) => {
      const date = entityDate(block);
      if (!weekDateSet.has(date)) return null;
      return {
        id: `timeline-week-${block.id}`,
        date,
        title: block.title,
        start: block.start,
        end: addMinutesToTime(block.start, Math.max(1, Math.round((block.durationSeconds || 0) / 60))),
        tone: block.type === "rest" ? "memo" : "today",
        completed: false,
        meta: block.duration
      };
    })
    .filter(Boolean);

  const baseEvents = [...taskEvents, ...recordEvents, ...timelineEvents];
  const overrideMap = new Map(weekBlocks.map((block) => [block.id, block]));
  const replacedEvents = baseEvents.map((event) => overrideMap.get(event.id) || event);
  const appendedBlocks = weekBlocks.filter((block) => !baseEvents.some((event) => event.id === block.id));

  return [...replacedEvents, ...appendedBlocks];
}

function weekBlockStyle(event) {
  const startMinutes = clampNumber(timeToMinutes(event.start), 6 * 60, 24 * 60);
  const rawEndMinutes = event.end === "00:00" ? 24 * 60 : timeToMinutes(event.end || addMinutesToTime(event.start, 45));
  const endMinutes = clampNumber(rawEndMinutes <= startMinutes ? startMinutes + eventDurationMinutes(event.start, event.end) : rawEndMinutes, startMinutes + 1, 24 * 60);
  const totalMinutes = 18 * 60;
  return {
    top: `${((startMinutes - 6 * 60) / totalMinutes) * 100}%`,
    height: `${Math.max(4, ((endMinutes - startMinutes) / totalMinutes) * 100)}%`
  };
}

function WeekBlockSheet({ block, weekDays, onClose, onSave }) {
  const todayText = formatDateValue(new Date());
  const [title, setTitle] = useState(block?.title || "");
  const [date, setDate] = useState(block?.date || todayText);
  const [start, setStart] = useState(block?.start || "20:00");
  const [end, setEnd] = useState(block?.end || "20:30");

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onSave({
      id: block?.id || `week-manual-${Date.now()}`,
      date,
      title: trimmedTitle,
      start,
      end,
      tone: block?.tone || "memo",
      meta: `${start} - ${end} · 手动补录`,
      manual: true
    });
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="补录时间块" onSubmit={handleSubmit}>
        <h3>{block ? "编辑时间块" : "补录时间块"}</h3>
        <div className="field">
          <label htmlFor="weekBlockTitle">补录标题</label>
          <input id="weekBlockTitle" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="weekBlockDate">补录日期</label>
          <select id="weekBlockDate" value={date} onChange={(event) => setDate(event.target.value)}>
            {weekDays.map((day) => (
              <option value={day.dateText} key={day.dateText}>
                {day.label} {day.dateText.slice(5)}{day.isToday ? " 今天" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="weekBlockStart">补录开始时间</label>
            <input id="weekBlockStart" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="weekBlockEnd">补录结束时间</label>
            <input id="weekBlockEnd" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">保存时间块</button>
        </div>
      </form>
    </div>
  );
}

function SubtaskList({ parent, onStartFocus, onToggleSubtask }) {
  if (!parent.subtasks?.length) return null;

  return (
    <div className="subtask-list" aria-label={`${parent.title} 子任务`}>
      {parent.subtasks.map((subtask) => (
        <article className={`subtask-row ${subtask.done ? "done" : ""}`} key={subtask.id} data-subtask-title={subtask.title}>
          <label className="check-line">
            <input
              type="checkbox"
              aria-label={`完成子任务 ${subtask.title}`}
              checked={Boolean(subtask.done)}
              onChange={() => onToggleSubtask(parent.id, subtask.id)}
            />
            <span>
              <strong>{subtask.title}</strong>
              <em>{subtask.meta.join(" · ")}</em>
            </span>
          </label>
          <button
            className="mini-action subtle"
            type="button"
            aria-label={`开始专注 ${subtask.title}`}
            onClick={() => onStartFocus({ item: parent, subtask })}
          >
            专注
          </button>
        </article>
      ))}
    </div>
  );
}

function TaskItem({
  item,
  index,
  listLength,
  onMove,
  onDragStart,
  onDrop,
  onStartFocus,
  onOpenTask,
  onCompleteTask,
  onToggleSubtask
}) {
  const canSort = item.tone === "today";
  const canFocus = item.tone === "today" && !["done", "memo", "overdue"].includes(item.status);
  const isDone = item.status === "done" || item.tone === "done";

  return (
    <article
      className={`item accent-${item.tone}`}
      draggable={canSort}
      data-task-title={item.title}
      onDragStart={(event) => canSort && onDragStart(event, item.id)}
      onDragOver={(event) => canSort && event.preventDefault()}
      onDrop={(event) => canSort && onDrop(event, item.id)}
    >
      <div className="stripe" />
      <div className="item-main">
        <p className="item-title">
          {item.draggable && <span className="handle">::</span>}
          {item.title}
        </p>
        <div className="item-meta">
          {item.meta.map((meta, index) => (
            <span className={index === 0 ? "tag" : ""} key={meta}>{meta}</span>
          ))}
        </div>
        <SubtaskList parent={item} onStartFocus={onStartFocus} onToggleSubtask={onToggleSubtask} />
      </div>
      <div className="item-controls">
        <label className={`complete-toggle ${isDone ? "done" : ""}`} title={isDone ? "已完成" : "标记完成"}>
          <input
            type="checkbox"
            aria-label={`完成任务 ${item.title}`}
            checked={isDone}
            disabled={isDone}
            onChange={() => onCompleteTask(item.id)}
          />
          <span>{isDone ? "已完成" : "完成"}</span>
        </label>
        {canSort && (
          <div className="sort-actions" aria-label={`${item.title} 排序`}>
            <button
              type="button"
              aria-label={`上移 ${item.title}`}
              disabled={index === 0}
              onClick={() => onMove(item.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`下移 ${item.title}`}
              disabled={index === listLength - 1}
              onClick={() => onMove(item.id, 1)}
            >
              ↓
            </button>
          </div>
        )}
        <button
          className="mini-action subtle"
          type="button"
          aria-label={`管理任务 ${item.title}`}
          onClick={() => onOpenTask(item.id)}
        >
          管理
        </button>
        {canFocus && (
          <button
            className="mini-action"
            type="button"
            aria-label={`开始专注 ${item.title}`}
            onClick={() => onStartFocus({ item })}
          >
            专注
          </button>
        )}
      </div>
    </article>
  );
}

function TaskSection({ tone, items, onMove, onDragStart, onDrop, onStartFocus, onOpenTask, onCompleteTask, onToggleSubtask }) {
  if (!items.length) return null;
  const meta = sectionMeta[tone];

  return (
    <Section title={meta.title} hint={meta.hint}>
      <div className="list" data-section={tone}>
        {items.map((item, index) => (
          <TaskItem
            item={item}
            index={index}
            listLength={items.length}
            key={item.id}
            onMove={onMove}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onStartFocus={onStartFocus}
            onOpenTask={onOpenTask}
            onCompleteTask={onCompleteTask}
            onToggleSubtask={onToggleSubtask}
          />
        ))}
      </div>
    </Section>
  );
}

function Timeline({ blocks, emptyText = "今天还没有时间记录。" }) {
  if (!blocks.length) {
    return (
      <div className="timeline">
        <p className="empty-note">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {blocks.map((block) => (
        <div className="time-row" key={block.id}>
          <span>{block.start}</span>
          <div className={`time-block ${block.type === "rest" ? "rest" : ""} ${block.live ? "live" : ""}`}>
            {block.title} · {block.duration}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryList({ items, emptyText }) {
  if (!items.length) {
    return <p className="empty-note">{emptyText}</p>;
  }

  return (
    <div className="summary-list">
      {items.map((item) => (
        <article className="summary-row" key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </article>
      ))}
    </div>
  );
}

function TodayView({
  theme,
  onThemeChange,
  items,
  timelineBlocks,
  focus,
  focusElapsedSeconds,
  notificationSettings,
  onMoveTodayItem,
  onDragStart,
  onDrop,
  onStartFocus,
  onOpenTask,
  onToggleSubtask,
  onCompleteTask,
  onEndFocus,
  onOpenRest,
  syncStatus
}) {
  const groups = {
    memo: items.filter((item) => item.tone === "memo"),
    today: items.filter((item) => item.tone === "today"),
    future: items.filter((item) => item.tone === "future"),
    idea: items.filter((item) => item.tone === "idea"),
    overdue: items.filter((item) => item.tone === "overdue"),
    done: items.filter((item) => item.tone === "done")
  };

  return (
    <>
      <Topbar
        kicker="2026-05-28 · 周四"
        title="今天先安顿下来"
        right={<div className={`sync-pill sync-${syncStatus.tone}`}>{syncStatus.short}</div>}
      />
      <ThemeRail theme={theme} onThemeChange={onThemeChange} />
      <NowPanel
        focus={focus}
        elapsedSeconds={focusElapsedSeconds}
        notificationSettings={notificationSettings}
        onEndFocus={onEndFocus}
        onOpenRest={onOpenRest}
      />
      <TaskSection tone="memo" items={groups.memo} onStartFocus={onStartFocus} onOpenTask={onOpenTask} onCompleteTask={onCompleteTask} onToggleSubtask={onToggleSubtask} />
      <TaskSection
        tone="today"
        items={groups.today}
        onMove={onMoveTodayItem}
        onDragStart={onDragStart}
        onDrop={onDrop}
        onStartFocus={onStartFocus}
        onOpenTask={onOpenTask}
        onCompleteTask={onCompleteTask}
        onToggleSubtask={onToggleSubtask}
      />
      <TaskSection tone="future" items={groups.future} onStartFocus={onStartFocus} onOpenTask={onOpenTask} onCompleteTask={onCompleteTask} onToggleSubtask={onToggleSubtask} />
      <TaskSection tone="idea" items={groups.idea} onStartFocus={onStartFocus} onOpenTask={onOpenTask} onCompleteTask={onCompleteTask} onToggleSubtask={onToggleSubtask} />
      <TaskSection tone="overdue" items={groups.overdue} onStartFocus={onStartFocus} onOpenTask={onOpenTask} onCompleteTask={onCompleteTask} onToggleSubtask={onToggleSubtask} />
      <TaskSection tone="done" items={groups.done} onStartFocus={onStartFocus} onOpenTask={onOpenTask} onCompleteTask={onCompleteTask} onToggleSubtask={onToggleSubtask} />
      <Section title="今日时间线" hint="回顾用，不抢主线">
        <Timeline blocks={timelineBlocks} />
      </Section>
    </>
  );
}

function WeekView({ items, completedRecords, timelineBlocks }) {
  const weekDays = useMemo(() => buildWeekDays(), []);
  const weekDateSet = useMemo(() => new Set(weekDays.map((day) => day.dateText)), [weekDays]);
  const timelineRef = useRef(null);
  const [weekBlocks, setWeekBlocks] = useState([]);
  const [editingBlock, setEditingBlock] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const weekEvents = useMemo(
    () => buildWeekEvents(items, completedRecords, timelineBlocks, weekBlocks, weekDays),
    [items, completedRecords, timelineBlocks, weekBlocks, weekDays]
  );
  const weeklyCompletedRecords = useMemo(
    () => completedRecords.filter((record) => weekDateSet.has(entityDate(record))),
    [completedRecords, weekDateSet]
  );

  useEffect(() => {
    const shell = timelineRef.current;
    const todayColumn = shell?.querySelector("[data-week-today='true']");
    if (!shell || !todayColumn) return;
    const targetLeft = todayColumn.offsetLeft - (shell.clientWidth - todayColumn.clientWidth) / 2;
    shell.scrollLeft = Math.max(0, targetLeft);
  }, []);

  function saveWeekBlock(block) {
    setWeekBlocks((blocks) => {
      const exists = blocks.some((item) => item.id === block.id);
      return exists ? blocks.map((item) => (item.id === block.id ? block : item)) : [...blocks, block];
    });
    setEditingBlock(null);
    setSheetOpen(false);
  }

  function openBlockEditor(block) {
    setEditingBlock(block);
    setSheetOpen(true);
  }

  return (
    <>
      <Topbar
        kicker="本周时间轴"
        title="流光周历"
        right={<button className="top-action" type="button" onClick={() => { setEditingBlock(null); setSheetOpen(true); }}>补录时间块</button>}
      />
      <Section title="这一周怎么过" hint={`本周完成 ${weeklyCompletedRecords.length} 项`}>
        <div className="week-timeline-shell" ref={timelineRef}>
          <div className="week-timeline-head">
            <span />
            {weekDays.map((day) => (
              <strong key={day.dateText}>
                {day.label}
                <small>{day.dateText.slice(5)}{day.isToday ? " · 今天" : ""}</small>
              </strong>
            ))}
          </div>
          <div className="week-timeline-body">
            <div className="week-time-axis">
              {["06:00", "12:00", "18:00", "24:00"].map((hour) => (
                <span className="week-hour-label" key={hour}>{hour}</span>
              ))}
            </div>
            {weekDays.map((day) => {
              const dayEvents = weekEvents.filter((event) => event.date === day.dateText);
              return (
                <article
                  className={`week-day-col ${day.isToday ? "today" : ""}`}
                  data-week-day-col={day.dateText}
                  data-week-day={day.dateText}
                  data-week-today={day.isToday ? "true" : undefined}
                  key={day.dateText}
                >
                  {day.isToday && <span className="week-day-marker">今天</span>}
                  {dayEvents.map((event) => (
                    <div
                      className={`week-block accent-${event.tone || "today"} ${event.completed ? "done" : ""}`}
                      data-week-block={event.id}
                      key={event.id}
                      style={weekBlockStyle(event)}
                      role="button"
                      tabIndex={0}
                      aria-label={`编辑时间块 ${event.title}`}
                      onClick={() => openBlockEditor(event)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          openBlockEditor(event);
                        }
                      }}
                    >
                      <b>{event.completed ? "✓ " : ""}{event.title}</b>
                      <span>{event.start} - {event.end}</span>
                      {event.meta && <em>{event.meta}</em>}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </div>
      </Section>
      <Section title="本周完成" hint="来自专注结束或手动勾选">
        <SummaryList
          items={weeklyCompletedRecords.map((record) => ({
            id: record.id,
            title: record.parentTitle ? `${record.parentTitle} / ${record.title}` : record.title,
            detail: `${record.startedClock} - ${record.endedClock} · ${formatHumanDuration(record.durationSeconds)}`
          }))}
          emptyText="本周还没有完成记录。"
        />
      </Section>
      {sheetOpen && (
        <WeekBlockSheet
          key={editingBlock?.id || "new-week-block"}
          block={editingBlock}
          weekDays={weekDays}
          onClose={() => { setSheetOpen(false); setEditingBlock(null); }}
          onSave={saveWeekBlock}
        />
      )}
    </>
  );
}

function ProjectTaskList({ tasks, onOpenTask }) {
  if (!tasks.length) return <p className="empty-note">暂时没有归属任务。</p>;

  return (
    <div className="project-task-list">
      {tasks.map((task) => (
        <article className={`project-task accent-${task.tone}`} key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <span>{taskListDetails(task).join(" · ")}</span>
            {!!task.subtasks?.length && (
              <small>{task.subtasks.map((subtask) => `${subtask.done ? "✓ " : ""}${subtask.title}`).slice(0, 3).join(" / ")}</small>
            )}
          </div>
          <button className="mini-action subtle" type="button" onClick={() => onOpenTask(task.id)}>
            管理
          </button>
        </article>
      ))}
    </div>
  );
}

function TaskBoard({ tasks, onOpenTask }) {
  const groupedOptions = taskLaneOptions.filter((option) => tasks.some((task) => task.tone === option.value));

  return (
    <div className="task-board" data-task-board="all">
      {groupedOptions.map((option) => (
        <section className={`task-board-section accent-${option.value}`} data-task-board-section={option.value} key={option.value}>
          <h3>{option.label}</h3>
          <ProjectTaskList tasks={tasks.filter((task) => task.tone === option.value)} onOpenTask={onOpenTask} />
        </section>
      ))}
    </div>
  );
}

function ProjectsView({ projects, items, onCreateProject, onArchiveProject, onRestoreProject, onOpenTask }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const visibleTasks = items.filter((item) => item.tone !== "done");
  const activeProjects = projects.filter((project) => !project.archived);
  const archivedProjects = projects.filter((project) => project.archived);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreateProject({
      title: trimmedTitle,
      note: note.trim() || "先把项目收进来，后续再拆任务。"
    });
    setTitle("");
    setNote("");
    setAdding(false);
  }

  return (
    <>
      <Topbar
        kicker="长期目标"
        title="项目不抢今天"
        right={<button className="top-action" type="button" onClick={() => setAdding((value) => !value)}>新增项目</button>}
      />
      {adding && (
        <form className="project-form" aria-label="新增项目" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="projectTitle">项目名称</label>
            <input id="projectTitle" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="projectNote">项目备注</label>
            <textarea id="projectNote" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="sheet-actions compact">
            <button className="cancel" type="button" onClick={() => setAdding(false)}>取消</button>
            <button className="save" type="submit">保存项目</button>
          </div>
        </form>
      )}
      <Section title="项目任务" hint="按项目收拢">
        {activeProjects.map((project) => (
          <article className="project-card" key={project.id} data-project-tasks={project.id}>
            <div className="project-card-head">
              <h3>{project.title}</h3>
              <button className="ghost-button" type="button" onClick={() => onArchiveProject(project.id)}>归档</button>
            </div>
            <p>{project.note}</p>
            <ProjectTaskList tasks={items.filter((item) => item.projectId === project.id)} onOpenTask={onOpenTask} />
          </article>
        ))}
        {!activeProjects.length && <p className="empty-note">活跃项目都已收起，需要时可从已归档项目恢复。</p>}
      </Section>
      {archivedProjects.length > 0 && (
        <Section title="已归档项目" hint="收起长期上下文，不删除任务">
          {archivedProjects.map((project) => (
            <article className="project-card archived" key={project.id} data-archived-project={project.id}>
              <div className="project-card-head">
                <h3>{project.title}</h3>
                <button className="ghost-button" type="button" onClick={() => onRestoreProject(project.id)}>恢复</button>
              </div>
              <p>{project.note}</p>
            </article>
          ))}
        </Section>
      )}
      <Section title="全部代办" hint="按分区轻管理">
        <TaskBoard tasks={visibleTasks} onOpenTask={onOpenTask} />
      </Section>
    </>
  );
}

function ReviewView({ items, timelineBlocks, completedRecords, reflection, onReflectionChange }) {
  const previewHtml = useMemo(() => renderMarkdown(reflection), [reflection]);
  const completedTaskIds = useMemo(
    () => new Set(completedRecords.filter((record) => !record.subtaskId).map((record) => record.itemId)),
    [completedRecords]
  );
  const completedItems = completedRecords.map((record) => ({
    id: record.id,
    title: record.parentTitle ? `${record.parentTitle} / ${record.title}` : record.title,
    detail: `${record.startedClock} - ${record.endedClock} · ${formatHumanDuration(record.durationSeconds)}`
  }));
  const unfinishedTasks = items
    .filter((item) => ["today", "future"].includes(item.tone) && !completedTaskIds.has(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.meta.join(" · ")
    }));
  const unfinishedMemos = items
    .filter((item) => item.tone === "memo")
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.meta.join(" · ")
    }));
  const focusSeconds = completedRecords.reduce((total, record) => total + record.durationSeconds, 0);
  const restSeconds = timelineBlocks
    .filter((block) => block.type === "rest")
    .reduce((total, block) => total + (block.durationSeconds || 0), 0);

  return (
    <>
      <Topbar kicker="日终回看" title="今天如何度过" />
      <div className="grid-two">
        <div className="metric"><b>{formatHumanDuration(focusSeconds)}</b><span>今日真实专注</span></div>
        <div className="metric"><b>{completedRecords.length} 项</b><span>完成记录</span></div>
        <div className="metric"><b>{formatHumanDuration(restSeconds)}</b><span>休息记录</span></div>
        <div className="metric"><b>{unfinishedTasks.length}</b><span>未完成任务</span></div>
      </div>
      <Section title="今日时间线" hint="系统记录">
        <Timeline blocks={timelineBlocks} />
      </Section>
      <Section title="自动摘要" hint="系统生成">
        <article className="review-card">
          <h3>已完成</h3>
          <SummaryList items={completedItems} emptyText="今天还没有结束过专注。" />
        </article>
        <article className="review-card">
          <h3>未完成任务</h3>
          <SummaryList items={unfinishedTasks} emptyText="今天任务已经清空。" />
        </article>
        <article className="review-card">
          <h3>未完成备忘</h3>
          <SummaryList items={unfinishedMemos} emptyText="没有待处理备忘。" />
        </article>
      </Section>
      <Section title="自由反思" hint="Markdown">
        <textarea
          className="markdown-box"
          value={reflection}
          onChange={(event) => onReflectionChange(event.target.value)}
        />
        <div className="markdown-preview" aria-live="polite" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Section>
    </>
  );
}

function HealthCard({ habit, onRecord }) {
  const records = habit.records || [];
  const latestRecord = records.at(-1);
  const actionLabel = habit.mode === "multi" ? `添加 ${habit.title}` : `记录 ${habit.title}`;

  return (
    <article className={`health-card health-${habit.mode}`} data-health-card={habit.id}>
      <div className="health-card-head">
        <h3><span aria-hidden="true">{habit.icon}</span>{habit.title}</h3>
        <button className="mini-action subtle" type="button" aria-label={actionLabel} onClick={() => onRecord(habit)}>
          {habit.mode === "multi" ? "添加" : latestRecord ? "修改" : "记录"}
        </button>
      </div>
      {records.length ? (
        <div className="record-list">
          {(habit.mode === "multi" ? records.slice(-3).reverse() : [latestRecord]).map((record) => {
            const value = formatHealthValue(record, habit);
            return (
              <div className="record-row" key={record.id}>
                <strong>{value || formatRecordTime(record.start, record.end)}</strong>
                <span>{value ? formatRecordTime(record.start, record.end) : record.note}</span>
                {record.note && value && <em>{record.note}</em>}
              </div>
            );
          })}
        </div>
      ) : (
        <p>{habit.mode === "multi" ? "0 条" : "未记录"}</p>
      )}
    </article>
  );
}

function HealthRecordSheet({ habit, onClose, onSave }) {
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("07:00");
  const [value, setValue] = useState(habit?.defaultValue || "");
  const [note, setNote] = useState("");

  if (!habit) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onSave(habit.id, {
      id: `health-record-${Date.now()}`,
      start,
      end,
      value: value.trim(),
      note: note.trim()
    });
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`记录${habit.title}`} onSubmit={handleSubmit}>
        <h3>{habit.mode === "multi" ? "添加" : "记录"}{habit.title}</h3>
        <p className="sheet-note">统一用开始时间和结束时间；两者相同就只显示一个时间。</p>
        <div className="field">
          <label htmlFor="healthValue">数值 / 内容</label>
          <input
            id="healthValue"
            value={value}
            placeholder={habit.placeholder}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="healthStart">开始时间</label>
            <input id="healthStart" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="healthEnd">结束时间</label>
            <input id="healthEnd" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="healthNote">备注</label>
          <input id="healthNote" value={note} placeholder="可不填" onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">保存记录</button>
        </div>
      </form>
    </div>
  );
}

function CustomHabitSheet({ open, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("single");
  const [unit, setUnit] = useState("");

  if (!open) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate({
      id: `custom-${Date.now()}`,
      icon: "✦",
      title: trimmedTitle,
      mode,
      unit: unit.trim(),
      defaultValue: "",
      placeholder: unit.trim() ? `填写${unit.trim()}` : "填写内容",
      records: []
    });
    setTitle("");
    setMode("single");
    setUnit("");
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="添加自定义习惯" onSubmit={handleSubmit}>
        <h3>添加自定义</h3>
        <div className="field">
          <label htmlFor="habitTitle">习惯名称</label>
          <input id="habitTitle" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="habitMode">记录方式</label>
          <select id="habitMode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="single">单项</option>
            <option value="multi">多项</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="habitUnit">单位</label>
          <input id="habitUnit" value={unit} placeholder="可不填，例如 min / ml" onChange={(event) => setUnit(event.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">保存习惯</button>
        </div>
      </form>
    </div>
  );
}

function HealthView({ healthHabits, onHealthHabitsChange }) {
  const [recordingHabit, setRecordingHabit] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const singleHabits = healthHabits.filter((habit) => habit.mode === "single");
  const multiHabits = healthHabits.filter((habit) => habit.mode === "multi");

  function saveHealthRecord(habitId, record) {
    onHealthHabitsChange((currentHabits) => currentHabits.map((habit) => {
      if (habit.id !== habitId) return habit;
      const records = habit.mode === "single" ? [record] : [...habit.records, record];
      return { ...habit, records };
    }));
    setRecordingHabit(null);
  }

  function createHabit(habit) {
    onHealthHabitsChange((currentHabits) => [...currentHabits, habit]);
    setCustomOpen(false);
  }

  return (
    <>
      <Topbar
        kicker="轻记录"
        title="养息不审判"
        right={<button className="top-action" type="button" onClick={() => setCustomOpen(true)}>添加自定义</button>}
      />
      <Section title="单项记录" hint="只看最新">
        <div className="health-grid">
          {singleHabits.map((habit) => <HealthCard habit={habit} key={habit.id} onRecord={setRecordingHabit} />)}
        </div>
      </Section>
      <Section title="多项记录" hint="可追加多条">
        <div className="health-grid">
          {multiHabits.map((habit) => <HealthCard habit={habit} key={habit.id} onRecord={setRecordingHabit} />)}
        </div>
      </Section>
      <HealthRecordSheet habit={recordingHabit} onClose={() => setRecordingHabit(null)} onSave={saveHealthRecord} />
      <CustomHabitSheet open={customOpen} onClose={() => setCustomOpen(false)} onCreate={createHabit} />
    </>
  );
}

function SettingsView({
  notificationSettings,
  onUpdateNotificationSettings,
  onSaveNotificationSettings,
  onTestNotification,
  notificationStatus,
  syncStatus
}) {
  function updateField(field, value) {
    onUpdateNotificationSettings({ [field]: value });
  }

  return (
    <>
      <Topbar kicker="低频配置" title="让后台安静工作" />
      <article className="project-card">
        <h3>后端状态</h3>
        <p>{syncStatus.text}</p>
      </article>
      <article className="project-card settings-card">
        <div className="settings-card-head">
          <div>
            <h3>WxPusher 通知</h3>
            <p>默认不内置推送密钥。填写自己的 SPT 后，任务和专注提醒才会推送到你的设备。</p>
          </div>
          <label className="switch-line" htmlFor="notificationEnabled">
            <input
              id="notificationEnabled"
              type="checkbox"
              checked={notificationSettings.enabled}
              onChange={(event) => updateField("enabled", event.target.checked)}
            />
            启用
          </label>
        </div>
        <div className="field">
          <label htmlFor="wxpusherSpt">WxPusher SPT</label>
          <input
            id="wxpusherSpt"
            type="password"
            autoComplete="off"
            placeholder="SPT_..."
            value={notificationSettings.wxpusherSpt}
            onChange={(event) => updateField("wxpusherSpt", event.target.value)}
          />
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="notificationApiBase">后端 API 地址</label>
            <input
              id="notificationApiBase"
              value={notificationSettings.apiBase}
              onChange={(event) => updateField("apiBase", event.target.value)}
              placeholder="/api"
            />
          </div>
          <div className="field">
            <label htmlFor="notificationApiToken">后端访问密钥</label>
            <input
              id="notificationApiToken"
              type="password"
              autoComplete="off"
              value={notificationSettings.apiToken}
              onChange={(event) => updateField("apiToken", event.target.value)}
              placeholder="后端要求时填写"
            />
          </div>
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="taskLeadMinutes">任务默认提前提醒</label>
            <input
              id="taskLeadMinutes"
              inputMode="decimal"
              value={notificationSettings.taskLeadMinutes}
              onChange={(event) => updateField("taskLeadMinutes", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="focusLeadMinutes">专注结束前提醒</label>
            <input
              id="focusLeadMinutes"
              inputMode="decimal"
              value={notificationSettings.focusLeadMinutes}
              onChange={(event) => updateField("focusLeadMinutes", event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="focusGraceMinutes">专注超时兜底分钟</label>
          <input
            id="focusGraceMinutes"
            inputMode="decimal"
            value={notificationSettings.focusGraceMinutes}
            onChange={(event) => updateField("focusGraceMinutes", event.target.value)}
          />
        </div>
        <div className="settings-toggles">
          <label className="toggle-line" htmlFor="taskAtDue">
            <input
              id="taskAtDue"
              type="checkbox"
              checked={notificationSettings.taskAtDue}
              onChange={(event) => updateField("taskAtDue", event.target.checked)}
            />
            到期准点提醒
          </label>
          <label className="toggle-line" htmlFor="taskOverdue">
            <input
              id="taskOverdue"
              type="checkbox"
              checked={notificationSettings.taskOverdue}
              onChange={(event) => updateField("taskOverdue", event.target.checked)}
            />
            逾期提醒
          </label>
        </div>
        <div className="settings-actions">
          <button className="ghost-btn" type="button" onClick={onSaveNotificationSettings}>保存配置</button>
          <button className="solid-btn" type="button" onClick={onTestNotification}>发送测试</button>
        </div>
        <p className="settings-help">本机开发默认地址为 http://127.0.0.1:8000/api；VPS 同域部署时可填 /api。后端地址和访问密钥只保存在当前设备，WxPusher 和提醒规则会进入后端状态。</p>
        <p className={`settings-status ${notificationStatus.tone}`}>{notificationStatus.text}</p>
      </article>
      <article className="project-card"><h3>App 化</h3><p>PWA 稳定后，再用 Capacitor 打包 Android。</p></article>
    </>
  );
}

function QuickAddSheet({ open, onClose, onCreate, projects, notificationSettings }) {
  const [title, setTitle] = useState("买衣服");
  const [projectId, setProjectId] = useState("");
  const [lane, setLane] = useState("memo");
  const [status, setStatus] = useState("todo");
  const [quadrant, setQuadrant] = useState("q2");
  const [planDate, setPlanDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyBefore, setNotifyBefore] = useState(String(notificationSettings.taskLeadMinutes ?? 30));

  if (!open) return null;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate({
      title: trimmedTitle,
      projectId,
      lane,
      status,
      quadrant,
      planDate,
      dueDate,
      startTime,
      endTime,
      estimateMinutes,
      notifyEnabled,
      notifyBefore,
      subtasks: subtaskText
        .split("\n")
        .map((subtask) => subtask.trim())
        .filter(Boolean)
    });
    setTitle("");
    setProjectId("");
    setLane("today");
    setStatus("todo");
    setQuadrant("q2");
    setPlanDate("");
    setDueDate("");
    setStartTime("");
    setEndTime("");
    setEstimateMinutes("");
    setSubtaskText("");
    setNotifyEnabled(true);
    setNotifyBefore(String(notificationSettings.taskLeadMinutes ?? 30));
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="快速添加" onSubmit={handleSubmit}>
        <h3>快速添加</h3>
        <div className="field">
          <label htmlFor="taskTitle">标题</label>
          <input id="taskTitle" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="taskProject">所属项目</label>
            <select id="taskProject" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">未关联项目</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>{project.title}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="taskLane">所在分区</label>
            <select id="taskLane" value={lane} onChange={(event) => setLane(event.target.value)}>
              {taskLaneOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="taskStatus">任务状态</label>
            <select id="taskStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
              {taskStatusOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="taskQuadrant">紧急程度</label>
            <select id="taskQuadrant" value={quadrant} onChange={(event) => setQuadrant(event.target.value)}>
              {taskQuadrantOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="taskPlanDate">计划日期</label>
            <input id="taskPlanDate" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="taskDueDate">到期日期</label>
            <input id="taskDueDate" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>
        <div className="grid-two compact-fields">
          <div className="field">
            <label htmlFor="taskStartTime">开始时间</label>
            <input
              id="taskStartTime"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="taskEndTime">结束时间</label>
            <input
              id="taskEndTime"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        </div>
        <div className="quick-times" aria-label="快捷开始时刻">
          {["09:00", "12:00", "18:00", "21:00"].map((value) => (
            <button type="button" key={value} onClick={() => setStartTime(value)}>{value}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="taskEstimate">预计分钟</label>
          <input
            id="taskEstimate"
            inputMode="numeric"
            value={estimateMinutes}
            onChange={(event) => setEstimateMinutes(event.target.value)}
            placeholder="例如 45"
          />
        </div>
        <div className="field">
          <label htmlFor="taskSubtasks">子任务</label>
          <textarea
            id="taskSubtasks"
            value={subtaskText}
            onChange={(event) => setSubtaskText(event.target.value)}
            placeholder="一行一个，例如：&#10;搭建提纲&#10;整理参考文献"
          />
        </div>
        <label className="toggle-line" htmlFor="notifyEnabled">
          <input
            id="notifyEnabled"
            type="checkbox"
            checked={notifyEnabled}
            onChange={(event) => setNotifyEnabled(event.target.checked)}
          />
          通知提醒
        </label>
        {notifyEnabled && (
          <div className="field">
            <label htmlFor="notifyBefore">提前提醒</label>
            <input
              id="notifyBefore"
              inputMode="decimal"
              value={notifyBefore}
              onChange={(event) => setNotifyBefore(event.target.value)}
              placeholder="例如 5 / 15 / 30"
            />
          </div>
        )}
        <p className="sheet-note">提醒会跟随任务保存；关闭通知时只记录任务，不触发 WxPusher。</p>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">加入任务</button>
        </div>
      </form>
    </div>
  );
}

function TaskDetailSheet({
  task,
  projects,
  project,
  onClose,
  onUpdateTask,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
  onToggleSubtask,
  onStartFocus
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState(() => task?.projectId || "");
  const [lane, setLane] = useState(() => task?.tone || "today");
  const [status, setStatus] = useState(() => task?.status || "todo");
  const [saved, setSaved] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  if (!task) return null;

  function handleTaskSubmit(event) {
    event.preventDefault();
    onUpdateTask(task.id, { projectId, tone: lane, status });
    setSaved(true);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onAddSubtask(task.id, { title: trimmedTitle, startDate, dueDate });
    setTitle("");
    setStartDate("");
    setDueDate("");
  }

  function openSubtaskEdit(subtask) {
    setEditingSubtaskId(subtask.id);
    setEditTitle(subtask.title || "");
    setEditStartDate(subtask.startDate || "");
    setEditDueDate(subtask.dueDate || "");
  }

  function handleSubtaskEdit(event) {
    event.preventDefault();
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle || !editingSubtaskId) return;
    onUpdateSubtask(task.id, editingSubtaskId, {
      title: trimmedTitle,
      startDate: editStartDate,
      dueDate: editDueDate
    });
    setEditingSubtaskId(null);
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="任务管理">
        <div className="sheet-title-row">
          <div>
            <h3>任务管理</h3>
            <p className="sheet-note">{task.title}</p>
          </div>
          <button className="icon-close" type="button" aria-label="关闭任务管理" onClick={onClose}>×</button>
        </div>
        <div className="detail-grid">
          <span>项目：{project?.title || "未关联项目"}</span>
          <span>分区：{taskLaneConfig(task.tone).label}</span>
          <span>状态：{optionLabel(taskStatusOptions, task.status, "未开始")}</span>
          <span>{subtaskSummary(task.subtasks) || "暂无子任务"}</span>
        </div>
        <form className="task-edit-form" onSubmit={handleTaskSubmit}>
          <div className="field">
            <label htmlFor="detailProject">所属项目</label>
            <select id="detailProject" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">未关联项目</option>
              {projects.map((item) => (
                <option value={item.id} key={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="grid-two compact-fields">
            <div className="field">
              <label htmlFor="detailLane">所在分区</label>
              <select id="detailLane" value={lane} onChange={(event) => setLane(event.target.value)}>
                {taskLaneOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="detailStatus">任务状态</label>
              <select id="detailStatus" value={status} onChange={(event) => setStatus(event.target.value)}>
                {taskStatusOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="sheet-actions compact">
            <button className="save" type="submit">保存任务</button>
            <span className="save-hint" aria-live="polite">{saved ? "已保存" : "保存后会同步分区和项目"}</span>
          </div>
        </form>
        <form className="subtask-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="detailSubtaskTitle">新增子任务</label>
            <input
              id="detailSubtaskTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如 联系导师确认材料"
            />
          </div>
          <div className="grid-two compact-fields">
            <div className="field">
              <label htmlFor="detailSubtaskStart">子任务开始日期</label>
              <input id="detailSubtaskStart" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="detailSubtaskDue">子任务到期日期</label>
              <input id="detailSubtaskDue" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>
          <button className="save wide" type="submit">添加子任务</button>
        </form>
        <div className="detail-subtasks">
          {(task.subtasks || []).map((subtask) => (
            <article className={`subtask-row ${subtask.done ? "done" : ""}`} key={subtask.id} data-subtask-title={subtask.title}>
              {editingSubtaskId === subtask.id ? (
                <form className="subtask-edit-form" onSubmit={handleSubtaskEdit}>
                  <div className="field">
                    <label htmlFor={`editSubtaskTitle-${subtask.id}`}>子任务名称</label>
                    <input
                      id={`editSubtaskTitle-${subtask.id}`}
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                    />
                  </div>
                  <div className="grid-two compact-fields">
                    <div className="field">
                      <label htmlFor={`editSubtaskStart-${subtask.id}`}>编辑子任务开始日期</label>
                      <input
                        id={`editSubtaskStart-${subtask.id}`}
                        type="date"
                        value={editStartDate}
                        onChange={(event) => setEditStartDate(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`editSubtaskDue-${subtask.id}`}>编辑子任务到期日期</label>
                      <input
                        id={`editSubtaskDue-${subtask.id}`}
                        type="date"
                        value={editDueDate}
                        onChange={(event) => setEditDueDate(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="sheet-actions compact">
                    <button className="cancel" type="button" onClick={() => setEditingSubtaskId(null)}>取消</button>
                    <button className="save" type="submit">保存子任务</button>
                  </div>
                </form>
              ) : (
                <>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      aria-label={`完成子任务 ${subtask.title}`}
                      checked={Boolean(subtask.done)}
                      onChange={() => onToggleSubtask(task.id, subtask.id)}
                    />
                    <span>
                      <strong>{subtask.title}</strong>
                      <em>{buildSubtaskMeta(subtask).join(" · ")}</em>
                    </span>
                  </label>
                  <div className="subtask-actions">
                    <button
                      className="mini-action subtle"
                      type="button"
                      aria-label={`编辑子任务 ${subtask.title}`}
                      onClick={() => openSubtaskEdit(subtask)}
                    >
                      编辑
                    </button>
                    <button
                      className="mini-action subtle danger"
                      type="button"
                      aria-label={`删除子任务 ${subtask.title}`}
                      onClick={() => onDeleteSubtask(task.id, subtask.id)}
                    >
                      删除
                    </button>
                    <button
                      className="mini-action subtle"
                      type="button"
                      aria-label={`开始专注 ${subtask.title}`}
                      onClick={() => {
                        onStartFocus({ item: task, subtask });
                        onClose();
                      }}
                    >
                      专注
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FocusStartSheet({ target, notificationSettings, onClose, onStart }) {
  const [expectedMinutes, setExpectedMinutes] = useState("45");
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(String(notificationSettings.focusLeadMinutes ?? 5));

  if (!target) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onStart({
      expectedMinutes: Number(expectedMinutes) || null,
      notifyBeforeMinutes: Number(notifyBeforeMinutes) || null
    });
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="开始专注设置" onSubmit={handleSubmit}>
        <h3>开始专注</h3>
        <p className="sheet-note">{target.subtask?.title || target.item.title}</p>
        <div className="field">
          <label htmlFor="expectedMinutes">预计时长（分钟，可留空）</label>
          <input
            id="expectedMinutes"
            inputMode="decimal"
            value={expectedMinutes}
            onChange={(event) => setExpectedMinutes(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="notifyBeforeMinutes">提前提醒（分钟，可留空）</label>
          <input
            id="notifyBeforeMinutes"
            inputMode="decimal"
            value={notifyBeforeMinutes}
            onChange={(event) => setNotifyBeforeMinutes(event.target.value)}
          />
        </div>
        <p className="sheet-note">
          超出预计后继续计时；超过兜底 {notificationSettings.focusGraceMinutes || 60} 分钟后会自动暂停，并要求确认真实结束时间。
        </p>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">开始</button>
        </div>
      </form>
    </div>
  );
}

function RestStartSheet({ open, onClose, onStart }) {
  const [plannedMinutes, setPlannedMinutes] = useState("15");

  if (!open) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onStart(Number(plannedMinutes) || 15);
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="一键休息设置" onSubmit={handleSubmit}>
        <h3>一键休息</h3>
        <p className="sheet-note">开始后会暂停当前专注，休息块会进入今日时间线。</p>
        <div className="field">
          <label htmlFor="plannedRestMinutes">预计休息（分钟）</label>
          <input
            id="plannedRestMinutes"
            inputMode="numeric"
            value={plannedMinutes}
            onChange={(event) => setPlannedMinutes(event.target.value)}
          />
        </div>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>取消</button>
          <button className="save" type="submit">开始休息</button>
        </div>
      </form>
    </div>
  );
}

function RestOverlay({ rest, elapsedSeconds, onEnd }) {
  if (!rest) return null;

  const plannedSeconds = rest.plannedMinutes * 60;
  const remainingSeconds = plannedSeconds - elapsedSeconds;
  const isOvertime = remainingSeconds < 0;
  const label = isOvertime ? `超时 ${formatTimer(Math.abs(remainingSeconds))}` : formatTimer(remainingSeconds);

  return (
    <div className="rest-overlay" role="dialog" aria-modal="true" aria-label="休息中">
      <div className={`rest-ring ${isOvertime ? "late" : ""}`}>
        <span>{isOvertime ? "已超时" : "休息中"}</span>
        <strong>{label}</strong>
        <p>预计 {rest.plannedMinutes} 分钟</p>
      </div>
      <button className="solid-btn" type="button" onClick={onEnd}>结束休息</button>
    </div>
  );
}

function ResumeFocusSheet({ focus, onResume, onSkip }) {
  if (!focus) return null;

  return (
    <div className="sheet-mask show">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="恢复专注">
        <h3>要恢复刚刚的专注吗？</h3>
        <p className="sheet-note">{focus.title}</p>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onSkip}>先不恢复</button>
          <button className="save" type="button" onClick={onResume}>恢复专注</button>
        </div>
      </div>
    </div>
  );
}

function EndFocusSheet({ focus, elapsedSeconds, onClose, onConfirm }) {
  const [actualEndTime, setActualEndTime] = useState(() => {
    if (focus?.suggestedEndTime) return focus.suggestedEndTime;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  if (!focus) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onConfirm(actualEndTime);
  }

  return (
    <div className="sheet-mask show" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="结束专注校正" onSubmit={handleSubmit}>
        <h3>{focus.autoClosed ? "确认真实结束时间" : "结束专注"}</h3>
        <p className="sheet-note">
          {focus.autoClosed
            ? "专注已超过兜底时间并自动暂停，请确认它真实结束在什么时候。"
            : "如果刚刚忘记关计时器，可以在这里校正真实结束时间。"}
        </p>
        <div className="field">
          <label htmlFor="actualEndTime">真实结束时间</label>
          <input
            id="actualEndTime"
            type="time"
            value={actualEndTime}
            onChange={(event) => setActualEndTime(event.target.value)}
          />
        </div>
        <p className="sheet-note">本次记录：{formatMinutes(elapsedSeconds)}</p>
        <div className="sheet-actions">
          <button className="cancel" type="button" onClick={onClose}>返回</button>
          <button className="save" type="submit">记录完成</button>
        </div>
      </form>
    </div>
  );
}

const viewMap = {
  today: TodayView,
  week: WeekView,
  projects: ProjectsView,
  review: ReviewView,
  health: HealthView,
  settings: SettingsView
};

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const [activeView, setActiveView] = useState(searchParams.get("view") || "today");
  const [theme, setTheme] = useState(searchParams.get("theme") || "ink");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [items, setItems] = useState(todayItems);
  const [projects, setProjects] = useState(defaultProjects);
  const [draggedId, setDraggedId] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);
  const [activeFocus, setActiveFocus] = useState(null);
  const [restPromptOpen, setRestPromptOpen] = useState(false);
  const [activeRest, setActiveRest] = useState(null);
  const [resumePrompt, setResumePrompt] = useState(null);
  const [endingFocus, setEndingFocus] = useState(null);
  const [timelineBlocks, setTimelineBlocks] = useState(defaultTimelineBlocks);
  const [completedRecords, setCompletedRecords] = useState([]);
  const [reflection, setReflection] = useState(defaultReflection);
  const [healthHabits, setHealthHabits] = useState(() => defaultHealthState());
  const [notificationSettings, setNotificationSettings] = useState(() => loadNotificationSettings());
  const [notificationStatus, setNotificationStatus] = useState({
    tone: "idle",
    text: "尚未测试通知；默认不会使用任何内置 SPT。"
  });
  const [syncStatus, setSyncStatus] = useState({
    tone: "idle",
    short: "本地",
    text: "正在使用本地临时状态；填写后端地址和访问密钥后会自动连接。"
  });
  const [tick, setTick] = useState(() => Date.now());
  const focusNoticeRef = useRef({});
  const syncReadyRef = useRef(false);
  const hydratingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const remoteUpdatedAtRef = useRef(null);
  const lastSavedPayloadRef = useRef("");
  const ActiveView = viewMap[activeView] || TodayView;

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const timerId = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const focusElapsedSeconds = activeFocus ? getElapsedSeconds(activeFocus.startedAt, tick) : 0;
  const focusTotalElapsedSeconds = activeFocus ? (activeFocus.accumulatedSeconds || 0) + focusElapsedSeconds : 0;
  const restElapsedSeconds = activeRest ? getElapsedSeconds(activeRest.startedAt, tick) : 0;
  const selectedTask = items.find((item) => item.id === selectedTaskId) || null;
  const selectedTaskProject = selectedTask ? projects.find((project) => project.id === selectedTask.projectId) : null;
  const hasModalOpen = Boolean(sheetOpen || selectedTask || focusTarget || restPromptOpen || resumePrompt || endingFocus);
  const visibleTimelineBlocks = useMemo(() => {
    const liveBlocks = [];
    if (activeFocus) {
      liveBlocks.push(makeFocusBlock(activeFocus, focusElapsedSeconds, {
        id: `live-${activeFocus.id}`,
        live: true
      }));
    }
    if (activeRest) {
      liveBlocks.push(makeRestBlock(activeRest, restElapsedSeconds, {
        id: `live-${activeRest.id}`,
        live: true
      }));
    }
    return [...timelineBlocks, ...liveBlocks];
  }, [activeFocus, activeRest, focusElapsedSeconds, restElapsedSeconds, timelineBlocks]);

  const buildCurrentWorkspaceState = useCallback(() => workspaceStateFromApp({
    items,
    projects,
    timelineBlocks,
    completedRecords,
    reflection,
    healthHabits,
    notificationSettings,
    activeFocus,
    activeRest,
    theme
  }), [activeFocus, activeRest, completedRecords, healthHabits, items, notificationSettings, projects, reflection, theme, timelineBlocks]);

  const backendRequest = useCallback(async (path, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (notificationSettings.apiToken.trim()) {
      headers["X-Mingxin-Token"] = notificationSettings.apiToken.trim();
    }
    const response = await fetch(`${normalizeApiBase(notificationSettings.apiBase)}${path}`, {
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : data.detail?.message;
      const error = new Error(detail || data.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }, [notificationSettings.apiBase, notificationSettings.apiToken]);

  const applyWorkspaceState = useCallback((workspace) => {
    if (!hasWorkspacePayload(workspace)) return false;
    hydratingRef.current = true;
    const nextProjects = Array.isArray(workspace.projects)
      ? workspace.projects.map(normalizeWorkspaceProject)
      : defaultProjects.map(normalizeWorkspaceProject);
    const todayKey = workspaceTodayKey();
    const timeBlocks = workspace.timeBlocks && typeof workspace.timeBlocks === "object" ? workspace.timeBlocks : {};
    const reviewEntries = workspace.reviewDaily?.entries && typeof workspace.reviewDaily.entries === "object"
      ? workspace.reviewDaily.entries
      : {};
    const active = workspace.focus?.active || workspace.focus?.activeItems?.[0] || null;
    const activeStartedAt = active ? restoreTimestamp(active.startedAtTs || active.startedAt) : null;
    const restoredFocus = active
      ? {
          ...active,
          itemId: active.itemId || active.taskId,
          subtaskId: active.subtaskId || null,
          startedAt: activeStartedAt,
          startedClock: active.startedClock || active.start || formatClock(activeStartedAt),
          sessionStartedClock: active.sessionStartedClock || active.start || active.startedClock
        }
      : null;

    setProjects(nextProjects);
    setItems(Array.isArray(workspace.tasks)
      ? workspace.tasks.map((task) => normalizeWorkspaceTask(task, nextProjects))
      : todayItems.map((task) => normalizeWorkspaceTask(task, nextProjects)));
    setTimelineBlocks(Array.isArray(timeBlocks[todayKey]) ? timeBlocks[todayKey] : []);
    setCompletedRecords(Array.isArray(workspace.completedRecords) ? workspace.completedRecords : []);
    setReflection(reviewEntries[todayKey]?.reflection || workspace.reflection || defaultReflection);
    setHealthHabits(Array.isArray(workspace.healthHabits) && workspace.healthHabits.length ? workspace.healthHabits : defaultHealthState());
    setTheme(workspace.theme || "ink");
    setActiveFocus(restoredFocus);
    setActiveRest(workspace.rest?.active || null);
    setNotificationSettings((current) => mergeServerNotificationSettings(current, workspace.notificationSettings));
    window.setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
    return true;
  }, []);

  const sendNotification = useCallback(async ({ title, content }) => {
    if (!notificationSettings.enabled) {
      setNotificationStatus({ tone: "warn", text: "通知未启用，本次只在页面内提示。" });
      return { ok: false };
    }
    if (!notificationSettings.wxpusherSpt.trim()) {
      setNotificationStatus({ tone: "warn", text: "未填写 WxPusher SPT，本次只在页面内提示。" });
      return { ok: false };
    }
    try {
      const headers = { "Content-Type": "application/json" };
      if (notificationSettings.apiToken.trim()) {
        headers["X-Mingxin-Token"] = notificationSettings.apiToken.trim();
      }
      const response = await fetch(`${normalizeApiBase(notificationSettings.apiBase)}/notifications/test`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          content,
          wxpusher_spt: notificationSettings.wxpusherSpt.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.detail || data.message || `HTTP ${response.status}`);
      }
      setNotificationStatus({ tone: "ok", text: "WxPusher 通知已发送。" });
      return { ok: true };
    } catch (error) {
      const message = error.message || String(error);
      const hint = message.includes("Failed to fetch")
        ? "请确认后端 API 地址是否正确、本地后端是否启动，以及后端访问密钥是否填写。"
        : "";
      setNotificationStatus({ tone: "error", text: `通知发送失败：${message}${hint ? ` ${hint}` : ""}` });
      return { ok: false };
    }
  }, [notificationSettings]);

  function updateNotificationSettings(changes) {
    setNotificationSettings((current) => normalizeNotificationSettings({
      ...current,
      ...changes
    }));
  }

  function saveNotificationSettings() {
    const normalized = normalizeNotificationSettings(notificationSettings);
    setNotificationSettings(normalized);
    window.localStorage.setItem(notificationSettingsStorageKey, JSON.stringify(normalized));
    setNotificationStatus({ tone: "ok", text: "连接信息已保存到当前设备；通知规则会随工作台状态写入后端。" });
  }

  const testNotification = useCallback(() => {
    sendNotification({
      title: "明心台测试提醒",
      content: `测试通知已触发。任务默认提前 ${notificationSettings.taskLeadMinutes} 分钟；专注结束前 ${notificationSettings.focusLeadMinutes} 分钟提醒。`
    });
  }, [notificationSettings, sendNotification]);

  useEffect(() => {
    let cancelled = false;
    syncReadyRef.current = false;
    backendRequest("/state")
      .then((data) => {
        if (cancelled) return;
        remoteUpdatedAtRef.current = data.updated_at || null;
        const restored = applyWorkspaceState(data.state);
        syncReadyRef.current = true;
        setSyncStatus({
          tone: "ok",
          short: restored ? "已同步" : "已连接",
          text: restored ? "已从后端恢复工作台状态，后续修改会自动保存。" : "后端已连接；当前为空库，首次修改会写入后端。"
        });
      })
      .catch((error) => {
        if (cancelled) return;
        syncReadyRef.current = false;
        const needsToken = error.status === 401 || error.status === 503;
        setSyncStatus({
          tone: "error",
          short: needsToken ? "待密钥" : "离线",
          text: needsToken
            ? "后端需要访问密钥；在设置页填写正确密钥后会自动恢复同步。"
            : `后端暂不可用：${error.message || String(error)}`
        });
      });
    return () => {
      cancelled = true;
    };
  }, [applyWorkspaceState, backendRequest]);

  useEffect(() => {
    if (!syncReadyRef.current || hydratingRef.current) return undefined;
    const payload = buildCurrentWorkspaceState();
    const compactPayload = JSON.stringify(payload);
    if (compactPayload === lastSavedPayloadRef.current) return undefined;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    setSyncStatus({ tone: "warn", short: "保存中", text: "正在把本次修改写入后端。" });
    saveTimerRef.current = window.setTimeout(() => {
      backendRequest("/state", {
        method: "POST",
        body: JSON.stringify({
          state: payload,
          reason: "frontend-auto-save",
          base_updated_at: remoteUpdatedAtRef.current,
          force: false
        })
      })
        .then((data) => {
          remoteUpdatedAtRef.current = data.updated_at || remoteUpdatedAtRef.current;
          lastSavedPayloadRef.current = compactPayload;
          setSyncStatus({ tone: "ok", short: "已同步", text: "修改已保存到后端，多端刷新后会看到同一份数据。" });
        })
        .catch((error) => {
          if (error.status === 409 && error.data?.detail?.state) {
            remoteUpdatedAtRef.current = error.data.detail.updated_at || remoteUpdatedAtRef.current;
            applyWorkspaceState(error.data.detail.state);
            lastSavedPayloadRef.current = JSON.stringify(error.data.detail.state);
            setSyncStatus({ tone: "warn", short: "已合并", text: "后端已有更新，本机已恢复为后端最新状态。" });
            return;
          }
          setSyncStatus({ tone: "error", short: "未同步", text: `保存失败：${error.message || String(error)}` });
        });
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [applyWorkspaceState, backendRequest, buildCurrentWorkspaceState]);

  useEffect(() => {
    if (!activeFocus?.expectedMinutes) return;
    const expectedSeconds = Number(activeFocus.expectedMinutes) * 60;
    if (!Number.isFinite(expectedSeconds) || expectedSeconds <= 0) return;
    const leadMinutes = normalizeMinuteValue(activeFocus.notifyBeforeMinutes, notificationSettings.focusLeadMinutes);
    const graceMinutes = normalizeMinuteValue(notificationSettings.focusGraceMinutes, 60, 0, 1440);
    const expectedEndTime = addMinutesToTime(activeFocus.sessionStartedClock || activeFocus.startedClock, Math.round(Number(activeFocus.expectedMinutes)));
    const leadAt = Math.max(0, expectedSeconds - leadMinutes * 60);

    const sent = focusNoticeRef.current[activeFocus.id] || {};

    if (leadMinutes > 0 && !sent.lead && focusTotalElapsedSeconds >= leadAt && focusTotalElapsedSeconds < expectedSeconds) {
      focusNoticeRef.current[activeFocus.id] = { ...sent, lead: true };
      sendNotification({
        title: "专注即将结束",
        content: `${activeFocus.title} 预计 ${expectedEndTime} 结束，剩余约 ${leadMinutes} 分钟。`
      });
      return;
    }

    if (!sent.due && focusTotalElapsedSeconds >= expectedSeconds) {
      focusNoticeRef.current[activeFocus.id] = { ...sent, due: true };
      sendNotification({
        title: "专注预计时间已到",
        content: `${activeFocus.title} 已到预计结束时间 ${expectedEndTime}。如果仍在专注，可以继续；系统会在兜底时间后暂停。`
      });
      return;
    }

    const autoCloseAt = expectedSeconds + graceMinutes * 60;
    if (!sent.auto && focusTotalElapsedSeconds >= autoCloseAt) {
      focusNoticeRef.current[activeFocus.id] = { ...sent, auto: true };
      const accumulatedSeconds = activeFocus.accumulatedSeconds || 0;
      const segmentElapsedSeconds = Math.max(1, autoCloseAt - accumulatedSeconds);
      const autoEndTime = addMinutesToTime(activeFocus.sessionStartedClock || activeFocus.startedClock, Math.round(autoCloseAt / 60));
      window.setTimeout(() => {
        setEndingFocus({
          ...activeFocus,
          autoClosed: true,
          focusAutoClosed: true,
          suggestedEndTime: expectedEndTime,
          elapsedSeconds: autoCloseAt,
          segmentElapsedSeconds
        });
        setActiveFocus((current) => current?.id === activeFocus.id ? null : current);
      }, 0);
      sendNotification({
        title: "专注已自动暂停",
        content: `${activeFocus.title} 已超过预计时长 ${graceMinutes} 分钟，系统已在 ${autoEndTime} 暂停计时，请回到明心台确认真实结束时间。`
      });
    }
  }, [activeFocus, focusTotalElapsedSeconds, notificationSettings, sendNotification]);

  function moveTodayItem(itemId, direction) {
    setItems((currentItems) => {
      const todayList = currentItems.filter((item) => item.tone === "today");
      const from = todayList.findIndex((item) => item.id === itemId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= todayList.length) return currentItems;
      const reordered = [...todayList];
      const [moving] = reordered.splice(from, 1);
      reordered.splice(to, 0, moving);
      let cursor = 0;
      return currentItems.map((item) => (item.tone === "today" ? reordered[cursor++] : item));
    });
  }

  function reorderTodayItems(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    setItems((currentItems) => {
      const todayList = currentItems.filter((item) => item.tone === "today");
      const from = todayList.findIndex((item) => item.id === sourceId);
      const to = todayList.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return currentItems;
      const reordered = [...todayList];
      const [moving] = reordered.splice(from, 1);
      reordered.splice(to, 0, moving);
      let cursor = 0;
      return currentItems.map((item) => (item.tone === "today" ? reordered[cursor++] : item));
    });
  }

  function createTask({
    title,
    projectId,
    lane,
    status,
    quadrant,
    planDate,
    dueDate,
    startTime,
    endTime,
    estimateMinutes,
    notifyEnabled,
    notifyBefore,
    subtasks
  }) {
    const config = taskLaneConfig(lane);
    const id = `${config.value}-${Date.now()}`;
    const estimate = Number(estimateMinutes) || 0;
    const subtaskItems = (subtasks || []).map((subtask, index) => ({
      id: `${id}-sub-${index + 1}`,
      title: subtask,
      done: false,
      meta: buildSubtaskMeta({ title: subtask, done: false })
    }));
    const notifyText = notifyEnabled
      ? `通知：${notifyBefore === "0" ? "准点" : `提前 ${notifyBefore} 分钟`}`
      : "不通知";
    const notification = notifyEnabled
      ? {
          mode: "custom",
          enabled: true,
          leadMinutes: normalizeMinuteValue(notifyBefore, notificationSettings.taskLeadMinutes),
          atDue: notificationSettings.taskAtDue,
          overdue: notificationSettings.taskOverdue
        }
      : { mode: "off" };
    const baseTask = {
      id,
      tone: config.value,
      title,
      projectId,
      status,
      quadrant,
      planDate,
      dueDate,
      startTime,
      endTime,
      estimateMinutes: estimate,
      notification,
      draggable: Boolean(config.draggable),
      action: config.action,
      subtasks: subtaskItems
    };
    const newTask = {
      ...baseTask,
      meta: buildTaskMeta(baseTask, projects, [notifyText])
    };
    setItems((currentItems) => [...currentItems, newTask]);
    setActiveView("today");
    setSheetOpen(false);
  }

  function createProject({ title, note }) {
    setProjects((currentProjects) => [
      ...currentProjects,
      {
        id: `project-${Date.now()}`,
        title,
        note,
        archived: false,
        archivedAt: ""
      }
    ]);
  }

  function archiveProject(projectId) {
    const now = new Date().toISOString();
    setProjects((currentProjects) => currentProjects.map((project) => (
      project.id === projectId ? { ...project, archived: true, archivedAt: now } : project
    )));
  }

  function restoreProject(projectId) {
    setProjects((currentProjects) => currentProjects.map((project) => (
      project.id === projectId ? { ...project, archived: false, archivedAt: "" } : project
    )));
  }

  function updateTask(taskId, changes) {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== taskId) return item;
      const config = taskLaneConfig(changes.tone ?? item.tone);
      const nextTask = {
        ...item,
        ...changes,
        tone: config.value,
        draggable: Boolean(config.draggable),
        action: config.action
      };
      return {
        ...nextTask,
        meta: buildTaskMeta(nextTask, projects, item.meta)
      };
    }));
  }

  function addSubtask(taskId, subtask) {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== taskId) return item;
      const nextSubtasks = [
        ...(item.subtasks || []),
        {
          id: `${taskId}-sub-${Date.now()}`,
          title: subtask.title,
          startDate: subtask.startDate,
          dueDate: subtask.dueDate,
          done: false
        }
      ].map((entry) => ({ ...entry, meta: buildSubtaskMeta(entry) }));
      return {
        ...item,
        subtasks: nextSubtasks,
        meta: withSubtaskSummary(item.meta, nextSubtasks)
      };
    }));
  }

  function updateSubtask(taskId, subtaskId, changes) {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== taskId) return item;
      const nextSubtasks = (item.subtasks || []).map((subtask) => {
        if (subtask.id !== subtaskId) return subtask;
        const nextSubtask = { ...subtask, ...changes };
        return { ...nextSubtask, meta: buildSubtaskMeta(nextSubtask) };
      });
      return {
        ...item,
        subtasks: nextSubtasks,
        meta: withSubtaskSummary(item.meta, nextSubtasks)
      };
    }));
  }

  function deleteSubtask(taskId, subtaskId) {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== taskId) return item;
      const nextSubtasks = (item.subtasks || []).filter((subtask) => subtask.id !== subtaskId);
      return {
        ...item,
        subtasks: nextSubtasks,
        meta: withSubtaskSummary(item.meta, nextSubtasks)
      };
    }));
  }

  function completeTask(taskId) {
    const task = items.find((item) => item.id === taskId);
    if (!task || task.status === "done" || task.tone === "done") return;
    const now = Date.now();
    const completedClock = formatClock(now);
    const doneTask = {
      ...task,
      tone: "done",
      status: "done",
      draggable: false,
      action: "完成"
    };

    setItems((currentItems) => currentItems.map((item) => (
      item.id === taskId
        ? { ...doneTask, meta: buildTaskMeta(doneTask, projects, [...item.meta, `完成 ${completedClock}`]) }
        : item
    )));
    setCompletedRecords((records) => [
      ...records,
      {
        id: `manual-complete-${now}`,
        itemId: task.id,
        subtaskId: null,
        title: task.title,
        parentTitle: "",
        startedClock: completedClock,
        endedClock: completedClock,
        date: workspaceTodayKey(),
        durationSeconds: 0
      }
    ]);
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = items.find((item) => item.id === taskId);
    const targetSubtask = task?.subtasks?.find((subtask) => subtask.id === subtaskId);
    const willBeDone = targetSubtask ? !targetSubtask.done : false;
    const nextSubtasksForRecord = (task?.subtasks || []).map((subtask) => (
      subtask.id === subtaskId ? { ...subtask, done: willBeDone } : subtask
    ));
    const shouldCompleteParent = Boolean(
      task
      && willBeDone
      && task.tone !== "done"
      && nextSubtasksForRecord.length
      && nextSubtasksForRecord.every((subtask) => subtask.done)
    );
    const now = Date.now();
    const completedClock = formatClock(now);

    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== taskId) return item;
      const nextSubtasks = (item.subtasks || []).map((subtask) => {
        if (subtask.id !== subtaskId) return subtask;
        const nextSubtask = { ...subtask, done: !subtask.done };
        return { ...nextSubtask, meta: buildSubtaskMeta(nextSubtask) };
      });
      const nextTask = {
        ...item,
        subtasks: nextSubtasks,
        meta: withSubtaskSummary(item.meta, nextSubtasks)
      };
      if (!shouldCompleteParent) return nextTask;
      const doneTask = {
        ...nextTask,
        tone: "done",
        status: "done",
        draggable: false,
        action: "完成"
      };
      return {
        ...doneTask,
        meta: buildTaskMeta(doneTask, projects, [...nextTask.meta, `完成 ${completedClock}`])
      };
    }));

    if (shouldCompleteParent) {
      setCompletedRecords((records) => [
        ...records,
        {
          id: `subtasks-complete-${now}`,
          itemId: task.id,
          subtaskId: null,
          title: task.title,
          parentTitle: "",
          startedClock: completedClock,
          endedClock: completedClock,
          date: workspaceTodayKey(),
          durationSeconds: 0
        }
      ]);
    }
  }

  function startFocus({ expectedMinutes, notifyBeforeMinutes }) {
    if (!focusTarget) return;
    const focusTitle = focusTarget.subtask?.title || focusTarget.item.title;
    const now = Date.now();
    const startedClock = formatClock(now);
    const expected = normalizeMinuteValue(expectedMinutes, 0, 0, 1440) || null;
    const notifyBefore = expected
      ? normalizeMinuteValue(notifyBeforeMinutes, notificationSettings.focusLeadMinutes, 0, 1440)
      : null;
    setActiveFocus({
      id: `focus-${now}`,
      itemId: focusTarget.item.id,
      subtaskId: focusTarget.subtask?.id || null,
      title: focusTitle,
      parentTitle: focusTarget.subtask ? focusTarget.item.title : "",
      date: workspaceTodayKey(),
      expectedMinutes: expected,
      notifyBeforeMinutes: notifyBefore,
      startedAt: now,
      startedClock,
      sessionStartedClock: startedClock,
      accumulatedSeconds: 0,
      focusLeadNoticeSent: false,
      focusDueNoticeSent: false,
      focusAutoClosed: false
    });
    setFocusTarget(null);
    setActiveView("today");
  }

  function openEndFocus() {
    if (!activeFocus) return;
    setEndingFocus({
      ...activeFocus,
      elapsedSeconds: (activeFocus.accumulatedSeconds || 0) + focusElapsedSeconds,
      segmentElapsedSeconds: focusElapsedSeconds
    });
  }

  function confirmEndFocus(actualEndTime) {
    if (!endingFocus) return;
    const segmentSeconds = secondsBetweenClock(endingFocus.startedClock, actualEndTime) || endingFocus.segmentElapsedSeconds || endingFocus.elapsedSeconds;
    const totalSeconds = (endingFocus.accumulatedSeconds || 0) + segmentSeconds;
    const duration = formatMinutes(totalSeconds);
    const record = {
      id: `record-${Date.now()}`,
      itemId: endingFocus.itemId,
      subtaskId: endingFocus.subtaskId,
      title: endingFocus.title,
      parentTitle: endingFocus.parentTitle,
      startedClock: endingFocus.sessionStartedClock || endingFocus.startedClock,
      endedClock: actualEndTime,
      date: workspaceTodayKey(),
      durationSeconds: totalSeconds
    };
    setTimelineBlocks((blocks) => [
      ...blocks,
      makeFocusBlock(endingFocus, segmentSeconds, {
        id: `line-focus-${Date.now()}`,
        endedClock: actualEndTime
      })
    ]);
    setCompletedRecords((records) => [...records, record]);
    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== endingFocus.itemId) return item;
      const nextMeta = item.meta.filter((meta) => !meta.startsWith("已专注"));
      return { ...item, meta: [...nextMeta, `已专注 ${duration}`] };
    }));
    setActiveFocus(null);
    setEndingFocus(null);
  }

  function startRest(plannedMinutes) {
    if (!activeFocus) return;
    const now = Date.now();
    const restStartClock = formatClock(now);
    const pausedSeconds = focusElapsedSeconds;
    setTimelineBlocks((blocks) => [
      ...blocks,
      makeFocusBlock(activeFocus, pausedSeconds, {
        id: `line-focus-pause-${now}`,
        endedClock: restStartClock
      })
    ]);
    setActiveRest({
      id: `rest-${now}`,
      date: workspaceTodayKey(),
      plannedMinutes,
      startedAt: now,
      startedClock: restStartClock,
      pausedFocus: {
        ...activeFocus,
        accumulatedSeconds: (activeFocus.accumulatedSeconds || 0) + pausedSeconds
      }
    });
    setActiveFocus(null);
    setRestPromptOpen(false);
  }

  function endRest() {
    if (!activeRest) return;
    setTimelineBlocks((blocks) => [
      ...blocks,
      makeRestBlock(activeRest, restElapsedSeconds, {
        id: `line-rest-${Date.now()}`
      })
    ]);
    setResumePrompt(activeRest.pausedFocus);
    setActiveRest(null);
  }

  function resumeFocus() {
    if (!resumePrompt) return;
    const now = Date.now();
    setActiveFocus({
      ...resumePrompt,
      id: `focus-${now}`,
      startedAt: now,
      startedClock: formatClock(now)
    });
    setResumePrompt(null);
  }

  return (
    <main className="stage">
      <section className="phone" aria-label="明心台 2.0">
        <div className="app" aria-hidden={hasModalOpen ? "true" : undefined} hidden={hasModalOpen ? true : undefined}>
          {!hasModalOpen && (
            <ActiveView
              theme={theme}
              onThemeChange={setTheme}
              items={items}
              projects={projects}
              timelineBlocks={visibleTimelineBlocks}
              completedRecords={completedRecords}
              reflection={reflection}
              onReflectionChange={setReflection}
              healthHabits={healthHabits}
              onHealthHabitsChange={setHealthHabits}
              focus={activeFocus}
              focusElapsedSeconds={focusTotalElapsedSeconds}
              notificationSettings={notificationSettings}
              onUpdateNotificationSettings={updateNotificationSettings}
              onSaveNotificationSettings={saveNotificationSettings}
              onTestNotification={testNotification}
              notificationStatus={notificationStatus}
              syncStatus={syncStatus}
              onMoveTodayItem={moveTodayItem}
              onCreateProject={createProject}
              onArchiveProject={archiveProject}
              onRestoreProject={restoreProject}
              onStartFocus={setFocusTarget}
              onOpenTask={setSelectedTaskId}
              onCompleteTask={completeTask}
              onToggleSubtask={toggleSubtask}
              onEndFocus={openEndFocus}
              onOpenRest={() => activeFocus && setRestPromptOpen(true)}
              onDragStart={(event, itemId) => {
                setDraggedId(itemId);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDrop={(event, itemId) => {
                event.preventDefault();
                reorderTodayItems(draggedId, itemId);
                setDraggedId(null);
              }}
            />
          )}
        </div>
        {activeView === "today" && (
          <button className="fab" type="button" aria-label="快速添加" onClick={() => setSheetOpen(true)}>+</button>
        )}
        <nav className="tabbar" aria-label="主导航">
          {tabs.map((tab) => (
            <button
              className={`tab ${activeView === tab.key ? "active" : ""}`}
              type="button"
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <QuickAddSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onCreate={createTask}
          projects={projects.filter((project) => !project.archived)}
          notificationSettings={notificationSettings}
        />
        <TaskDetailSheet
          key={selectedTask?.id || "closed-task-detail"}
          task={selectedTask}
          projects={projects.filter((project) => !project.archived || project.id === selectedTask?.projectId)}
          project={selectedTaskProject}
          onClose={() => setSelectedTaskId(null)}
          onUpdateTask={updateTask}
          onAddSubtask={addSubtask}
          onUpdateSubtask={updateSubtask}
          onDeleteSubtask={deleteSubtask}
          onToggleSubtask={toggleSubtask}
          onStartFocus={setFocusTarget}
        />
        <FocusStartSheet
          target={focusTarget}
          notificationSettings={notificationSettings}
          onClose={() => setFocusTarget(null)}
          onStart={startFocus}
        />
        <RestStartSheet open={restPromptOpen} onClose={() => setRestPromptOpen(false)} onStart={startRest} />
        <RestOverlay rest={activeRest} elapsedSeconds={restElapsedSeconds} onEnd={endRest} />
        <ResumeFocusSheet focus={resumePrompt} onResume={resumeFocus} onSkip={() => setResumePrompt(null)} />
        <EndFocusSheet
          key={endingFocus?.id || "closed-ending-focus"}
          focus={endingFocus}
          elapsedSeconds={endingFocus?.elapsedSeconds || 0}
          onClose={() => setEndingFocus(null)}
          onConfirm={confirmEndFocus}
        />
      </section>
    </main>
  );
}
