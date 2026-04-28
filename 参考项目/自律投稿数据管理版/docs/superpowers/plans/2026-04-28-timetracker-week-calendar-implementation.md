# TimeTracker Week Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TimeTracker-style weekly time-tracking calendar inside the existing single-file HTML app.

**Architecture:** Keep the existing single HTML file and localStorage state. Replace the current `calendar-section` presentation with a scoped weekly grid while reusing `state.timeBlocks`, `state.focus.active`, `state.focus.sessions`, `state.tasks`, and `state.submissions`. Add small pure calendar helper functions for week navigation, event layout, and timer state transitions.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Tailwind CDN already present, Font Awesome already present, browser localStorage, lightweight Node smoke tests for extracted pure helper behavior.

---

## File Structure

- Modify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\博士工作台_自律投稿数据管理版.html`
  - Update `calendar-section` DOM.
  - Add scoped `time-week-*` CSS.
  - Add weekly calendar helper functions.
  - Extend task status flow with `doing`.
  - Update rendering and event binding.
- Create: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs`
  - Node-only tests for date and layout calculations mirrored from the HTML helpers.

## Task 1: Pure Helper Tests First

**Files:**
- Create: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs`

- [ ] **Step 1: Write the failing test**

Create the file with this complete content:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const DAY_MS = 24 * 60 * 60 * 1000;

function localDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekStartMonday(date) {
  const value = localDate(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return formatDate(value);
}

function weekDays(date) {
  const start = localDate(weekStartMonday(date));
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start.getTime() + index * DAY_MS);
    return formatDate(value);
  });
}

function minutesOfDay(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function positionBlock(start, end, dayStart = 7 * 60, dayEnd = 23 * 60) {
  const startMinute = Math.max(dayStart, minutesOfDay(start));
  const endMinute = Math.min(dayEnd, minutesOfDay(end));
  const span = dayEnd - dayStart;
  const top = ((startMinute - dayStart) / span) * 100;
  const height = Math.max(((endMinute - startMinute) / span) * 100, 3.5);
  return {
    top: Number(top.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
}

function assignLanes(blocks) {
  const lanes = [];
  return blocks
    .map((block) => ({
      ...block,
      startMinute: minutesOfDay(block.start),
      endMinute: minutesOfDay(block.end),
    }))
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
    .map((block) => {
      let laneIndex = lanes.findIndex((laneEnd) => laneEnd <= block.startMinute);
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push(block.endMinute);
      } else {
        lanes[laneIndex] = block.endMinute;
      }
      return {
        id: block.id,
        laneIndex,
        laneCount: lanes.length,
      };
    });
}

test('weekStartMonday returns Monday for dates inside the same week', () => {
  assert.equal(weekStartMonday('2026-04-29'), '2026-04-27');
  assert.equal(weekStartMonday('2026-05-03'), '2026-04-27');
});

test('weekDays returns seven contiguous dates from Monday to Sunday', () => {
  assert.deepEqual(weekDays('2026-04-29'), [
    '2026-04-27',
    '2026-04-28',
    '2026-04-29',
    '2026-04-30',
    '2026-05-01',
    '2026-05-02',
    '2026-05-03',
  ]);
});

test('positionBlock maps time range into the visible calendar span', () => {
  assert.deepEqual(positionBlock('09:00', '10:30'), {
    top: 12.5,
    height: 9.38,
  });
});

test('assignLanes separates overlapping blocks and reuses free lanes', () => {
  assert.deepEqual(assignLanes([
    { id: 'a', start: '09:00', end: '10:00' },
    { id: 'b', start: '09:30', end: '10:30' },
    { id: 'c', start: '10:30', end: '11:00' },
  ]), [
    { id: 'a', laneIndex: 0, laneCount: 1 },
    { id: 'b', laneIndex: 1, laneCount: 2 },
    { id: 'c', laneIndex: 0, laneCount: 2 },
  ]);
});
```

- [ ] **Step 2: Run test to verify it currently passes as baseline helper specification**

Run:

```powershell
node "D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs"
```

Expected: all 4 tests pass. These tests define the exact helper behavior the HTML implementation must match.

## Task 2: Weekly Calendar DOM and Styling

