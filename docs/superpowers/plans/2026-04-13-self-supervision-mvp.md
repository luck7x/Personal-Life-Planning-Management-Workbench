# Self Supervision MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first static MVP prototype with task and calendar views, persistent browser storage, task lifecycle transitions, overdue rollover, and a weekly time-flow calendar.

**Architecture:** Create a new `prototype-mvp/` workspace containing a single static page (`index.html`, `styles.css`, `app.js`) backed by `localStorage`. Keep all behavior in `app.js`, but structure it into explicit sections for storage, task transitions, calendar logic, modal state, and rendering so the UI ships quickly without becoming opaque. Before implementation starts, re-check any locally installed Codex frontend plugins; use them only if they materially reduce setup time, otherwise keep the implementation vanilla.

**Tech Stack:** HTML, CSS, vanilla JavaScript (ES modules), localStorage, Vitest, jsdom, Python static server for local preview

---

### Task 1: Scaffold The Prototype Workspace

**Files:**
- Create: `prototype-mvp/package.json`
- Create: `prototype-mvp/index.html`
- Create: `prototype-mvp/styles.css`
- Create: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/bootstrap.test.js`

- [ ] **Step 1: Write the failing bootstrap test**

```js
// prototype-mvp/tests/bootstrap.test.js
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../app.js';

