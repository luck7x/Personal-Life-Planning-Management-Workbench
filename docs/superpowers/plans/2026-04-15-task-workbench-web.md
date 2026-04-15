# Web 任务工作台改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Web 任务页重构为“左侧辅助栏 + 右侧主工作区 + 右侧详情抽屉”的任务工作台，并补上 `Done -> 归档`、垃圾篓图标入口与归档页。

**Architecture:** 继续沿用当前 `.worktrees/self-supervision-mvp/prototype-mvp` 下的原生 `HTML + CSS + JavaScript + localStorage + Vitest` 原型，不在本轮切换到 React。任务归档采用“仍保留在 `tasks` 数组中，但使用 `status: 'archived'` + 归档键字段”的方案，避免新增第二套实体源。桌面端详情统一使用右侧抽屉；垃圾篓采用图标按钮 + 抽屉；归档页作为新的 `currentView`。

**Tech Stack:** Vanilla HTML/CSS/JS, localStorage, Vitest + JSDOM, `frontend-design`（必用）, `web-artifacts-builder`（仅在前端 worker 判断单文件原型无法承接时启用）, 浏览器 MCP 验证。

---

## Preflight

- 当前真实源码根：`.worktrees/self-supervision-mvp/prototype-mvp`
- 在开始 Task 1 之前，前端 worker **必须** 调用 `frontend-design`
- 若前端 worker 判断需要切换到 React + TypeScript + Tailwind + shadcn/ui 组件化 artifact，先停止执行本计划并回报，由主 agent 改写计划后再推进；否则按当前原生原型栈继续
- 本计划默认 **不** 安装新的前端 skill/plugin

## File Map

- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
  - 负责状态模型、归档键、每日流转、视图路由、任务工作台/归档页渲染、详情抽屉与垃圾篓抽屉交互
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/styles.css`
  - 负责工作台两栏布局、主区/侧栏卡片体系、列内滚动、底部锚点、详情抽屉、垃圾篓图标与归档页视觉层级
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-state.test.js`
  - 覆盖新增任务追加到底部、恢复归档任务、状态字段重置
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/rollover-calendar.test.js`
  - 覆盖 `Todo -> 逾期`、`Done -> archived` 和归档键写入
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js`
  - 覆盖工作台壳层、任务列重组、垃圾篓图标入口、详情抽屉交互
- Create: `.worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js`
  - 覆盖归档页月/周/天分组、点击归档任务、恢复与编辑
- Create: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js`
  - 覆盖两栏式布局、列内滚动、空状态降噪、抽屉层级、旧五列样式被移除

## Chosen Decisions

- `ui.currentView` 扩展为：`tasks | archive | calendar`
- `垃圾篓` 采用右侧抽屉，不做独立页面
- 归档页按 `month -> week -> day -> task` 渲染，使用嵌套 `<details>`；默认“最新月”展开，“周/日”默认折叠
- 在线列表与归档列表的顺序都按时间从旧到新渲染，依靠“默认滚动到底部”强调最新项
- 恢复归档任务时，默认恢复到 `Todo`，并清空 `endedAt/durationMs/archived*` 字段，保留 `lastCompletedAt`

### Task 1: 锁定状态模型与每日归档基础

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-state.test.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/rollover-calendar.test.js`

- [ ] **Step 1: 写失败测试，先锁定追加到底部与归档字段行为**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-state.test.js
it('addTask appends a new todo task to the bottom of the list', () => {
  const initial = createInitialState();
  const withOlderTask = addTask(initial, {
    title: '已有任务',
    createdAt: '2026-04-13T08:00:00.000Z',
  });

  const next = addTask(withOlderTask, {
    title: '最新任务',
    createdAt: '2026-04-13T09:00:00.000Z',
  });

  expect(next.tasks).toHaveLength(2);
  expect(next.tasks[0].title).toBe('已有任务');
  expect(next.tasks[1].title).toBe('最新任务');
});