**Files:**
- Modify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\博士工作台_自律投稿数据管理版.html`

- [ ] **Step 1: Replace `calendar-section` DOM**

Replace the existing `calendar-section` contents with:

```html
<section id="calendar-section" class="section">
  <div class="time-week-shell">
    <div class="time-week-main">
      <div class="time-week-toolbar">
        <div>
          <div class="time-week-kicker">Time Tracker Calendar</div>
          <button id="weekPickerBtn" class="time-week-title" type="button">
            <span id="weekRangeTitle">本周</span>
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
        <div class="time-week-actions">
          <button id="prevWeekBtn" type="button" class="time-week-icon-btn" title="上一周"><i class="fa-solid fa-chevron-left"></i></button>
          <button id="thisWeekBtn" type="button" class="time-week-pill-btn">本周</button>
          <button id="nextWeekBtn" type="button" class="time-week-icon-btn" title="下一周"><i class="fa-solid fa-chevron-right"></i></button>
          <button id="quickAddBlockBtn" type="button" class="time-week-primary-btn"><i class="fa-solid fa-plus"></i> 补记</button>
        </div>
      </div>
      <div id="timeWeekGrid" class="time-week-grid" aria-label="周时间追踪视图"></div>
    </div>

    <aside class="time-week-side">
      <section class="time-week-panel">
        <div class="time-week-panel-label">Timer</div>
        <div id="weekTimerRing" class="time-week-timer-ring">
          <div>
            <div id="weekTimerDisplay" class="time-week-timer-value">00:00:00</div>
            <div id="weekTimerTask" class="time-week-timer-task">暂无进行中的任务</div>
          </div>
        </div>
        <div class="time-week-timer-actions">
          <button id="finishDoingTaskBtn" type="button" class="time-week-primary-btn">完成当前任务</button>
          <button id="cancelDoingTaskBtn" type="button" class="time-week-pill-btn">撤回</button>
        </div>
      </section>

      <section class="time-week-panel">
        <div class="time-week-panel-header">
          <div>
            <div class="time-week-panel-label">Stats</div>
            <h3>本周统计</h3>
          </div>
          <strong id="weekTotalText">0 分钟</strong>
        </div>
        <div id="weekCategoryStats" class="time-week-stat-list"></div>
      </section>

      <section class="time-week-panel">
        <div class="time-week-panel-header">
          <div>
            <div class="time-week-panel-label">Details</div>
            <h3 id="weekSelectedDateTitle">今天明细</h3>
          </div>
        </div>
        <div id="weekDayDetails" class="time-week-detail-list"></div>
      </section>
    </aside>
  </div>

  <div id="quickBlockForm" class="time-week-form" hidden>
    <div class="time-week-form-grid">
      <input id="blockDate" type="date" class="time-week-input">
      <input id="blockStart" type="time" class="time-week-input">
      <input id="blockEnd" type="time" class="time-week-input">
      <select id="blockCategory" class="time-week-input">
        <option value="study">学习</option>
        <option value="research">科研</option>
        <option value="writing">写作</option>
        <option value="meeting">会议</option>
        <option value="exercise">运动</option>
        <option value="meal">吃饭</option>
        <option value="rest">休息</option>
        <option value="life">生活杂务</option>
      </select>
      <input id="blockTitle" type="text" placeholder="例如：改摘要 / 跑仿真 / 组会" class="time-week-input time-week-form-title">
      <textarea id="blockNotes" rows="2" placeholder="备注（可选）" class="time-week-input time-week-form-notes"></textarea>
      <button id="addBlockBtn" class="time-week-primary-btn" type="button">添加到日历</button>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Add scoped `time-week-*` CSS**

Add CSS near the existing `<style>` block. Use only `time-week-*` selectors. Include layout, glass panels, weekly grid, block cards, compact block cards, timer ring, stat list, details, and mobile fallback.

- [ ] **Step 3: Manual structure check**

Open the HTML file in a browser after implementation. Expected: the calendar section has no nested cards inside cards, toolbar is visible, grid and side panels do not overlap at desktop width.

## Task 3: Calendar Helper Functions and Weekly Rendering

**Files:**
- Modify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\博士工作台_自律投稿数据管理版.html`
- Test: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs`

- [ ] **Step 1: Run helper tests before production edits**

Run:

```powershell
node "D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs"
```

Expected: PASS.

- [ ] **Step 2: Add JavaScript helpers**