describe('bootstrap state', () => {
  it('creates the preset categories and empty collections', () => {
    const state = createInitialState();

    expect(state.tasks).toEqual([]);
    expect(state.calendarEntries).toEqual([]);
    expect(state.categories.map((item) => item.name)).toEqual([
      '工作',
      '学习',
      '生活',
      '兴趣',
      '娱乐',
    ]);
    expect(state.ui.currentView).toBe('tasks');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm install
npm test -- bootstrap.test.js
```

Expected: FAIL because `app.js` does not export `createInitialState`.

- [ ] **Step 3: Create the workspace files with the minimal passing implementation**

```json
// prototype-mvp/package.json
{
  "name": "self-supervision-mvp",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "python -m http.server 4173"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

```html
<!-- prototype-mvp/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>监督反思 MVP</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

```css
/* prototype-mvp/styles.css */
:root {
  color-scheme: light;
  font-family: "Segoe UI", "PingFang SC", sans-serif;
}

body {
  margin: 0;
  background: #f6f2e9;
  color: #1f2328;
}
```

```js
// prototype-mvp/app.js
const PRESET_CATEGORIES = [
  { id: 'work', name: '工作', color: '#3867d6', isPreset: true },
  { id: 'study', name: '学习', color: '#20bf6b', isPreset: true },
  { id: 'life', name: '生活', color: '#fa8231', isPreset: true },
  { id: 'interest', name: '兴趣', color: '#8854d0', isPreset: true },
  { id: 'fun', name: '娱乐', color: '#eb3b5a', isPreset: true },
];

export function createInitialState() {
  return {
    tasks: [],
    calendarEntries: [],
    categories: [...PRESET_CATEGORIES],
    ui: {
      currentView: 'tasks',
      currentWeekStart: null,
      sortMode: 'manual',
      activeModal: null,
    },
  };
}

const appRoot = typeof document !== 'undefined' ? document.querySelector('#app') : null;
if (appRoot) {
  appRoot.innerHTML = '<main><h1>监督反思 MVP</h1></main>';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
cd prototype-mvp
npm test -- bootstrap.test.js
```

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/package.json prototype-mvp/index.html prototype-mvp/styles.css prototype-mvp/app.js prototype-mvp/tests/bootstrap.test.js
git commit -m "chore: scaffold self supervision prototype"
```

### Task 2: Implement Task Storage And Core State Transitions

**Files:**
- Modify: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/task-state.test.js`

- [ ] **Step 1: Write the failing task state tests**

```js
// prototype-mvp/tests/task-state.test.js
import { describe, expect, it } from 'vitest';
import {
  addTask,
  createInitialState,
  directCompleteTask,
  startTask,
  finishTask,
  abandonTask,
} from '../app.js';

describe('task transitions', () => {
  it('adds a todo task at the top of the list', () => {
    let state = createInitialState();
    state = addTask(state, {
      title: '整理视频笔记',
      categoryId: 'study',
      importance: 'medium',
      dueAt: null,
    });

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe('todo');
    expect(state.tasks[0].title).toBe('整理视频笔记');
  });

  it('starts a task and records startedAt', () => {
    let state = createInitialState();
    state = addTask(state, { title: '写周报', categoryId: 'work' });
    state = startTask(state, state.tasks[0].id, '2026-04-13T09:00:00.000Z');

    expect(state.tasks[0].status).toBe('doing');
    expect(state.tasks[0].startedAt).toBe('2026-04-13T09:00:00.000Z');
  });

  it('directly completes a todo task with zero duration', () => {
    let state = createInitialState();
    state = addTask(state, { title: '补记灵感', categoryId: 'interest' });
    state = directCompleteTask(state, state.tasks[0].id, '2026-04-13T10:00:00.000Z');

    expect(state.tasks[0].status).toBe('done');
    expect(state.tasks[0].startedAt).toBe(null);
    expect(state.tasks[0].durationMs).toBe(0);
  });

  it('finishes a doing task and records duration', () => {
    let state = createInitialState();
    state = addTask(state, { title: '练口语', categoryId: 'study' });
    state = startTask(state, state.tasks[0].id, '2026-04-13T11:00:00.000Z');
    state = finishTask(state, state.tasks[0].id, '2026-04-13T11:25:00.000Z');

    expect(state.tasks[0].status).toBe('done');
    expect(state.tasks[0].durationMs).toBe(25 * 60 * 1000);
  });

  it('abandons a doing task and stores the reason', () => {
    let state = createInitialState();
    state = addTask(state, { title: '刷资讯', categoryId: 'fun' });
    state = startTask(state, state.tasks[0].id, '2026-04-13T12:00:00.000Z');
    state = abandonTask(
      state,
      state.tasks[0].id,
      '2026-04-13T12:40:00.000Z',
      '发现是无目的刷屏'
    );

    expect(state.tasks[0].status).toBe('trash');
    expect(state.tasks[0].abandonReason).toBe('发现是无目的刷屏');
    expect(state.tasks[0].durationMs).toBe(40 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- task-state.test.js
```

Expected: FAIL because the state transition helpers do not exist yet.

- [ ] **Step 3: Implement storage helpers and task transition functions**

```js
// prototype-mvp/app.js
const STORAGE_KEY = 'self-supervision-mvp-state';

function cloneState(state) {
  return {
    ...state,
    tasks: state.tasks.map((task) => ({ ...task })),
    calendarEntries: state.calendarEntries.map((entry) => ({ ...entry })),
    categories: state.categories.map((category) => ({ ...category })),
    ui: { ...state.ui },
  };
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addTask(state, draft) {
  const next = cloneState(state);
  next.tasks.unshift({
    id: createId('task'),
    title: draft.title.trim(),
    status: 'todo',
    categoryId: draft.categoryId ?? 'life',
    importance: draft.importance ?? 'medium',
    createdAt: draft.createdAt ?? new Date().toISOString(),
    dueAt: draft.dueAt ?? null,
    startedAt: null,
    endedAt: null,
    durationMs: null,
    abandonReason: '',
    sortOrder: Date.now(),
  });
  return next;
}

export function startTask(state, taskId, startedAt = new Date().toISOString()) {
  const next = cloneState(state);
  const task = next.tasks.find((item) => item.id === taskId);
  task.status = 'doing';
  task.startedAt = startedAt;
  return next;
}

export function directCompleteTask(state, taskId, endedAt = new Date().toISOString()) {
  const next = cloneState(state);
  const task = next.tasks.find((item) => item.id === taskId);
  task.status = 'done';
  task.startedAt = null;
  task.endedAt = endedAt;
  task.durationMs = 0;
  return next;
}

export function finishTask(state, taskId, endedAt = new Date().toISOString()) {
  const next = cloneState(state);
  const task = next.tasks.find((item) => item.id === taskId);
  task.status = 'done';
  task.endedAt = endedAt;
  task.durationMs = new Date(endedAt).getTime() - new Date(task.startedAt).getTime();
  return next;
}

export function abandonTask(state, taskId, endedAt, reason) {
  if (!reason.trim()) throw new Error('abandon reason is required');
  const next = cloneState(state);
  const task = next.tasks.find((item) => item.id === taskId);
  task.status = 'trash';
  task.endedAt = endedAt;
  task.durationMs = new Date(endedAt).getTime() - new Date(task.startedAt).getTime();
  task.abandonReason = reason.trim();
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
cd prototype-mvp
npm test -- task-state.test.js
```

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/app.js prototype-mvp/tests/task-state.test.js
git commit -m "feat: add task state transitions"
```

### Task 3: Add Overdue Rollover And Calendar Entry Synchronization

**Files:**
- Modify: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/rollover-calendar.test.js`

- [ ] **Step 1: Write the failing rollover and calendar sync tests**

```js
// prototype-mvp/tests/rollover-calendar.test.js
import { describe, expect, it } from 'vitest';
import {
  addTask,
  createInitialState,
  finishTask,
  rolloverTasks,
  startTask,
  syncCalendarEntriesForTask,
} from '../app.js';

describe('rollover and calendar sync', () => {
  it('moves stale todo items into overdue', () => {
    let state = createInitialState();
    state = addTask(state, {
      title: '昨天没处理的任务',
      categoryId: 'work',
      createdAt: '2026-04-12T08:00:00.000Z',
    });

    state = rolloverTasks(state, '2026-04-13T09:00:00.000Z');
    expect(state.tasks[0].status).toBe('overdue');
  });

  it('keeps doing items in doing when the day changes', () => {
    let state = createInitialState();
    state = addTask(state, { title: '跨天写方案', categoryId: 'work' });
    state = startTask(state, state.tasks[0].id, '2026-04-12T23:30:00.000Z');

    state = rolloverTasks(state, '2026-04-13T08:00:00.000Z');
    expect(state.tasks[0].status).toBe('doing');
  });

  it('creates and updates a calendar entry for a doing task', () => {
    let state = createInitialState();
    state = addTask(state, { title: '复盘视频', categoryId: 'study' });
    state = startTask(state, state.tasks[0].id, '2026-04-13T09:00:00.000Z');
    state = syncCalendarEntriesForTask(state, state.tasks[0].id);

    expect(state.calendarEntries).toHaveLength(1);
    expect(state.calendarEntries[0].source).toBe('task');

    state = finishTask(state, state.tasks[0].id, '2026-04-13T09:45:00.000Z');
    state = syncCalendarEntriesForTask(state, state.tasks[0].id);

    expect(state.calendarEntries[0].endAt).toBe('2026-04-13T09:45:00.000Z');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- rollover-calendar.test.js
```

Expected: FAIL because rollover and calendar sync helpers are not implemented.

- [ ] **Step 3: Implement rollover and task-calendar synchronization**

```js
// prototype-mvp/app.js
function isSameLocalDate(leftIso, rightIso) {
  const left = new Date(leftIso);
  const right = new Date(rightIso);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function rolloverTasks(state, nowIso = new Date().toISOString()) {
  const next = cloneState(state);

  next.tasks = next.tasks.map((task) => {
    if (task.status !== 'todo') return task;
    const createdBeforeToday = !isSameLocalDate(task.createdAt, nowIso);
    const dueExpired = task.dueAt ? new Date(task.dueAt).getTime() < new Date(nowIso).getTime() : false;
    return createdBeforeToday || dueExpired
      ? { ...task, status: 'overdue' }
      : task;
  });

  return next;
}

export function syncCalendarEntriesForTask(state, taskId) {
  const next = cloneState(state);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task || !task.startedAt) return next;

  const existing = next.calendarEntries.find((entry) => entry.taskId === taskId);
  const payload = {
    id: existing?.id ?? createId('entry'),
    taskId,
    title: task.title,
    categoryId: task.categoryId,
    startAt: task.startedAt,
    endAt: task.endedAt ?? null,
    source: 'task',
    isAbandoned: task.status === 'trash',
    notes: task.abandonReason || '',
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    next.calendarEntries.push(payload);
  }

  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
cd prototype-mvp
npm test -- rollover-calendar.test.js
```

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/app.js prototype-mvp/tests/rollover-calendar.test.js
git commit -m "feat: add overdue rollover and task calendar sync"
```

### Task 4: Implement Calendar Splitting, Overlap Lanes, And Manual Entries

**Files:**
- Modify: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/calendar-layout.test.js`

- [ ] **Step 1: Write the failing calendar layout tests**

```js
// prototype-mvp/tests/calendar-layout.test.js
import { describe, expect, it } from 'vitest';
import {
  assignOverlapLanes,
  createInitialState,
  splitEntryIntoDailySegments,
  upsertManualEntry,
} from '../app.js';

describe('calendar layout helpers', () => {
  it('splits a cross-day entry into daily segments', () => {
    const segments = splitEntryIntoDailySegments({
      id: 'entry-1',
      startAt: '2026-04-13T23:30:00.000Z',
      endAt: '2026-04-14T01:10:00.000Z',
    });

    expect(segments).toHaveLength(2);
    expect(segments[0].segmentEnd).toBe('2026-04-14T00:00:00.000Z');
    expect(segments[1].segmentStart).toBe('2026-04-14T00:00:00.000Z');
  });

  it('assigns overlap lanes only within a conflict group', () => {
    const laidOut = assignOverlapLanes([
      { id: 'a', startAt: '2026-04-13T09:00:00.000Z', endAt: '2026-04-13T10:00:00.000Z' },
      { id: 'b', startAt: '2026-04-13T09:30:00.000Z', endAt: '2026-04-13T10:30:00.000Z' },
      { id: 'c', startAt: '2026-04-13T11:00:00.000Z', endAt: '2026-04-13T12:00:00.000Z' },
    ]);

    expect(laidOut.find((item) => item.id === 'a').lane).toBe(0);
    expect(laidOut.find((item) => item.id === 'b').lane).toBe(1);
    expect(laidOut.find((item) => item.id === 'c').laneCount).toBe(1);
  });

  it('allows a manual entry to overlap task entries', () => {
    let state = createInitialState();
    state = upsertManualEntry(state, {
      title: '边散步边听播客',
      categoryId: 'interest',
      startAt: '2026-04-13T18:00:00.000Z',
      endAt: '2026-04-13T18:40:00.000Z',
      notes: '允许重叠',
    });

    expect(state.calendarEntries[0].source).toBe('manual');
    expect(state.calendarEntries[0].taskId).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- calendar-layout.test.js
```

Expected: FAIL because the calendar layout helpers are missing.

- [ ] **Step 3: Implement manual entry and calendar layout helpers**

```js
// prototype-mvp/app.js
export function upsertManualEntry(state, draft) {
  if (new Date(draft.endAt).getTime() <= new Date(draft.startAt).getTime()) {
    throw new Error('manual entry end must be after start');
  }

  const next = cloneState(state);
  next.calendarEntries.push({
    id: createId('entry'),
    taskId: null,
    title: draft.title.trim(),
    categoryId: draft.categoryId,
    startAt: draft.startAt,
    endAt: draft.endAt,
    source: 'manual',
    isAbandoned: false,
    notes: draft.notes ?? '',
  });
  return next;
}

export function splitEntryIntoDailySegments(entry) {
  const segments = [];
  let cursor = new Date(entry.startAt);
  const end = new Date(entry.endAt);

  while (cursor < end) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setHours(24, 0, 0, 0);
    const segmentEnd = nextMidnight < end ? nextMidnight : end;

    segments.push({
      ...entry,
      segmentStart: new Date(cursor).toISOString(),
      segmentEnd: new Date(segmentEnd).toISOString(),
    });

    cursor = new Date(segmentEnd);
  }

  return segments;
}

export function assignOverlapLanes(entries) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
  const active = [];

  sorted.forEach((entry) => {
    const start = new Date(entry.startAt).getTime();
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= start) active.splice(index, 1);
    }

    const usedLanes = new Set(active.map((item) => item.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;

    entry.lane = lane;
    active.push({ lane, end: new Date(entry.endAt).getTime(), ref: entry });
    const laneCount = Math.max(...active.map((item) => item.lane)) + 1;
    active.forEach((item) => {
      item.ref.laneCount = laneCount;
    });
  });

  return sorted;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
cd prototype-mvp
npm test -- calendar-layout.test.js
```

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/app.js prototype-mvp/tests/calendar-layout.test.js
git commit -m "feat: add calendar entry layout helpers"
```

### Task 5: Render The Task View, Modal Flows, And Local Persistence

**Files:**
- Modify: `prototype-mvp/index.html`
- Modify: `prototype-mvp/styles.css`
- Modify: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/task-view-dom.test.js`

- [ ] **Step 1: Write the failing DOM test for the task view**

```js
// prototype-mvp/tests/task-view-dom.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createInitialState, renderApp } from '../app.js';

describe('task view DOM', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
  });

  it('renders the five task sections and the add-task button', () => {
    const state = createInitialState();
    renderApp(state);

    const sectionTitles = [...document.querySelectorAll('[data-section-title]')].map(
      (node) => node.textContent.trim()
    );

    expect(sectionTitles).toEqual(['备忘 Todo', 'Doing', 'Done', '逾期', '垃圾篓']);
    expect(document.querySelector('[data-action=\"open-task-modal\"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- task-view-dom.test.js
```

Expected: FAIL because `renderApp` does not build the task interface.

- [ ] **Step 3: Implement the task view shell, modal scaffolding, and persistence hooks**

```html
<!-- prototype-mvp/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>监督反思 MVP</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <template id="modal-root-template">
      <div class="modal-backdrop" data-modal-backdrop></div>
    </template>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

```css
/* prototype-mvp/styles.css */
.shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.topbar,
.view-switcher,
.task-sections,
.task-section,
.task-card,
.modal,
.form-grid {
  display: grid;
  gap: 12px;
}

.task-section {
  padding: 16px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(31, 35, 40, 0.08);
  border-radius: 18px;
}

.task-card {
  padding: 14px;
  border-left: 6px solid var(--category-color, #999);
  border-radius: 14px;
  background: #fffdf9;
}

.task-card.is-cross-day::after {
  content: '跨天进行中';
  color: #8c5f1f;
  font-size: 12px;
}
```

```js
// prototype-mvp/app.js
let state = createInitialState();

export function renderApp(state) {
  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>监督反思 MVP</h1>
          <p>允许娱乐，但要看见时间流向。</p>
        </div>
        <nav class="view-switcher">
          <button data-view="tasks">任务</button>
          <button data-view="calendar">日历</button>
        </nav>
      </header>
      <section class="task-sections">
        ${['备忘 Todo', 'Doing', 'Done', '逾期', '垃圾篓']
          .map(
            (title, index) => `
              <section class="task-section">
                <header>
                  <h2 data-section-title>${title}</h2>
                  ${index === 0 ? '<button data-action="open-task-modal">新增任务</button>' : ''}
                </header>
                <div data-section-body="${index}"></div>
              </section>
            `
          )
          .join('')}
      </section>
      <section data-modal-host></section>
    </main>
  `;
}

export function bootstrap() {
  state = rolloverTasks(loadState());
  saveState(state);
  renderApp(state);
}

if (typeof document !== 'undefined') {
  bootstrap();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
cd prototype-mvp
npm test -- task-view-dom.test.js
```

Expected: PASS with 1 passing test.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/index.html prototype-mvp/styles.css prototype-mvp/app.js prototype-mvp/tests/task-view-dom.test.js
git commit -m "feat: render task view shell"
```

### Task 6: Add Custom Categories, Sorting, And Task Reordering

**Files:**
- Modify: `prototype-mvp/app.js`
- Modify: `prototype-mvp/styles.css`
- Create: `prototype-mvp/tests/task-interactions.test.js`

- [ ] **Step 1: Write the failing interaction tests**

```js
// prototype-mvp/tests/task-interactions.test.js
import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addTask,
  createInitialState,
  reorderTasks,
  sortTasksForSection,
} from '../app.js';

describe('task interactions', () => {
  it('adds a custom category with a custom color', () => {
    let state = createInitialState();
    state = addCategory(state, { name: '副业', color: '#2d98da' });

    expect(state.categories.at(-1)).toMatchObject({
      name: '副业',
      color: '#2d98da',
      isPreset: false,
    });
  });

  it('sorts todo tasks by importance when requested', () => {
    let state = createInitialState();
    state = addTask(state, { title: '低优先级', categoryId: 'life', importance: 'low' });
    state = addTask(state, { title: '高优先级', categoryId: 'work', importance: 'high' });

    const sorted = sortTasksForSection(state.tasks, 'importance');
    expect(sorted[0].title).toBe('高优先级');
  });

  it('persists a manual drag reorder for todo tasks', () => {
    let state = createInitialState();
    state = addTask(state, { title: '第一项', categoryId: 'study' });
    state = addTask(state, { title: '第二项', categoryId: 'study' });

    state = reorderTasks(state, 'todo', [state.tasks[1].id, state.tasks[0].id]);
    expect(state.tasks[0].title).toBe('第一项');
    expect(state.ui.sortMode).toBe('manual');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- task-interactions.test.js
```

Expected: FAIL because category creation, sort helpers, and reorder helpers do not exist yet.

- [ ] **Step 3: Implement category creation, sort helpers, and manual reorder**

```js
// prototype-mvp/app.js
const IMPORTANCE_WEIGHT = { high: 3, medium: 2, low: 1 };

export function addCategory(state, draft) {
  const next = cloneState(state);
  next.categories.push({
    id: createId('category'),
    name: draft.name.trim(),
    color: draft.color,
    isPreset: false,
  });
  return next;
}

export function sortTasksForSection(tasks, mode = 'manual') {
  const list = [...tasks];
  if (mode === 'importance') {
    return list.sort(
      (left, right) =>
        (IMPORTANCE_WEIGHT[right.importance] ?? 0) - (IMPORTANCE_WEIGHT[left.importance] ?? 0)
    );
  }

  if (mode === 'time') {
    return list.sort(
      (left, right) =>
        new Date(left.dueAt ?? left.createdAt).getTime() -
        new Date(right.dueAt ?? right.createdAt).getTime()
    );
  }

  return list.sort((left, right) => right.sortOrder - left.sortOrder);
}

export function reorderTasks(state, status, orderedIds) {
  const next = cloneState(state);
  const pool = next.tasks.filter((task) => task.status === status);
  const map = new Map(pool.map((task) => [task.id, task]));

  orderedIds.forEach((taskId, index) => {
    const task = map.get(taskId);
    if (task) task.sortOrder = orderedIds.length - index;
  });

  next.tasks.sort((left, right) => right.sortOrder - left.sortOrder);
  next.ui.sortMode = 'manual';
  return next;
}
```

```css
/* prototype-mvp/styles.css */
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sort-chip {
  border: 1px solid rgba(31, 35, 40, 0.12);
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```powershell
cd prototype-mvp
npm test -- task-interactions.test.js
```

Expected: PASS with 3 passing tests.

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/app.js prototype-mvp/styles.css prototype-mvp/tests/task-interactions.test.js
git commit -m "feat: add categories and task ordering controls"
```

### Task 7: Render Weekly Calendar, Wire Up User Actions, And Run Smoke Verification

**Files:**
- Modify: `prototype-mvp/styles.css`
- Modify: `prototype-mvp/app.js`
- Create: `prototype-mvp/tests/calendar-view-dom.test.js`

- [ ] **Step 1: Write the failing DOM test for the weekly calendar**

```js
// prototype-mvp/tests/calendar-view-dom.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createInitialState, renderCalendarView } from '../app.js';

describe('calendar view DOM', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
  });

  it('renders a Monday-first weekly grid with seven day columns', () => {
    const state = createInitialState();
    renderCalendarView(state, '2026-04-13T09:00:00.000Z');

    const dayLabels = [...document.querySelectorAll('[data-day-label]')].map((node) =>
      node.textContent.trim()
    );

    expect(dayLabels).toEqual(['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
cd prototype-mvp
npm test -- calendar-view-dom.test.js
```

Expected: FAIL because the calendar view renderer is missing.

- [ ] **Step 3: Implement weekly calendar rendering and finish the event wiring**

```js
// prototype-mvp/app.js
function getWeekStartMonday(nowIso = new Date().toISOString()) {
  const date = new Date(nowIso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function renderCalendarView(state, nowIso = new Date().toISOString()) {
  const root = document.querySelector('#app');
  if (!root) return;

  const monday = new Date(state.ui.currentWeekStart ?? getWeekStartMonday(nowIso));
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <h1>日历视图</h1>
          <p>默认展示一周，允许重叠并排。</p>
        </div>
      </header>
      <section class="calendar-week">
        ${labels
          .map((label, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            return `
              <section class="calendar-day">
                <header>
                  <h2 data-day-label>${label}</h2>
                  <span>${date.getMonth() + 1}/${date.getDate()}</span>
                </header>
                <div class="calendar-day-body" data-day-index="${index}"></div>
              </section>
            `;
          })
          .join('')}
      </section>
    </main>
  `;
}

function openTaskModal() {
  const host = document.querySelector('[data-modal-host]');
  if (!host) return;
  host.innerHTML = `
    <section class="modal">
      <input name="task-title" placeholder="任务标题" />
      <select name="task-category">
        <option value="work">工作</option>
        <option value="study">学习</option>
        <option value="life">生活</option>
        <option value="interest">兴趣</option>
        <option value="fun">娱乐</option>
      </select>
      <button data-action="submit-task">保存任务</button>
    </section>
  `;
}

function readTaskForm() {
  return {
    title: document.querySelector('[name="task-title"]').value,
    categoryId: document.querySelector('[name="task-category"]').value,
    importance: 'medium',
    dueAt: null,
  };
}

function readAbandonReason() {
  return document.querySelector('[name="abandon-reason"]').value.trim();
}

function readManualEntryForm() {
  return {
    title: document.querySelector('[name="manual-title"]').value,
    categoryId: document.querySelector('[name="manual-category"]').value,
    startAt: document.querySelector('[name="manual-start"]').value,
    endAt: document.querySelector('[name="manual-end"]').value,
    notes: document.querySelector('[name="manual-notes"]').value,
  };
}
```

```js
// prototype-mvp/app.js
function setState(updater) {
  state = typeof updater === 'function' ? updater(state) : updater;
  saveState(state);
  if (state.ui.currentView === 'calendar') {
    renderCalendarView(state);
  } else {
    renderApp(state);
  }
}

function bindGlobalEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.view) {
      setState((current) => ({
        ...current,
        ui: { ...current.ui, currentView: button.dataset.view },
      }));
    }

    if (button.dataset.action === 'open-task-modal') {
      openTaskModal();
    }

    if (button.dataset.action === 'submit-task') {
      const draft = readTaskForm();
      setState((current) => addTask(current, draft));
    }

    if (button.dataset.action === 'start-task') {
      setState((current) =>
        syncCalendarEntriesForTask(
          startTask(current, button.dataset.taskId),
          button.dataset.taskId
        )
      );
    }

    if (button.dataset.action === 'direct-complete-task') {
      setState((current) => directCompleteTask(current, button.dataset.taskId));
    }

    if (button.dataset.action === 'finish-task') {
      setState((current) =>
        syncCalendarEntriesForTask(
          finishTask(current, button.dataset.taskId),
          button.dataset.taskId
        )
      );
    }

    if (button.dataset.action === 'abandon-task') {
      const reason = readAbandonReason();
      setState((current) =>
        syncCalendarEntriesForTask(
          abandonTask(current, button.dataset.taskId, new Date().toISOString(), reason),
          button.dataset.taskId
        )
      );
    }

    if (button.dataset.action === 'submit-manual-entry') {
      const draft = readManualEntryForm();
      setState((current) => upsertManualEntry(current, draft));
    }
  });

  window.addEventListener('focus', () => {
    setState((current) => rolloverTasks(current));
  });
}
```

```css
/* prototype-mvp/styles.css */
.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(140px, 1fr));
  gap: 12px;
  align-items: start;
}

.calendar-day {
  min-height: 780px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 18px;
}

.calendar-entry {
  position: absolute;
  border-left: 5px solid var(--category-color, #666);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  padding: 6px 8px;
}

.calendar-entry.is-abandoned {
  color: #8a8a8a;
  text-decoration: line-through;
  border-left-color: #9a9a9a;
}

@media (max-width: 900px) {
  .calendar-week {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run the full test suite and smoke test the UI**

Run:

```powershell
cd prototype-mvp
npm test
python -m http.server 4173
```

Expected:

- `npm test` reports all test files PASS
- Open `http://localhost:4173/prototype-mvp/` and verify:
  - 能新增 Todo
  - 能开始 Doing
  - 能直接完成 Todo
  - 能完成或放弃 Doing
  - 能看到放弃原因
  - 能切到周视图
  - 能手动补记时间段
  - 能看到重叠块并排
  - 移动端窄宽度下页面可操作

- [ ] **Step 5: Commit**

```powershell
git add prototype-mvp/styles.css prototype-mvp/app.js prototype-mvp/tests/calendar-view-dom.test.js
git commit -m "feat: ship self supervision MVP prototype"
```