it('restoreArchivedTask moves an archived task back to todo and clears archive fields', () => {
  const state = createInitialState();
  state.tasks.push({
    id: 'task-archived',
    title: '归档任务',
    status: 'archived',
    categoryId: 'work',
    importance: 'medium',
    createdAt: '2026-04-13T08:00:00.000Z',
    dueAt: null,
    startedAt: '2026-04-13T09:00:00.000Z',
    endedAt: '2026-04-13T09:30:00.000Z',
    durationMs: 1800000,
    abandonReason: '',
    sortOrder: 1,
    archivedAt: '2026-04-14T00:00:00.000Z',
    archiveMonthKey: '2026-04',
    archiveWeekKey: '2026-W16',
    archiveDayKey: '2026-04-13',
    lastCompletedAt: '2026-04-13T09:30:00.000Z',
  });

  const next = restoreArchivedTask(state, 'task-archived');

  expect(next.tasks[0]).toMatchObject({
    id: 'task-archived',
    status: 'todo',
    archivedAt: null,
    archiveMonthKey: null,
    archiveWeekKey: null,
    archiveDayKey: null,
    endedAt: null,
    durationMs: null,
    lastCompletedAt: '2026-04-13T09:30:00.000Z',
  });
});
```

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/rollover-calendar.test.js
it('rolloverTasks archives done tasks from a previous local day', () => {
  const state = app.createInitialState();
  state.tasks.push({
    id: 'task-done-archive',
    title: '昨天做完的任务',
    status: 'done',
    categoryId: 'work',
    importance: 'medium',
    createdAt: '2026-04-13T08:00:00.000Z',
    dueAt: null,
    startedAt: '2026-04-13T09:00:00.000Z',
    endedAt: '2026-04-13T10:00:00.000Z',
    durationMs: 3600000,
    abandonReason: '',
    sortOrder: 1,
  });

  const next = app.rolloverTasks(state, '2026-04-14T08:00:00.000Z');

  expect(next.tasks[0]).toMatchObject({
    status: 'archived',
    archivedAt: '2026-04-14T08:00:00.000Z',
    archiveMonthKey: '2026-04',
    archiveWeekKey: '2026-W16',
    archiveDayKey: '2026-04-13',
    lastCompletedAt: '2026-04-13T10:00:00.000Z',
  });
});
```

- [ ] **Step 2: 运行测试，确认当前实现还不支持这些行为**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-state.test.js tests/rollover-calendar.test.js
```

Expected: FAIL，至少出现 `restoreArchivedTask is not defined`、`expected 最新任务 at index 1`、`expected status "archived"` 错误。

- [ ] **Step 3: 最小实现状态字段、恢复逻辑与每日归档**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/app.js
function normalizeCurrentView(value) {
  return value === 'calendar' || value === 'tasks' || value === 'archive'
    ? value
    : 'tasks';
}

function toArchiveWeekKey(iso) {
  const date = new Date(iso);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function buildArchiveFields(task, archivedAt) {
  const completedAt = task.endedAt ?? archivedAt;
  return {
    archivedAt,
    archiveMonthKey: completedAt.slice(0, 7),
    archiveWeekKey: toArchiveWeekKey(completedAt),
    archiveDayKey: completedAt.slice(0, 10),
    lastCompletedAt: completedAt,
  };
}

export function addTask(state, draft) {
  const next = cloneState(state);
  const createdAt = draft.createdAt ?? new Date().toISOString();

  next.tasks.push({
    id: createId('task'),
    title: draft.title.trim(),
    status: 'todo',
    categoryId: draft.categoryId ?? 'life',
    importance: draft.importance ?? 'medium',
    createdAt,
    dueAt: draft.dueAt ?? null,
    startedAt: null,
    endedAt: null,
    durationMs: null,
    abandonReason: '',
    sortOrder: Date.now(),
    archivedAt: null,
    archiveMonthKey: null,
    archiveWeekKey: null,
    archiveDayKey: null,
    lastCompletedAt: null,
  });

  return next;
}

export function restoreArchivedTask(state, taskId) {
  return updateTask(state, taskId, (task) => {
    task.status = 'todo';
    task.endedAt = null;
    task.durationMs = null;
    task.archivedAt = null;
    task.archiveMonthKey = null;
    task.archiveWeekKey = null;
    task.archiveDayKey = null;
  });
}

export function rolloverTasks(state, nowIso = new Date().toISOString()) {
  const next = cloneState(state);
  const nowMs = new Date(nowIso).getTime();

  next.tasks = next.tasks.map((task) => {
    if (task.status === 'done' && task.endedAt && !isSameLocalDate(task.endedAt, nowIso)) {
      return {
        ...task,
        status: 'archived',
        ...buildArchiveFields(task, nowIso),
      };
    }

    if (task.status !== 'todo') {
      return task;
    }

    const createdOnDifferentDay = !isSameLocalDate(task.createdAt, nowIso);
    const dueExpired =
      task.dueAt !== null &&
      task.dueAt !== undefined &&
      task.dueAt !== '' &&
      !Number.isNaN(nowMs) &&
      new Date(task.dueAt).getTime() < nowMs;

    if (!createdOnDifferentDay && !dueExpired) {
      return task;
    }

    return {
      ...task,
      status: 'overdue',
    };
  });

  return next;
}
```