Add helpers matching the test behavior:

```js
const WEEK_DAY_LABELS = ['周一','周二','周三','周四','周五','周六','周日'];
const WEEK_VISIBLE_START = 7 * 60;
const WEEK_VISIBLE_END = 23 * 60;
let weekCursor = null;
let selectedWeekDate = null;

function dateFromYmd(date) { const [y,m,d] = date.split('-').map(Number); return new Date(y, m - 1, d); }
function ymdFromDate(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function getWeekStartMonday(date = todayStr()) { const value = dateFromYmd(date); const day = value.getDay() || 7; value.setDate(value.getDate() - day + 1); return ymdFromDate(value); }
function getWeekDates(date = todayStr()) { const start = dateFromYmd(getWeekStartMonday(date)); return Array.from({length:7}, (_, i) => ymdFromDate(new Date(start.getTime() + i * 86400000))); }
function shiftWeek(date, delta) { const value = dateFromYmd(getWeekStartMonday(date)); value.setDate(value.getDate() + delta * 7); return ymdFromDate(value); }
function minutesOfDay(value) { const [h,m] = value.split(':').map(Number); return h * 60 + m; }
function positionWeekBlock(start, end) { const startMinute = Math.max(WEEK_VISIBLE_START, minutesOfDay(start)); const endMinute = Math.min(WEEK_VISIBLE_END, minutesOfDay(end)); const span = WEEK_VISIBLE_END - WEEK_VISIBLE_START; return { top: ((startMinute - WEEK_VISIBLE_START) / span) * 100, height: Math.max(((endMinute - startMinute) / span) * 100, 3.5) }; }
```

- [ ] **Step 3: Aggregate week events**

Create one function that returns entries from `timeBlocks` and `focus.sessions`. It must not mutate state.

- [ ] **Step 4: Render weekly grid**

Implement `renderTimeWeekGrid()` and call it from `renderCalendarSection()`. Use absolute-positioned blocks inside each day column.

- [ ] **Step 5: Run helper tests again**

Run:

```powershell
node "D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs"
```

Expected: PASS.

## Task 4: Task Status Driven Timer

**Files:**
- Modify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\博士工作台_自律投稿数据管理版.html`

- [ ] **Step 1: Extend task status rendering**

Update task list rendering so todo tasks can start, doing tasks can finish or return to todo, and done tasks remain visible in the completed list.

- [ ] **Step 2: Add status transition helpers**

Add helpers:

```js
function startTaskTimer(taskId) { /* set task.status = 'doing'; set state.focus.active */ }
function finishDoingTask(taskId) { /* compute elapsed minutes; push state.focus.sessions; set task.status = 'done' */ }
function cancelDoingTask(taskId) { /* confirm; clear active; set task.status = 'todo' */ }
function activeDoingTask() { return state.tasks.find(t => t.status === 'doing') || null; }
```

The implementation must enforce only one doing task at a time.

- [ ] **Step 3: Wire right-side Timer buttons**

Bind `finishDoingTaskBtn` and `cancelDoingTaskBtn` to the current doing task. Hidden or disabled behavior is acceptable when no task is active.

- [ ] **Step 4: Preserve existing focus timer compatibility**

Existing `startFocus()` and `stopFocus()` must still work. If a task-driven timer is active, manual focus start should alert the user instead of overwriting it.

## Task 5: Integration Verification and Review

**Files:**
- Verify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\博士工作台_自律投稿数据管理版.html`
- Verify: `D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs`

- [ ] **Step 1: Run Node helper tests**

Run:

```powershell
node "D:\lucky\Supplies\个人\APP\监督反思\参考项目\自律投稿数据管理版\tests\timetracker-week-calendar.test.mjs"
```

Expected: PASS.

- [ ] **Step 2: Browser smoke test**

Open the HTML page in a browser. Verify:

- Calendar page renders a week grid.
- Previous/current/next week buttons update the week range.
- Adding a block renders it in the correct day and time.
- A task can move `todo -> doing -> done`.
- The Timer panel updates when a task is doing.
- Existing attendance, focus, submission, settings, analytics sections still open.

- [ ] **Step 3: Dedicated review**

Run a separate review agent after implementation. The reviewer must not be the implementation agent and must check spec compliance, regressions, and visual risks.
