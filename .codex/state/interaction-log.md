# Interaction Log

## [2026-04-14 19:25] 优化日历周视图，使其从 Notion 风格模糊目标收敛到 FullCalendar timeGrid 风格，并修复事件块文字压缩问题。
<!-- dedupe:78b9e9bcc56afc2e -->
- **Source**: ops-judge
- **Result**: 已重构 calendar DOM 与 CSS：引入共享时间轴、周范围标题、today/now 时间锚点、分类色事件块与更宽松的 compact 规则；npm test 全量通过 73 项。
- **Tags**: calendar, frontend, fullcalendar, ux, ops-sync

## [2026-04-14 19:33] 验证日历周视图在真实浏览器中的桌面端、移动端和核心交互表现，并确认稳定的本地静态服务启动方式。
<!-- dedupe:6948d3386d613ae0 -->
- **Source**: ops-judge
- **Result**: 使用 python -m http.server 4173 成功稳定托管页面；桌面端确认周范围标题、today 高亮、now line、分类色事件块生效；移动端确认 .calendar-week 为横向滚动（clientWidth=429, scrollWidth=892, overflowX=auto）；手动补记交互成功写入 localStorage 并关闭弹窗。
- **Tags**: qa, browser, calendar, mobile, ops-sync

## [2026-04-14 19:58] 将周视图重叠事件从严格等分切换为更接近 FullCalendar slotEventOverlap 的阶梯式半遮挡布局，并完成二轮浏览器复测。
<!-- dedupe:8f4f665bc1f3e3be -->
- **Source**: ops-judge
- **Result**: 基于 FullCalendar 官方文档和源码线索，把 overlap 公式调整为 `left = lane / laneCount`、`width = min(2 / laneCount, 剩余空间)` 的视觉策略；补充 `getOverlapVisualMetrics`、3 列 overlap、`now line` 层级和日列 `aria-label` 相关测试；`npm test` 全量 75 项通过。桌面端三重重叠事件宽度约 `119.6 / 119.6 / 57.8px`，移动端约 `75.3 / 75.3 / 35.7px`，并确认 `now line` 可见。
- **Tags**: calendar, fullcalendar, overlap, qa, accessibility, ops-sync

## [2026-04-14 22:06] 借鉴本地参考项目 ilamy-calendar-main 的 layered overlap 策略，继续优化并行任务块的可读性。
<!-- dedupe:2e08a2c3a88d6cb6 -->
- **Source**: ops-judge
- **Result**: 使用 `search_context` 检索 `参考项目/ilamy-calendar-main` 后，确认其日内重叠事件采用动态 offset layered overlap：首层全宽，后续层按总并发数控制偏移上限。已将当前项目的 `getOverlapVisualMetrics` 调整为参考项目式策略，并更新 helper / DOM 测试；`npm test` 全量 75 项通过。三重重叠浏览器复测结果：桌面约 `182.3 / 135.7 / 89.1px`，移动约 `115 / 85.25 / 55.5px`，明显优于上一版 FullCalendar 风格实现。
- **Tags**: calendar, reference-project, overlap, qa, mcp, ops-sync

## [2026-04-14 22:21] 在 layered overlap 之上继续增加分层透明度与 hover 阴影，强化层叠展示感。
<!-- dedupe:42b4fb1f0d75fc9d -->
- **Source**: ops-judge
- **Result**: 新增按 lane 递减的 `--entry-background`、按 lane 递增的 `--entry-shadow`，并在 hover 态切换到更实的 `--entry-background-hover` / `--entry-shadow-hover`。MCP 调研确认参考项目本身并不依赖透明度或 hover 特效，当前实现属于在其布局策略基础上的视觉增强。`npm test` 全量 77 项通过；浏览器复测确认桌面 / 移动端宽度不变，三层透明度分别为 `0.18 / 0.13 / 0.10`。
- **Tags**: calendar, overlap, visual-design, qa, mcp, ops-sync

## [2026-04-15 00:21] 实现点击日历块进入统一编辑，并建立当前会话的 agent team 注入规范
<!-- dedupe:76de9eb207905fdb -->
- **Source**: ops-judge
- **Result**: 已在 prototype-mvp 中实现日历块统一编辑链路，manual/task 都支持从日历块进入编辑；manual 支持保存/删除，task 支持保存/放弃/删除，且 task 时间修改会同步真实任务记录；新增团队注入协议文档，backend 评估确认当前功能前端本地闭环、后端为 N/A。
- **Tags**: calendar, editing, frontend, qa, agent-team, ops-sync

## [2026-04-15 00:26] 吸收 review findings 并补浏览器 QA 验证日历块统一编辑
<!-- dedupe:d77c50f5dad0fd8f -->
- **Source**: ops-judge
- **Result**: 已修复 trash task 无放弃原因仍可保存的问题，以及 manual 统一编辑缺开始时间错误提示不准确的问题；npm test 全量 84 项通过；桌面端确认 manual 编辑与 task 删除正常，移动端确认 task 放弃正常且编辑弹窗按钮未超出视口。
- **Tags**: calendar, editing, review, browser-qa, ops-sync

## [2026-04-15 11:25] 在统一编辑完成后，吸收最终 QA/review/research 结论并完成 1.2 的高密度 overlap 第一轮修复。
<!-- dedupe:31c75ee240000756 -->
- **Source**: ops-judge
- **Result**: 已把 3+ lane 从真实几何重叠切换为并排分栏，保留 2 lane layered overlap；更新测试与样式后 npm test 85/85 通过，桌面与 390px 移动端浏览器复测均无 pairwise overlap，编辑弹窗仍在视口内。
- **Tags**: calendar, overlap, qa, research, frontend

