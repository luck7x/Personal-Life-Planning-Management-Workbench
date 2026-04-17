# Daily Rollover And Branch Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 `Done -> Archived` 每日自动流转，并把当前仓库收敛为单一开发分支主线。

**Architecture:** 继续复用现有 `rolloverTasks()` 作为唯一跨日流转入口，把 `done -> archived` 并入同一条状态机，不额外引入新入口。分支治理采用“保留 `merge/archive-into-self-supervision`，其余开发分支改名归档”的非丢失方案，避免直接删除旧现场。

**Tech Stack:** 原生 JavaScript、Vitest、Git worktree

---

### Task 1: 为 done 自动归档补测试

**Files:**
- Modify: `tests/rollover-calendar.test.js`
- Modify: `tests/task-view-dom.test.js`

- [ ] Step 1: 写 `rolloverTasks` 跨日自动归档的失败测试
- [ ] Step 2: 运行定向测试，确认新增用例先失败
- [ ] Step 3: 写 `bootstrap` 载入旧 `done` 任务后自动归档的失败测试
- [ ] Step 4: 再次运行定向测试，确认失败原因正确

### Task 2: 实现 done 自动归档

**Files:**
- Modify: `app.js`
- Test: `tests/rollover-calendar.test.js`
- Test: `tests/task-view-dom.test.js`

- [ ] Step 1: 在 `rolloverTasks()` 中复用现有 archive 字段构造逻辑，实现 `done -> archived`
- [ ] Step 2: 保持本地日边界一致，避免同一天内误归档
- [ ] Step 3: 确认 `bootstrap()` 继续只调用一次 `rolloverTasks()` 即可生效
- [ ] Step 4: 跑定向测试直到通过

### Task 3: 归档旧开发分支

**Files:**
- Modify: Git refs only

- [ ] Step 1: 保留 `merge/archive-into-self-supervision` 作为唯一开发分支
- [ ] Step 2: 将 `feature/self-supervision-mvp` 改名归档
- [ ] Step 3: 将 `feature/archive-task1-clean` 改名归档
- [ ] Step 4: 校验 `git branch -vv` 与 `git worktree list --porcelain`

### Task 4: 最终验证

**Files:**
- Verify: `tests/rollover-calendar.test.js`
- Verify: `tests/task-view-dom.test.js`
- Verify: Git branch/worktree state

- [ ] Step 1: 运行定向测试，确认自动归档通过且旧 rollover 不回归
- [ ] Step 2: 核对分支收敛结果
- [ ] Step 3: 汇总变更、风险与后续建议
