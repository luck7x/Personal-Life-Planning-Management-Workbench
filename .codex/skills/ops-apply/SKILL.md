---
name: ops-apply
description: 接收已由 ops-judge 判定为 defer 或 apply 的结构化事件，校验后稳定落盘到 `.codex/state/`。只在 ops-sync 编排脚本显式唤醒时使用，不参与"是否记录"的判断。
---

# Ops Apply

你现在执行的是"状态落盘写入"。

目标：把已经确认应记录的结构化事件稳定落盘，不重复做触发判断。

## 触发前提

仅在以下条件满足时运行：

- 已有经过 normalize/validate 层生成的 canonical event 文件
- 其中 `decision` 明确为 `defer` 或 `apply`
- 已显式提供 `--project-root`
- 正常流程由 `ops-sync` 显式唤醒；除非在调试写入器，不要直接把你当入口使用

若不满足，不要自行补判断；应返回让主 agent 先调用 `ops-judge`。

## 执行方式

优先运行脚本：

```powershell
python <skill-path>/ops-apply/scripts/ops_apply.py --project-root <project_root> --input <path>
```

## 严格 Schema 校验

- 只接受 `ops-event/v3` schema
- 拒绝未声明的顶层键（只允许：schema_version, decision, reason, summary, dedupe_key, event）
- 只从 `event` 对象读取业务字段，不从顶层 fallback
- interaction-log 追加前检查 dedupe_key 是否已存在（幂等保护）
- `apply` 时先完成正式写入与 report，再记录 dedupe

## 落盘语义

- `decision=defer`
  - 只写 `.codex/state/_ops-deferred.jsonl` + `_ops-dedupe.json`
  - 不改正式 state 文件
  - 不自动消费 deferred；它只是候选缓存，不是事实源
- `decision=apply`
  - 写正式 state 文件全套
  - 输出 `_ops-sync-report.json`

## 落地原则

- 你是单写者，不和其他 agent 并发写 state
- 只写本轮已确认的信息
- 不重写 `HANDOFF.md`
- 不重新解释"为什么要写"，直接执行写入