## [2026-04-15 13:18] 修复日历周视图回归：3+ 并发任务块被压缩、并行块从 layered overlap 退回互斥分栏；参考本地项目 ilamy-calendar-main 的 overlap 方案。
<!-- dedupe:4dfe255b1f8e2f45 -->
- **Source**: ops-judge
- **Result**: 已在 app.js 的 getOverlapVisualMetrics 恢复 layered overlap 数学（2=>100/75，3=>100/75/50，4=>100/80/60/40，5+ offset 封顶 70），并对齐 calendar-layout/calendar-view-dom 测试预期；同时将重叠但非 compact 卡片改为标题优先，时间仅保留在 title/aria-label。npm test 指定 3 个测试文件共 45/45 通过，浏览器验收确认 3 个并发块宽度约 186.9/139.1/91.4 px，对应 100/75/50；先前 HANDOFF 中“2 lane layered / 3+ non-overlap”结论已过时。
- **Tags**: calendar, week-view, layout, regression, layered-overlap, tests

## [2026-04-15 13:35] 验证中文路径 orchestrator
<!-- dedupe:9c58ba1b374c6bce -->
- **Source**: ops-judge
- **Result**: apply 链路正常

## [2026-04-15 14:11] 修复 ops-sync 中文路径编码坑，并修正周视图编辑弹窗被 now line 红线压层的问题。
<!-- dedupe:eeb0b7680daf8f4f -->
- **Source**: ops-judge
- **Result**: 已在 ops_sync_run.py 强制 normalize/apply 子进程使用 UTF-8 输出并补充中文路径回归测试；同时把 #modal-host 提升到独立 stacking context，相关自动化测试通过，真实浏览器专测留到下一步执行。
- **Tags**: ops-sync, windows, utf8, calendar, modal, z-index, tests

## [2026-04-15 23:06] 完成 Web 任务工作台 Task 3-5，并校正持久状态主线到任务工作台/归档模块。
<!-- dedupe:76fb8f6f6ecf2e5d -->
- **Source**: ops-judge
- **Result**: 已把任务页落为桌面两栏工作台，引入右侧任务抽屉、垃圾篓抽屉和归档页点击/恢复/编辑链路；新增 `task-style-contract.test.js` 锁定两栏布局、列内滚动、空状态、抽屉层级与归档 details 样式；定向测试 `30/30` 通过，全量 `npm test` `101/101` 通过。同步修正 `progress.md` / `BRIEF.md`，将旧日历 overlap 主线切换为当前真实主线“Web 任务工作台优先，下一步先做真实浏览器 QA”。
- **Tags**: task-workbench, archive, drawer, frontend, tests, state-sync

## [2026-04-15 23:18] 完成 Web 任务工作台桌面端浏览器 QA，并修复归档任务空截止时间被错误写成 epoch 的回归。
<!-- dedupe:5e66fe8c0a8d7a92 -->
- **Source**: ops-judge
- **Result**: 在本地 `http://127.0.0.1:4173` 桌面端实机走查了工作台与归档页：确认左 rail / 右主区为真实两栏，任务抽屉和垃圾篓抽屉右侧覆盖层位置正常，归档任务可进入抽屉并恢复回 `Todo`。实机过程中发现归档任务 `dueAt = null` 时会在抽屉中显示 `1970-01-01T08:00` 且保存脏值；已新增 `archive-view-dom` 回归测试并修正 `toDateTimeLocalValue` 对空值的处理。全量测试回归通过：`npm test` `102/102` 通过。
- **Tags**: browser-qa, task-workbench, archive, drawer, regression, tests

## [2026-04-17 14:08] 完成归档重构后的分支治理决策，正式冻结原脏 worktree 并切换 merge worktree 为后续开发主线。
<!-- dedupe:20260417140842 -->
- **Source**: codex-resume-followup
- **Result**: 核对 `git worktree list --porcelain`、merge worktree `git log --oneline -3` 与 `git status --short` 后，确认 `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp` 当前绑定分支 `merge/archive-into-self-supervision`，最近提交为 `980d46b`、`5eb99f6`、`f68b1ef`，且工作区干净；同时确认原 `feature/self-supervision-mvp` worktree 仍含 `styles.css`、多份测试文件与新增文档等未整理改动。已据此把后续开发主线正式切到 merge worktree，并更新 `progress.md`，避免后续窗口误回原脏现场继续叠加改动。
- **Tags**: branch-governance, worktree, archive, state-sync, git

## [2026-04-17 14:24] 补齐 done 自动归档，并把仓库开发分支规范化为单一主线。
<!-- dedupe:20260417142400 -->
- **Source**: codex-inline-execution
- **Result**: 先按 TDD 为 `rolloverTasks()` 与 `bootstrap()` 补了 `Done -> Archived` 跨日本地日自动流转测试，确认失败后在 `app.js` 中把 done 自动归档并入现有 rollover 链；定向验证 `npm test -- tests/rollover-calendar.test.js tests/task-view-dom.test.js` 共 `34/34` 通过。同时保留 `.gitignore` 的最新环境规则 `.ace-tool/`，并完成分支规范化：当前唯一正式开发分支改为 `feature/self-supervision-mvp`，旧脏现场与 clean 临时分支分别归档为 `archive/feature-self-supervision-mvp-dirty-20260417` 和 `archive/feature-archive-task1-clean`。
- **Tags**: rollover, archive, tdd, branch-governance, git, state-sync
