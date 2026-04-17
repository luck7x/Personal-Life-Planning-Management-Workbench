---
name: ops-sync
description: 主 agent 显式调用的唯一正式入口，串联 ops-judge → normalize → ops-apply。不是平台 hook；只在主 agent 需要判断并可能落盘当前工作轮次时使用。
---

# Ops Sync

你现在执行的是"单轮状态同步入口"。

目标：把一次已完成的有效交互，稳定地走完 `raw judge output → orchestrator → normalize → apply` 流程。

## 定位

- 这是主 agent 的显式工作流入口
- 这是默认唯一入口
- 不是平台 lifecycle hook
- 不在这里直接改 state 文件
- `ops-judge` 与 `ops-apply` 视为内部节点，不作为常规默认直呼流程

## 执行步骤

1. 先显式调用 `$ops-judge`
2. 由主 agent 把 `$ops-judge` 的原始输出保存成一个文本文件
3. 只运行 orchestrator 脚本，让它负责后续 `normalize → apply`
4. 若 orchestrator 返回 `ignored`，停止
5. 若 orchestrator 返回 `defer` 或 `apply` 或 `duplicate`，以其输出为准

禁止事项：

- 不要手工写 `.codex/state/events/*.json`
- 不要手工改 `.codex/state/progress.md`、`interaction-log.md`、`BRIEF.md`
- 不要绕过 orchestrator 直接调用 `ops-apply`

## 编排脚本

优先运行：

```powershell
python <skill-path>/ops-sync/scripts/ops_sync_run.py --project-root <project_root> --input <raw_judge_output.txt>
```

orchestrator 负责：

- 调 `ops_sync_normalize.py`
- 在 `ignore` 时直接返回，不生成事件文件
- 在 `defer/apply` 时把 canonical event 交给 `ops_apply.py`
- 输出最终链路状态，避免主 agent 手工拼流程
- 不负责调用 `ops-judge`
- 不负责替主 agent 生成 `raw_judge_*.txt`
- 在 Windows 中文路径下，必须保证子进程以 UTF-8 模式输出，避免 `event_file` 在 `normalize → apply` 之间被解码成乱码

## 结果语义

- `ignore` — 只返回结果，不生成 event 文件，也不调用 ops-apply
- `defer` — 由 orchestrator 生成 canonical event 后调用 ops-apply
- `apply` — 由 orchestrator 生成 canonical event 后调用 ops-apply

## 约束

- 你不跳过 `$ops-judge`
- 你不直接把 `ops-judge` 的自然语言输出喂给 `ops-apply`
- 你不自行发明 state 字段
- 你不手工落盘正式 state；除非脚本链失败并且用户明确要求手工兜底

