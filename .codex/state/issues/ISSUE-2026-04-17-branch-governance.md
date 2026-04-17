# ISSUE-2026-04-17 Branch Governance

## Status
Done

## Summary
- 正式冻结原 `feature/self-supervision-mvp` 脏 worktree。
- 后续开发主线已规范为 `feature/self-supervision-mvp`。
- 本 issue 用于跟踪主线切换后的纪律约束与后续收口动作。

## Context
- 原 `feature/self-supervision-mvp` worktree 仍含未整理改动，不能继续叠加新功能。
- 当前可信开发基线位于 `D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp`，其绑定分支现为 `feature/self-supervision-mvp`。
- 2026-04-17 已完成 `progress.md` 与 `interaction-log.md` 状态校正，但 issues 目录此前为空，缺少单独问题跟踪。

## Decision
- 默认只在 `feature/self-supervision-mvp` 所在 worktree 上继续实现、测试和浏览器验证。
- 原脏 worktree 仅保留现场，不做删除、重置或继续开发。

## Evidence
- 当前正式开发分支：`feature/self-supervision-mvp`
- 归档分支：`archive/feature-self-supervision-mvp-dirty-20260417`、`archive/feature-archive-task1-clean`
- 当前开发 worktree 路径：`D:/lucky/Supplies/个人/APP/监督反思/.worktrees/archive-merge-into-self-supervision/prototype-mvp`
- 当前开发 worktree 正在承载新的自动归档改动；原脏现场 worktree 仍保留历史未整理变更

## Next
1. 后续功能开发统一在 `feature/self-supervision-mvp` 所在 worktree 进行。
2. 如后续出现“删除旧 worktree 目录”或“并回 main”需求，再开新 issue 跟踪。
3. 后续阶段继续只维护一个正式开发分支，其余一律归档或删除。

## Risks
- 若误回原 `feature/self-supervision-mvp` worktree 继续开发，会再次引入状态漂移与 diff 污染。
- 若 merge worktree 后续被并行修改而未同步 state，后续窗口仍可能误判主线。

## Updated
- 2026-04-17 14:24
