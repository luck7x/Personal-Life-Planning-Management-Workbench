# HANDOFF

## Goal

- 继续在 `feature/self-supervision-mvp` 上推进 Web 任务工作台与归档模块，当前最合理的下一功能切口是：补齐归档任务右侧抽屉的完整操作能力。
- 项目总目标仍是做一个监督 ToDo List 与时间记录的 Web 页面；历史上日历视图参考 FullCalendar timeGrid，当前主线已切到任务工作台与归档体验。

## Hard Constraints

- 只能在 `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp` 上继续开发；正式开发分支是 `feature/self-supervision-mvp`。
- `main` 已被重置为占位分支，只保留 `README.md` 与 `.gitignore`；不要在 `main` 上做功能开发。
- 用户允许保留 `.gitignore` 中的 `.ace-tool/` 环境差异，但不要把环境差异混成业务逻辑判断。
- Windows PowerShell + 中文路径环境；凡是继续跑状态同步或 Python 编排脚本，必须保持 UTF-8 子进程链路。
- 用户已确认的归档视图要求包括：顶部三块总览、工具条、高密度时间流、归档任务统一走右侧详情抽屉，并支持查看 / 编辑 / 恢复 / 删除。

## Current Focus

- 当前仓库已经收敛为占位的 `main` 与唯一开发分支 `feature/self-supervision-mvp`；开发 worktree 当前 `git status --short` 为空。
- 当前归档页的大框架已经存在：顶部三块总览、工具条、高密度时间流、分组展开状态、搜索 / 筛选、点击归档项打开右侧抽屉、`Done -> Archived` 自动流转。
- 当前真正缺口是归档任务抽屉还只有“查看”，没有把用户已经要求过的 `编辑 / 恢复 / 删除` 补齐。

## Why Now

- 用户已明确要求“继续在 `feature/self-supervision-mvp` 上推进下一个功能”，并要求把之前归纳过的归档视图要求整理给下个窗口继续开发。
- 代码语义检索已确认当前最小且正确的下一刀不是继续改归档总览或工具条，而是补齐归档抽屉操作能力。
- 正式开发分支当前干净，正适合直接进入 TDD 小闭环，而不是再做分支治理。

## Next 3 Actions

1. 打开 `app.js`、`tests/archive-view-dom.test.js`、`tests/task-view-dom.test.js`，先为“归档抽屉支持恢复到 Todo、删除到 Trash、编辑归档任务信息”写失败测试。
2. 在 `app.js` 中最小实现归档抽屉动作：恢复默认回 `Todo`，删除进入 `trash`，编辑后保持归档上下文与分组展开状态不丢。
3. 运行定向测试并优先做归档页回归验证；至少覆盖 `archive-view-dom`、`task-view-dom`，必要时再补真实浏览器 QA。

## Active Issues

- `main` 已重置为占位分支，只保留 `README.md` 与 `.gitignore`；不要再把 `main` 当作开发主线。
- 当前开发目录名仍叫 `.worktrees/archive-merge-into-self-supervision`，但其真实绑定分支已经是 `feature/self-supervision-mvp`；后续要以分支名而不是目录名识别主线。
- 旧目录 `.worktrees/self-supervision-mvp` 还有物理残留，因为 `qa-http-server.log` 正被占用；这不是 Git worktree 绑定问题，而是文件句柄未释放。
- 归档抽屉当前只读，未完成用户要求的 `编辑 / 恢复 / 删除`。

## Blockers

- 代码层面无 blocker；`feature/self-supervision-mvp` 当前工作区干净，可以直接开发。
- 物理清理层面有 blocker：旧目录 `.worktrees/self-supervision-mvp` 因 `qa-http-server.log` 被占用还未删净，但这不阻塞功能开发。

## Recent Verified Actions

- 2026-04-17 14:24 | 已补齐 `Done -> Archived` 每日自动流转；`tests/rollover-calendar.test.js` 与 `tests/task-view-dom.test.js` 定向验证 `34/34` 通过，并提交 `409fbc0 feat: automate done task archival on rollover`。
- 2026-04-17 14:42 | 已通过 `ops-sync` 把分支治理结果写入状态：`main` 变占位分支，唯一正式开发分支为 `feature/self-supervision-mvp`，并记录旧 worktree 残留目录占用问题。
- 2026-04-17 | 已先对 `main`、原 clean 分支、原 dirty 分支的未提交现场分别做归档提交，再删除其他项目分支；当前 `git branch -vv` 只剩 `main` 与 `feature/self-supervision-mvp`。
- 2026-04-17 | 已保留 `archive-feature-archive-task1-clean-20260417` 与 `archive-feature-self-supervision-mvp-dirty-20260417` 两个 tag，作为已删分支历史锚点。
- 本窗口结束前 | 已重新核对归档视图用户要求，并确认当前实现缺口是“归档抽屉完整操作能力”，不是归档页总览或工具条本身。

## Known Pitfalls

- `KB-OPS-SYNC-WINDOWS-UTF8`：Windows 中文路径下跑 Python orchestrator 必须强制 UTF-8，否则状态同步链路会炸在路径解码。
- 不要被旧目录名 `archive-merge-into-self-supervision` 误导；真正主线是 `feature/self-supervision-mvp`。
- 归档相关交互已经统一迁到右侧抽屉；后续排查归档问题时，先看 drawer 状态和事件分发，不要按旧 modal 语义理解。
- 归档抽屉后续补 `编辑 / 恢复 / 删除` 时，不能把当前时间流分组展开状态、筛选条件、搜索结果无故重置。
- 若要彻底删除旧目录 `.worktrees/self-supervision-mvp`，先释放 `qa-http-server.log` 的占用进程。

## Files To Open First

- `.codex/state/HANDOFF.md`
- `.codex/state/progress.md`
- `.codex/state/interaction-log.md`
- `docs/superpowers/specs/2026-04-15-task-workbench-web-design.md`
- `docs/superpowers/specs/2026-04-16-archive-redesign-design.md`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/app.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/tests/archive-view-dom.test.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/tests/task-view-dom.test.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/styles.css`

## First Action In New Window

- 先进入 `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp`，确认 `git status --short` 为空；然后直接在 `tests/archive-view-dom.test.js` 里先写“归档抽屉支持恢复 / 删除 / 编辑且不丢分组展开状态”的失败测试，再实现最小代码。

## Open Questions

- 归档抽屉里的“编辑”是否只允许改标题 / 分类 / 备注，还是要连时间字段一起开放？当前用户要求是“编辑任务信息”，但未再次细化字段范围。
- 归档任务“删除”是进入 `trash` 还是提供“彻底删除”？按既有工作台语义，下一步建议先对齐为进入 `trash`。
- 完成归档抽屉完整操作后，是否立即补一轮真实浏览器 QA，还是先继续推进归档页结构性体验优化？