- [ ] **Step 4: 重新运行状态与 rollover 测试**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-state.test.js tests/rollover-calendar.test.js
```

Expected: PASS，两个测试文件全部通过。

- [ ] **Step 5: 提交状态模型基础**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/tests/task-state.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/rollover-calendar.test.js
git commit -m "feat: add archive state and rollover foundations"
```

### Task 2: 重建工作台壳层与归档页路由

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js`
- Create: `.worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js`

- [ ] **Step 1: 写失败测试，锁定新的顶层结构与 archive 视图**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js
it('renders workbench navigation, left rail, main lanes, and trash icon instead of five flat sections', async () => {
  const { createInitialState, renderApp } = await loadFreshAppModule();
  const state = createInitialState();

  renderApp(state);

  const viewButtons = [...document.querySelectorAll('.view-switcher [data-view]')]
    .map((node) => node.textContent.trim());
  const laneTitles = [...document.querySelectorAll('[data-task-lane-title]')]
    .map((node) => node.textContent.trim());
  const railTitles = [...document.querySelectorAll('[data-task-rail-title]')]
    .map((node) => node.textContent.trim());

  expect(viewButtons).toEqual(['任务', '归档', '日历']);
  expect(railTitles).toEqual(['备忘', '逾期']);
  expect(laneTitles).toEqual(['Todo', 'Doing', 'Done']);
  expect(document.querySelector('[data-action="open-trash-drawer"]')).not.toBeNull();
  expect(document.querySelector('[data-section-title="垃圾篓"]')).toBeNull();
});
```

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js
import { beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createInitialState, renderApp } from '../app.js';

