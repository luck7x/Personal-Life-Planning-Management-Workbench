# HANDOFF

## Goal

- 在 Web 任务工作台中完成可用的归档体验：顶部三块总览、工具条、高密度时间流、archived task drawer，以及真实的 `done -> archived` 入口。
- 在不污染原脏现场的前提下，把 clean 归档实现安全并入 `feature/self-supervision-mvp` 的后续工作线上。

## Hard Constraints

- 不要直接在原脏 worktree `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/self-supervision-mvp/prototype-mvp` 上继续硬改；它必须保留现场。
- 当前最可信的可交付代码在 merge worktree：`D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp`。
- 用户允许忽略 `.gitignore` 里的 `.ace-tool/` 环境差异，但不要把这类差异混进功能提交。
- Windows PowerShell 环境，且项目路径含中文；若后续继续跑状态同步或 Python 编排脚本，必须遵守 UTF-8 链路约束。

## Current Focus

- 归档重构已经完成 clean 实现、集成分支并入和自动化验证。
- 当前真正焦点不是继续修归档 UI，而是决定哪条分支接管后续开发主线。
- `.codex/state/progress.md` 仍停留在旧的“工作台桌面 QA / 是否提交”阶段，已经落后于当前真实状态。

## Why Now

- clean worktree 已经产出独立提交，可回溯、可复用。
- merge worktree 已经把归档重构安全并到 `feature/self-supervision-mvp` 的代码基线上，且当前 `git status --short` 为空。
- 如果不先收口主线，后续再开发只会重新回到原脏 worktree，继续扩大状态漂移和 diff 污染。

## Next 3 Actions

1. 进入 merge worktree，确认其作为后续开发主线候选：查看最近提交和当前分支状态。
2. 决定是否让 `merge/archive-into-self-supervision` 接管后续开发，还是仅保留为中间集成分支。
3. 一旦主线决定完成，再补写 `.codex/state/progress.md` 与 `interaction-log.md`，把这轮 archive 重构和分支切换正式沉淀。

## Active Issues

- `progress.md` 与真实状态漂移：没有记录 clean 分支、merge 分支、真实 `done -> archived` 入口，以及 merge worktree 的通过测试结果。
- 原 `feature/self-supervision-mvp` worktree 仍是脏现场，不能直接当作“已完成归档集成”的可信基线。
- `.codex/state/issues/` 当前没有对应 issue 文件；若下一窗口继续做分支治理，建议补一条 issue 跟踪“主线切换 / 状态校正”。

## Blockers

- 代码层面无 blocker：merge worktree 已通过测试，且工作区干净。
- 决策层 blocker：必须先决定后续主线，否则容易误回原脏现场继续开发。

## Recent Verified Actions

- 2026-04-15 23:06 | 已完成 Web 任务工作台 Task 3-5，并把状态主线校正到任务工作台/归档模块；当时定向测试 `30/30` 通过，全量 `101/101` 通过。
- 2026-04-15 23:18 | 完成桌面端浏览器 QA，并修复归档任务 `dueAt = null` 被错误保存为 epoch 的回归；全量测试提升到 `102/102` 通过。
- 2026-04-16 | 在 clean worktree 完成归档重构，提交 `4eb9911 feat: redesign archive timeline experience`。
- 2026-04-16 | 修复 reviewer 指出的两条真实问题：`expandedGroups=[]` 与默认态歧义、任务标题未转义的 XSS 缺口。
- 2026-04-16 | 补上真实归档入口：`done` 任务现在可通过 modal 中的 `归档` 动作进入 `archived`。
- 2026-04-16 | 新建 merge worktree 和分支 `merge/archive-into-self-supervision`，并并入 clean 成果，生成提交 `5eb99f6 feat: redesign archive timeline experience`。
- 2026-04-16 | 对齐 merge 分支归档分析测试基线，提交 `980d46b test: align archive analytics coverage`。
- 2026-04-16 | 在 merge worktree 运行 `vitest run`，结果 `10` 个测试文件、`86/86` 通过；当前 `git status --short` 为空。

## Known Pitfalls

- `KB-OPS-SYNC-WINDOWS-UTF8`：中文路径下运行 Python orchestrator 时，必须显式保证 UTF-8 子进程链路，否则状态同步脚本会因路径乱码失效。
- 原 `feature/self-supervision-mvp` worktree 仍有未整合改动；不要把 merge 分支内容直接覆盖回去。
- merge worktree 执行过 `npm install` 只用于本地验证，不要把依赖目录视为功能改动的一部分。
- 归档相关测试里仍有部分 seed 直接构造 `status: 'archived'`；真实入口已补上，但后续扩展功能时应优先补真实流转测试。

## Files To Open First

- `.codex/state/BRIEF.md`
- `.codex/state/progress.md`
- `.codex/state/HANDOFF.md`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/app.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/styles.css`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/tests/task-view-dom.test.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/tests/archive-view-dom.test.js`
- `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp/tests/archive-analytics.test.js`

## First Action In New Window

- 先进入 `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp`，执行 `git log --oneline -3` 和 `git status --short`；把 `merge/archive-into-self-supervision` 明确视为当前可继续工作的主线候选，再决定是否接管原 `feature/self-supervision-mvp`。

## Open Questions

- 是否正式放弃在原脏 worktree 上继续开发，改由 `merge/archive-into-self-supervision` 接管后续工作？
- 是否现在就把这轮 archive 重构和分支集成结果写回 `.codex/state/progress.md` / `interaction-log.md`，完成状态校正？
- 后续优先做分支治理与工作线收口，还是直接在 merge 主线上继续下一功能任务？
