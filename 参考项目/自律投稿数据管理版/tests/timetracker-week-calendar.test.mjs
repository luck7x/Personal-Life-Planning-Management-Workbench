import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HTML_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '博士工作台_自律投稿数据管理版.html');

function minutesOfDay(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function extractWorkspaceScript() {
  const html = readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>\s*const STORAGE_KEY = 'phd_master_workspace_merged_v1';[\s\S]*?<\/script>/);
  assert.ok(match, 'workspace inline script should be present');
  return match[0].replace(/^<script>\s*/, '').replace(/\s*<\/script>$/, '');
}

function createElementStub() {
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  return new Proxy({
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList,
    style: {},
    addEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    reset() {},
    querySelectorAll() { return []; },
    querySelector() { return createElementStub(); },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function loadWorkspace(storedState = {}) {
  const script = extractWorkspaceScript();
  const alerts = [];
  const store = new Map();
  if (storedState !== null) {
    store.set('phd_master_workspace_merged_v1', JSON.stringify(storedState));
  }
  const documentStub = {
    body: createElementStub(),
    addEventListener() {},
    createElement() { return createElementStub(); },
    getElementById() { return createElementStub(); },
    querySelectorAll() { return []; },
    querySelector() { return createElementStub(); },
  };
  const context = {
    console,
    window: {},
    document: documentStub,
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
    alert(message) { alerts.push(String(message)); },
    confirm() { return true; },
    prompt() { return null; },
    setInterval() { return 1; },
    clearInterval() {},
    Blob: class Blob {
      constructor(parts = []) { this.size = parts.join('').length; }
    },
    URL: {
      createObjectURL() { return 'blob:test'; },
      revokeObjectURL() {},
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  const expose = `
    const productionRenderFocusSection = renderFocusSection;
    renderFocusSection = () => {};
    renderAll = () => {};
    startFocusTicker = () => {};
    stopFocusTicker = () => {};
    saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    globalThis.__workspaceTest = {
      state,
      alerts: globalThis.__alerts,
      getWeekStartMonday,
      getWeekDates,
      shiftWeek,
      positionWeekBlock,
      assignWeekLanes,
      splitWeekEvent,
      sanitizeImportedState,
      clearRunningStates,
      resetTodayRunningStates,
      startTaskTimer,
      renderFocusSection: productionRenderFocusSection,
      todayStr
    };
  `;
  context.globalThis = context;
  context.__alerts = alerts;
  vm.runInNewContext(`${script}\n${expose}`, context, { filename: HTML_PATH });
  return context.__workspaceTest;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('weekStartMonday returns Monday for dates inside the same week', () => {
  const workspace = loadWorkspace({});

  assert.equal(workspace.getWeekStartMonday('2026-04-29'), '2026-04-27');
  assert.equal(workspace.getWeekStartMonday('2026-05-03'), '2026-04-27');
});

test('weekDays returns seven contiguous dates from Monday to Sunday', () => {
  const workspace = loadWorkspace({});

  assert.deepEqual(plain(workspace.getWeekDates('2026-04-29')), [
    '2026-04-27',
    '2026-04-28',
    '2026-04-29',
    '2026-04-30',
    '2026-05-01',
    '2026-05-02',
    '2026-05-03',
  ]);
});

test('shiftWeek moves by whole Monday-based weeks', () => {
  const workspace = loadWorkspace({});

  assert.equal(workspace.shiftWeek('2026-05-03', 1), '2026-05-04');
  assert.equal(workspace.shiftWeek('2026-04-29', -1), '2026-04-20');
});

test('positionWeekBlock maps time range into the visible calendar span', () => {
  const workspace = loadWorkspace({});
  const pos = workspace.positionWeekBlock('09:00', '10:30');

  assert.deepEqual({
    top: Number(pos.top.toFixed(2)),
    height: Number(pos.height.toFixed(2)),
    visible: pos.visible,
  }, {
    top: 12.5,
    height: 9.38,
    visible: true,
  });
});

test('assignLanes separates overlapping blocks and reuses free lanes', () => {
  const workspace = loadWorkspace({});

  assert.deepEqual(workspace.assignWeekLanes([
    { id: 'a', start: '09:00', end: '10:00' },
    { id: 'b', start: '09:30', end: '10:30' },
    { id: 'c', start: '10:30', end: '11:00' },
  ]).map(({ id, laneIndex, laneCount }) => ({ id, laneIndex, laneCount })), [
    { id: 'a', laneIndex: 0, laneCount: 1 },
    { id: 'b', laneIndex: 1, laneCount: 2 },
    { id: 'c', laneIndex: 0, laneCount: 2 },
  ]);
});

test('positionWeekBlock marks off-hours blocks invisible instead of overflowing', () => {
  const workspace = loadWorkspace({});

  for (const [start, end] of [['23:30', '23:59'], ['00:00', '00:30'], ['05:30', '06:00']]) {
    const pos = workspace.positionWeekBlock(start, end);
    assert.equal(pos.visible, false, `${start}-${end} should be invisible`);
    assert.ok(pos.top >= 0 && pos.top <= 100, `${start}-${end} top should stay within grid`);
    assert.ok(pos.height >= 0 && pos.height <= 100, `${start}-${end} height should stay within grid`);
  }
});

test('positionWeekBlock renders positive-minute same-time records as short visible blocks', () => {
  const workspace = loadWorkspace({});
  const pos = workspace.positionWeekBlock('09:00', '09:00', 1);

  assert.deepEqual({
    top: Number(pos.top.toFixed(2)),
    height: Number(pos.height.toFixed(2)),
    visible: pos.visible,
  }, {
    top: 12.5,
    height: 3.5,
    visible: true,
  });

  const edge = workspace.positionWeekBlock('23:00', '23:00', 1);
  assert.equal(edge.visible, true);
  assert.equal(Number(edge.top.toFixed(2)), 96.5);
  assert.equal(Number(edge.height.toFixed(2)), 3.5);
});

test('positionWeekBlock keeps zero-minute and off-hours same-time records invisible', () => {
  const workspace = loadWorkspace({});

  for (const [start, end, minutes] of [['09:00', '09:00', 0], ['00:00', '00:00', 1], ['23:30', '23:30', 1]]) {
    const pos = workspace.positionWeekBlock(start, end, minutes);
    assert.equal(pos.visible, false, `${start}-${end} should be invisible`);
    assert.ok(pos.top >= 0 && pos.top <= 100, `${start}-${end} top should stay within grid`);
    assert.ok(pos.height >= 0 && pos.height <= 100, `${start}-${end} height should stay within grid`);
  }
});

test('renderFocusSection handles legacy tasks without createdAt', () => {
  const workspace = loadWorkspace({
    tasks: [{ id: 'legacy_task', title: 'Legacy task', status: 'todo' }],
    focus: { active: null, sessions: [] },
  });

  assert.equal(typeof workspace.state.tasks[0].createdAt, 'string');
  assert.doesNotThrow(() => workspace.renderFocusSection());
});

test('splitWeekEvent splits 23:30-00:30 without reverse or inflated segments', () => {
  const workspace = loadWorkspace({});
  const segments = workspace.splitWeekEvent({
    id: 'late',
    date: '2026-04-27',
    start: '23:30',
    end: '00:30',
    minutes: 60,
  }, new Set(['2026-04-27', '2026-04-28']));

  assert.deepEqual(plain(segments.map(({ date, start, end, minutes }) => ({ date, start, end, minutes }))), [
    { date: '2026-04-27', start: '23:30', end: '23:59', minutes: 30 },
    { date: '2026-04-28', start: '00:00', end: '00:30', minutes: 30 },
  ]);
  assert.ok(segments.every((segment) => minutesOfDay(segment.end) >= minutesOfDay(segment.start)));
  assert.equal(segments.reduce((sum, segment) => sum + segment.minutes, 0), 60);
});

test('splitWeekEvent treats start=end positive-minute records as same-day short events', () => {
  const workspace = loadWorkspace({});
  const segments = workspace.splitWeekEvent({
    id: 'same-minute',
    date: '2026-04-27',
    start: '09:00',
    end: '09:00',
    minutes: 1,
  }, new Set(['2026-04-27', '2026-04-28']));

  assert.deepEqual(plain(segments.map(({ date, start, end, minutes }) => ({ date, start, end, minutes }))), [
    { date: '2026-04-27', start: '09:00', end: '09:00', minutes: 1 },
  ]);
  assert.equal(segments.reduce((sum, segment) => sum + segment.minutes, 0), 1);
});

test('splitWeekEvent drops start=end zero-minute records', () => {
  const workspace = loadWorkspace({});
  const segments = workspace.splitWeekEvent({
    id: 'zero',
    date: '2026-04-27',
    start: '09:00',
    end: '09:00',
    minutes: 0,
  }, new Set(['2026-04-27', '2026-04-28']));

  assert.deepEqual(plain(segments), []);
});

test('loadState normalizes focus active and sessions', () => {
  const workspace = loadWorkspace({
    focus: {
      active: {
        title: 'Legacy manual focus',
        taskId: 'task_1',
        startTs: 1777359600000,
        startedAt: '2026-04-28 09:00:00',
        date: '2026-04-28',
      },
      sessions: 'bad sessions',
    },
  });

  assert.equal(workspace.state.focus.active.source, 'manual');
  assert.deepEqual(plain(workspace.state.focus.sessions), []);
});

test('sanitizeImportedState clears active without valid timing fields', () => {
  const workspace = loadWorkspace({});

  assert.equal(workspace.sanitizeImportedState({
    focus: {
      active: { title: 'Broken active', startedAt: '2026-04-28 09:00:00' },
      sessions: [],
    },
  }).focus.active, null);
  assert.equal(workspace.sanitizeImportedState({
    focus: {
      active: { title: 'Broken active', startTs: 1777359600000 },
      sessions: [],
    },
  }).focus.active, null);
});

test('startTaskTimer does not overwrite manual active linked to the same task', () => {
  const manualActive = {
    title: 'Manual focus',
    taskId: 'task_1',
    source: 'manual',
    startTs: 1777359600000,
    startedAt: '2026-04-28 09:00:00',
    date: '2026-04-28',
  };
  const workspace = loadWorkspace({
    tasks: [{ id: 'task_1', title: 'Task one', status: 'todo', startedAt: null, completedAt: null }],
    focus: { active: manualActive, sessions: [] },
  });

  workspace.startTaskTimer('task_1');

  assert.deepEqual(plain(workspace.state.focus.active), manualActive);
  assert.equal(workspace.state.tasks[0].status, 'todo');
  assert.equal(workspace.alerts.length, 1);
});

test('startTaskTimer keeps the existing same task-driven active when continuing', () => {
  const taskActive = {
    title: 'Task one',
    taskId: 'task_1',
    source: 'task',
    startTs: 1777359600000,
    startedAt: '2026-04-28 09:00:00',
    date: '2026-04-28',
  };
  const workspace = loadWorkspace({
    tasks: [{ id: 'task_1', title: 'Task one', status: 'doing', startedAt: '2026-04-28 09:00:00', completedAt: null }],
    focus: { active: taskActive, sessions: [] },
  });

  workspace.startTaskTimer('task_1');

  assert.deepEqual(plain(workspace.state.focus.active), taskActive);
  assert.equal(workspace.state.tasks[0].status, 'doing');
});

test('clearRunningStates restores the active doing task to todo', () => {
  const workspace = loadWorkspace({
    tasks: [{ id: 'task_1', title: 'Task one', status: 'doing', startedAt: '2026-04-28 09:00:00', completedAt: null }],
    focus: {
      active: {
        title: 'Task one',
        taskId: 'task_1',
        source: 'task',
        startTs: 1777359600000,
        startedAt: '2026-04-28 09:00:00',
        date: '2026-04-28',
      },
      sessions: [],
    },
  });

  workspace.clearRunningStates();

  assert.equal(workspace.state.focus.active, null);
  assert.equal(workspace.state.tasks[0].status, 'todo');
  assert.equal(workspace.state.tasks[0].startedAt, null);
});