describe('archive view DOM', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><div id="app"></div><div id="modal-host"></div>', {
      url: 'http://localhost/',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
  });

  it('renders archive groups by month, week, and day', () => {
    const state = createInitialState();
    state.ui.currentView = 'archive';
    state.tasks.push({
      id: 'task-archived-1',
      title: '归档任务',
      status: 'archived',
      categoryId: 'work',
      importance: 'medium',
      createdAt: '2026-04-13T08:00:00.000Z',
      dueAt: null,
      startedAt: '2026-04-13T09:00:00.000Z',
      endedAt: '2026-04-13T09:30:00.000Z',
      durationMs: 1800000,
      abandonReason: '',
      sortOrder: 1,
      archivedAt: '2026-04-14T08:00:00.000Z',
      archiveMonthKey: '2026-04',
      archiveWeekKey: '2026-W16',
      archiveDayKey: '2026-04-13',
      lastCompletedAt: '2026-04-13T09:30:00.000Z',
    });

    renderApp(state);

    expect(document.querySelector('[data-archive-month="2026-04"]')).not.toBeNull();
    expect(document.querySelector('[data-archive-week="2026-W16"]')).not.toBeNull();
    expect(document.querySelector('[data-archive-day="2026-04-13"]')).not.toBeNull();
    expect(document.querySelector('[data-archive-task-id="task-archived-1"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行 DOM 测试，确认当前路由和壳层都不满足**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js tests/archive-view-dom.test.js
```

Expected: FAIL，至少出现 `viewButtons` 只含 `任务/日历`、`data-task-lane-title` 缺失、`archive view` 不存在等错误。

- [ ] **Step 3: 实现新的任务工作台与归档页渲染骨架**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/app.js
function groupArchivedTasks(tasks) {
  const archived = tasks.filter((task) => task.status === 'archived');
  const months = new Map();

  for (const task of archived) {
    if (!months.has(task.archiveMonthKey)) {
      months.set(task.archiveMonthKey, new Map());
    }
    const weeks = months.get(task.archiveMonthKey);
    if (!weeks.has(task.archiveWeekKey)) {
      weeks.set(task.archiveWeekKey, new Map());
    }
    const days = weeks.get(task.archiveWeekKey);
    if (!days.has(task.archiveDayKey)) {
      days.set(task.archiveDayKey, []);
    }
    days.get(task.archiveDayKey).push(task);
  }

  return months;
}

function renderTaskWorkbench(state, taskGroups, nowIso) {
  return `
    <section class="task-workbench" aria-label="任务工作台">
      <aside class="task-rail" data-task-rail>
        <header class="task-rail__header">
          <div>
            <p class="page-eyebrow">Task Workbench</p>
            <h2>今天只处理任务流转</h2>
          </div>
          <button type="button" data-action="open-trash-drawer" aria-label="打开垃圾篓">🗑</button>
        </header>
        <section class="task-rail__section" data-task-rail-section="memo">
          <h3 data-task-rail-title>备忘</h3>
          <div class="task-list" data-task-list="memo">
            ${(taskGroups.get('memo') ?? []).map((task) => renderRailTaskCard(task, state.categories, nowIso)).join('')}
          </div>
        </section>
        <section class="task-rail__section" data-task-rail-section="overdue">
          <h3 data-task-rail-title>逾期</h3>
          <div class="task-list" data-task-list="overdue">
            ${(taskGroups.get('overdue') ?? []).map((task) => renderRailTaskCard(task, state.categories, nowIso)).join('')}
          </div>
        </section>
      </aside>
      <section class="task-main" data-task-main>
        ${['todo', 'doing', 'done'].map((key) => renderTaskLane(key, taskGroups.get(key) ?? [], state.categories, nowIso)).join('')}
      </section>
    </section>
  `;
}

function renderArchivePage(state) {
  const months = groupArchivedTasks(state.tasks);
  return `
    <section class="archive-page" aria-label="任务归档">
      ${[...months.entries()].map(([monthKey, weeks], monthIndex, monthList) => `
        <details class="archive-month" data-archive-month="${monthKey}" ${monthIndex === monthList.length - 1 ? 'open' : ''}>
          <summary>${monthKey}</summary>
          ${[...weeks.entries()].map(([weekKey, days]) => `
            <details class="archive-week" data-archive-week="${weekKey}">
              <summary>${weekKey}</summary>
              ${[...days.entries()].map(([dayKey, tasks]) => `
                <details class="archive-day" data-archive-day="${dayKey}">
                  <summary>${dayKey}</summary>
                  <div class="archive-task-list">
                    ${tasks.map((task) => renderArchiveTaskCard(task, state.categories)).join('')}
                  </div>
                </details>
              `).join('')}
            </details>
          `).join('')}
        </details>
      `).join('')}
    </section>
  `;
}

function renderApp(state, nowIso = new Date().toISOString()) {
  const currentView = state.ui?.currentView ?? 'tasks';
  const taskGroups = new Map([
    ['memo', state.tasks.filter((task) => task.status === 'memo')],
    ['overdue', state.tasks.filter((task) => task.status === 'overdue')],
    ['todo', state.tasks.filter((task) => task.status === 'todo')],
    ['doing', state.tasks.filter((task) => task.status === 'doing')],
    ['done', state.tasks.filter((task) => task.status === 'done')],
  ]);

  root.innerHTML = `
    <main class="shell" data-view="${currentView}">
      <header class="topbar">
        <div>
          <h1>监督反思 MVP</h1>
          <p>允许娱乐，但要看见时间流向。</p>
        </div>
        <nav class="view-switcher" aria-label="主视图切换">
          <button type="button" class="${currentView === 'tasks' ? 'is-active' : ''}" data-view="tasks">任务</button>
          <button type="button" class="${currentView === 'archive' ? 'is-active' : ''}" data-view="archive">归档</button>
          <button type="button" class="${currentView === 'calendar' ? 'is-active' : ''}" data-view="calendar">日历</button>
        </nav>
      </header>
      ${currentView === 'archive'
        ? renderArchivePage(state)
        : currentView === 'calendar'
          ? renderCalendarPage(state, nowIso)
          : renderTaskWorkbench(state, taskGroups, nowIso)}
    </main>
  `;
}
```

- [ ] **Step 4: 重新运行工作台与归档页 DOM 测试**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js tests/archive-view-dom.test.js
```

Expected: PASS，顶层壳层与 archive 路由测试通过。

- [ ] **Step 5: 提交壳层重构**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js
git commit -m "feat: add task workbench shell and archive route"
```

### Task 3: 落两栏布局、列内滚动与样式契约

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/styles.css`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
- Create: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js`

- [ ] **Step 1: 写失败的样式契约测试，锁定两栏布局与旧五列退出**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('task style contract', () => {
  it('uses a two-column workbench with a fixed rail and a flexible main area', () => {
    expect(styles).toMatch(/\.task-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*320px\)\s*minmax\(0,\s*1fr\);/);
    expect(styles).toMatch(/\.task-main\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  });

  it('keeps list scrolling inside each lane instead of forcing one tall page', () => {
    expect(styles).toMatch(/\.task-list\s*\{[\s\S]*overflow-y:\s*auto;/);
    expect(styles).toMatch(/\.task-lane\s*\{[\s\S]*min-height:\s*0;/);
    expect(styles).not.toMatch(/\.task-sections\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,/);
  });

  it('uses a drawer above the page chrome and keeps empty states light', () => {
    expect(styles).toMatch(/\.task-drawer\s*\{[\s\S]*position:\s*fixed;/);
    expect(styles).toMatch(/\.task-drawer\s*\{[\s\S]*z-index:\s*140;/);
    expect(styles).toMatch(/\.task-list:empty::after\s*\{[\s\S]*border:\s*1px dashed/);
  });
});
```

- [ ] **Step 2: 运行样式测试，确认旧布局仍然存在**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-style-contract.test.js
```

Expected: FAIL，当前样式仍包含 `.task-sections` 五列布局，且没有 `.task-workbench` / `.task-drawer`。

- [ ] **Step 3: 实现两栏布局、卡片层级与底部锚点 helper**

```css
/* .worktrees/self-supervision-mvp/prototype-mvp/styles.css */
.shell[data-view="tasks"] {
  max-width: 1680px;
}

.task-workbench {
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  gap: 20px;
  min-height: calc(100vh - 148px);
}

.task-rail,
.task-main,
.task-lane,
.task-rail__section,
.task-drawer__panel {
  min-height: 0;
}

.task-main {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.task-list:empty::after {
  content: '拖入任务或新建';
  display: grid;
  place-items: center;
  min-height: 72px;
  border: 1px dashed rgba(31, 35, 40, 0.16);
  border-radius: 12px;
  color: rgba(31, 35, 40, 0.48);
  background: rgba(255, 255, 255, 0.45);
}

.task-card--rail {
  padding: 12px;
  border-radius: 12px;
}

.task-card--main {
  padding: 14px 14px 12px;
  border-radius: 14px;
}

.task-drawer {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  justify-items: end;
}
```

```js
// .worktrees/self-supervision-mvp/prototype-mvp/app.js
function scrollTaskListsToBottom() {
  document.querySelectorAll('[data-task-list]').forEach((node) => {
    node.scrollTop = node.scrollHeight;
  });
}

export function renderApp(state, nowIso = new Date().toISOString()) {
  const currentView = state.ui?.currentView ?? 'tasks';
  const taskGroups = new Map([
    ['memo', state.tasks.filter((task) => task.status === 'memo')],
    ['overdue', state.tasks.filter((task) => task.status === 'overdue')],
    ['todo', state.tasks.filter((task) => task.status === 'todo')],
    ['doing', state.tasks.filter((task) => task.status === 'doing')],
    ['done', state.tasks.filter((task) => task.status === 'done')],
  ]);

  root.innerHTML = `
    <main class="shell" data-view="${currentView}">
      ${currentView === 'archive'
        ? renderArchivePage(state)
        : currentView === 'calendar'
          ? renderCalendarPage(state, nowIso)
          : renderTaskWorkbench(state, taskGroups, nowIso)}
    </main>
  `;

  renderModalHost(state, nowIso);
  if (currentView === 'tasks') {
    queueMicrotask(() => scrollTaskListsToBottom());
  }
}
```

- [ ] **Step 4: 重新运行样式契约与相关 DOM 测试**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-style-contract.test.js tests/task-view-dom.test.js
```

Expected: PASS，样式契约通过，工作台 DOM 测试仍然通过。

- [ ] **Step 5: 提交布局与样式基础**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/styles.css .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js
git commit -m "feat: restyle task view into a workbench layout"
```

### Task 4: 用右侧抽屉替代任务详情 modal

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/styles.css`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js`

- [ ] **Step 1: 写失败测试，锁定抽屉交互与单任务上下文**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js
it('opens a task drawer with summary, edit fields, and allowed actions when clicking a task card', async () => {
  const { STORAGE_KEY, bootstrap, createInitialState } = await loadFreshAppModule();
  const persistedState = createInitialState();

  persistedState.tasks = [
    {
      id: 'task-drawer-todo',
      title: '抽屉任务',
      status: 'todo',
      categoryId: 'work',
      importance: 'medium',
      createdAt: '2026-04-14T08:00:00.000Z',
      dueAt: '2026-04-14T21:30:00.000Z',
      startedAt: null,
      endedAt: null,
      durationMs: null,
      abandonReason: '',
      sortOrder: 1,
      archivedAt: null,
      archiveMonthKey: null,
      archiveWeekKey: null,
      archiveDayKey: null,
      lastCompletedAt: null,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));

  bootstrap('2026-04-14T09:00:00.000Z');

  document.querySelector('[data-task-id="task-drawer-todo"]')?.click();

  expect(document.querySelector('[data-task-drawer]')).not.toBeNull();
  expect(document.querySelector('[data-task-drawer-title]')?.textContent).toContain('抽屉任务');
  expect(document.querySelector('[data-task-drawer] [name="title"]')).not.toBeNull();
  expect(document.querySelector('[data-action="start-task"]')).not.toBeNull();
  expect(document.querySelector('[data-action="direct-complete-task"]')).not.toBeNull();
});
```

- [ ] **Step 2: 运行 DOM 测试，确认现在仍是 modal 语义**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js
```

Expected: FAIL，当前实现仍渲染 modal 按钮组，不存在 `[data-task-drawer]`。

- [ ] **Step 3: 实现抽屉状态、渲染与编辑交互**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/app.js
function createTaskDrawerState(taskId, draft = {}) {
  return {
    type: 'task-drawer',
    taskId,
    draft,
    error: '',
  };
}

function renderTaskDrawer(state) {
  const panel = state.ui.activePanel;
  if (!panel || panel.type !== 'task-drawer') {
    return '';
  }

  const task = state.tasks.find((item) => item.id === panel.taskId);
  if (!task) {
    return '';
  }

  return `
    <section class="task-drawer" data-task-drawer>
      <div class="task-drawer__backdrop" data-action="close-panel"></div>
      <aside class="task-drawer__panel">
        <header class="task-drawer__header">
          <p class="page-eyebrow">Task Detail</p>
          <h2 data-task-drawer-title>${escapeHtml(task.title)}</h2>
          <button type="button" data-action="close-panel" aria-label="关闭详情">×</button>
        </header>
        <section class="task-drawer__summary">
          <p>状态：${task.status}</p>
          <p>分类：${getCategoryMeta(state.categories, task.categoryId).name}</p>
        </section>
        <form class="task-drawer__form" data-task-drawer-form>
          <label>标题<input name="title" value="${escapeHtml(task.title)}" /></label>
          <label>分类${renderCategorySelect(state.categories, task.categoryId)}</label>
          <label>备注<textarea name="notes">${escapeHtml(task.notes ?? '')}</textarea></label>
        </form>
        <div class="task-drawer__actions">
          ${renderTaskDrawerActions(task)}
        </div>
      </aside>
    </section>
  `;
}
```

```css
/* .worktrees/self-supervision-mvp/prototype-mvp/styles.css */
.task-card.is-selected {
  border-color: rgba(31, 35, 40, 0.18);
  box-shadow: 0 10px 24px rgba(31, 35, 40, 0.08);
}

.task-drawer__panel {
  width: min(420px, 100vw);
  height: 100%;
  background: #fffdf9;
  border-left: 1px solid rgba(31, 35, 40, 0.08);
  box-shadow: -12px 0 32px rgba(31, 35, 40, 0.12);
  padding: 20px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 16px;
}
```

- [ ] **Step 4: 重新运行任务 DOM 测试**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js
```

Expected: PASS，点击任务后进入抽屉，切换任务时抽屉内容同步切换。

- [ ] **Step 5: 提交详情抽屉改造**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/styles.css .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js
git commit -m "feat: replace task modal with a right-side drawer"
```

### Task 5: 实现垃圾篓抽屉、归档详情与恢复编辑链路

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/app.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/styles.css`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js`

- [ ] **Step 1: 写失败测试，锁定垃圾篓入口和归档任务交互**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js
it('opens a trash drawer from the icon button and renders trashed tasks there', async () => {
  const { STORAGE_KEY, bootstrap, createInitialState } = await loadFreshAppModule();
  const persistedState = createInitialState();
  persistedState.tasks = [
    {
      id: 'task-trash-1',
      title: '被丢弃的任务',
      status: 'trash',
      categoryId: 'life',
      importance: 'medium',
      createdAt: '2026-04-14T08:00:00.000Z',
      dueAt: null,
      startedAt: '2026-04-14T08:30:00.000Z',
      endedAt: '2026-04-14T09:00:00.000Z',
      durationMs: 1800000,
      abandonReason: '不做了',
      sortOrder: 1,
      archivedAt: null,
      archiveMonthKey: null,
      archiveWeekKey: null,
      archiveDayKey: null,
      lastCompletedAt: null,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));

  bootstrap('2026-04-14T09:00:00.000Z');
  document.querySelector('[data-action="open-trash-drawer"]')?.click();

  expect(document.querySelector('[data-trash-drawer]')).not.toBeNull();
  expect(document.querySelector('[data-trash-drawer]')?.textContent).toContain('被丢弃的任务');
});
```

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js
it('opens an archived task in the drawer and restores it back to todo', () => {
  const state = createInitialState();
  state.ui.currentView = 'archive';
  state.tasks.push({
    id: 'task-archived-restore',
    title: '可恢复归档任务',
    status: 'archived',
    categoryId: 'study',
    importance: 'medium',
    createdAt: '2026-04-13T08:00:00.000Z',
    dueAt: null,
    startedAt: '2026-04-13T09:00:00.000Z',
    endedAt: '2026-04-13T10:00:00.000Z',
    durationMs: 3600000,
    abandonReason: '',
    sortOrder: 1,
    archivedAt: '2026-04-14T08:00:00.000Z',
    archiveMonthKey: '2026-04',
    archiveWeekKey: '2026-W16',
    archiveDayKey: '2026-04-13',
    lastCompletedAt: '2026-04-13T10:00:00.000Z',
  });

  renderApp(state);
  document.querySelector('[data-archive-task-id="task-archived-restore"]')?.click();
  document.querySelector('[data-action="restore-archived-task"]')?.click();

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  expect(saved.tasks[0]).toMatchObject({
    id: 'task-archived-restore',
    status: 'todo',
    archivedAt: null,
  });
});
```

- [ ] **Step 2: 运行垃圾篓与 archive 测试，确认入口和恢复链路都缺失**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js tests/archive-view-dom.test.js
```

Expected: FAIL，当前没有 `[data-trash-drawer]`、没有 archive 任务恢复按钮。

- [ ] **Step 3: 实现垃圾篓抽屉和归档任务操作**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/app.js
function renderTrashDrawer(state) {
  const panel = state.ui.activePanel;
  if (!panel || panel.type !== 'trash-drawer') {
    return '';
  }

  const trashTasks = state.tasks.filter((task) => task.status === 'trash');
  return `
    <section class="task-drawer" data-trash-drawer>
      <div class="task-drawer__backdrop" data-action="close-panel"></div>
      <aside class="task-drawer__panel">
        <header class="task-drawer__header">
          <h2>垃圾篓</h2>
          <button type="button" data-action="close-panel">×</button>
        </header>
        <div class="task-list" data-task-list="trash">
          ${trashTasks.map((task) => renderTrashTaskCard(task, state.categories)).join('')}
        </div>
      </aside>
    </section>
  `;
}

function renderArchiveTaskCard(task, categories) {
  const category = getCategoryMeta(categories, task.categoryId);
  return `
    <article class="task-card task-card--main" data-task-id="${task.id}" data-archive-task-id="${task.id}" style="--category-color:${category.color}">
      <p>${escapeHtml(task.title)}</p>
      <span class="task-card__meta">${category.name}</span>
      <span class="task-card__meta">${task.archiveDayKey}</span>
    </article>
  `;
}

// event reducer branch
if (action === 'open-trash-drawer') {
  next.ui.activePanel = { type: 'trash-drawer' };
}

if (action === 'restore-archived-task') {
  const taskId = state.ui.activePanel?.taskId;
  const restored = restoreArchivedTask(next, taskId);
  next.tasks = restored.tasks;
  next.ui.currentView = 'tasks';
  next.ui.activePanel = null;
}
```

- [ ] **Step 4: 重新运行工作台与 archive DOM 测试**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-view-dom.test.js tests/archive-view-dom.test.js
```

Expected: PASS，垃圾篓入口和归档恢复链路通过。

- [ ] **Step 5: 提交垃圾篓与归档交互**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/styles.css .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js
git commit -m "feat: add trash drawer and archive interactions"
```

### Task 6: 全量回归、浏览器验收与收尾

**Files:**
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js`
- Modify: `.worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js`

- [ ] **Step 1: 补齐最后一轮断言，覆盖抽屉切换、底部优先和归档页面默认展开**

```js
// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js
expect(document.querySelector('[data-task-list="todo"]')?.lastElementChild?.textContent).toContain('最新任务');

// .worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js
expect(styles).toMatch(/\.archive-month\[open\]/);

// .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js
expect(document.querySelector('[data-task-drawer]')).not.toBeNull();
```

- [ ] **Step 2: 跑目标测试集，确认任务工作台链路收敛**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test -- tests/task-state.test.js tests/rollover-calendar.test.js tests/task-view-dom.test.js tests/archive-view-dom.test.js tests/task-style-contract.test.js
```

Expected: PASS，目标测试集全部通过。

- [ ] **Step 3: 跑全量测试，确认没有打坏日历链路**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm test
```

Expected: PASS，Vitest 全量通过。

- [ ] **Step 4: 启动本地页面并做浏览器验收**

```powershell
cd .worktrees/self-supervision-mvp/prototype-mvp
npm run serve
```

Expected browser checklist:

- 任务首页进入后是左侧 `备忘/逾期` + 右侧 `Todo/Doing/Done`
- `垃圾篓` 是图标按钮，不再是第六块常驻区
- 新任务进入底部，列内滚动优先停在底部
- 点击任务打开右侧抽屉，切换任务时抽屉内容跟着切换
- `Done` 跨日后不再留在主工作台，而是出现在 `归档`
- `归档` 页能按月 / 周 / 天展开并恢复任务到 `Todo`

- [ ] **Step 5: 提交最终实现**

```bash
git add .worktrees/self-supervision-mvp/prototype-mvp/app.js .worktrees/self-supervision-mvp/prototype-mvp/styles.css .worktrees/self-supervision-mvp/prototype-mvp/tests/task-state.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/rollover-calendar.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/task-view-dom.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/archive-view-dom.test.js .worktrees/self-supervision-mvp/prototype-mvp/tests/task-style-contract.test.js
git commit -m "feat: rebuild web task workbench with archive flow"
```

## Self-Review

### Spec coverage

- 工作台两栏结构：Task 2 + Task 3
- 垃圾篓图标入口：Task 2 + Task 5
- 卡片默认轻量 + 抽屉承接操作：Task 4
- 列内滚动 + 底部优先：Task 3 + Task 6
- `Done -> 归档`：Task 1
- 归档页月 / 周 / 天：Task 2 + Task 5
- 归档任务编辑/恢复：Task 4 + Task 5
- 前端 skill 约束：Preflight

### Placeholder scan

- 未使用 `TBD` / `TODO` / “后续实现” 之类占位措辞
- 每个代码变更步骤均给出明确代码片段
- 每个测试步骤均给出明确命令和预期

### Type consistency

- 视图枚举统一为 `tasks | archive | calendar`
- 归档字段统一为 `archivedAt / archiveMonthKey / archiveWeekKey / archiveDayKey / lastCompletedAt`
- 详情容器统一称为 `task-drawer`
