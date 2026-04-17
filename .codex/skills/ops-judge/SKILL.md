---
name: ops-judge
description: 仅在主 agent 显式调用时使用，判断"刚完成的一轮有效交互"是否值得写入 `.codex/state/`。只负责给出 ignore/defer/apply 结论和最小事件负载，不负责写文件。
---

# Ops Judge

你现在执行的是"状态记录判定"。

目标：只基于"刚刚这轮有效交互"判断是否应写入项目状态，不直接写任何文件。

这是主 agent 协议中的显式步骤，不是平台 lifecycle hook。

除非在单独调试判定逻辑，否则不要把你当作默认入口；正常流程统一先走 `ops-sync`。

## 判定原则

优先判断"为什么不该记"，再判断"为什么该记"。

## 三态规则表

### 判为 `ignore`

- 纯讨论、寒暄、重复确认
- 只读文件但没有形成新结论
- 小命令成功执行，但没有改变当前状态判断
- 临时试探失败，且没有沉淀出可复用经验
- 仅修改排版、措辞、注释格式
- 子 agent 返回了内容，但主 agent 明确认为"当前不采纳，且后续也不需要合并"

### 判为 `defer`

- 有一点新信息，但尚不足以单独写入
- 连续小步操作，适合在阶段结束时合并
- 子 agent 有中间结论，但主 agent 还未正式采纳
- 小步文件修改已发生，但还没有形成本轮可确认结论
- 命令结果或外部检索给了线索，但尚未改变 Focus、Next 3、Blockers 或 Active Issues

### 判为 `apply`

- 当前 Focus、Next 3、Blockers、Active Issues、Done 发生变化
- 新增或确认了关键决策
- 修改了文件且已形成明确结果
- 命令输出改变了判断
- 外部检索得到已采纳的新结论
- 定位了根因，或排除了关键假设
- 产生了可复用的轻量 KB

### 冲突时优先级

- 若同时满足 `apply` 与 `defer`，优先 `apply`
- 若同时满足 `defer` 与 `ignore`，优先 `defer`

## 输出要求

优先只输出一个原始 JSON 对象。若客户端自动包裹代码块，后续 normalize 层会负责提取；你不要主动添加解释性正文。

字段固定如下：

```json
{
  "decision": "ignore | defer | apply",
  "reason": "一句话原因",
  "summary": "本轮发生了什么",
  "event": {
    "source": "ops-judge",
    "intent": "本轮意图",
    "result": "本轮结果",
    "tags": ["tag1"],
    "links": ["ISSUE-001"],
    "focus": "可选",
    "blockers": ["可选"],
    "next3": ["可选"],
    "active_issues": ["可选"],
    "done_add": ["可选"],
    "notes": ["可选"],
    "issue_id": "可选",
    "issue_status": "open|doing|blocked|done",
    "issue_debug_add": ["可选"],
    "kb_id": "可选",
    "kb_pattern": "可选",
    "kb_root_cause": "可选",
    "kb_fix": ["可选"],
    "kb_precheck": ["可选"],
    "brief_append": "可选"
  }
}
```

补充要求：

- `ignore` 时，`event` 保持最小化，只保留 `intent`、`result`
- `defer` 时，不要伪造完整 state 更新；只保留后续合并需要的最小信息
- `apply` 时，只填写本轮已确认的信息；缺失字段直接省略
- `defer` 和 `apply` 时，`event.source` 固定写 `ops-judge`
- 不要输出解释性正文，不要写 Markdown 列表
- 不要自由发明 `dedupe_key`、事件路径或状态文件路径

## 与 `ops-apply` 的关系

- 你不负责写文件
- `ops-sync` 会负责调用你、规范化你的输出、并决定是否唤醒 `ops-apply`

