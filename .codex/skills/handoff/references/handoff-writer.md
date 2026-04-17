# HANDOFF 输出模板

按下面结构生成完整 Markdown，不要省略标题：

```md
# HANDOFF

## Goal

- ...

## Hard Constraints

- ...

## Current Focus

- ...

## Why Now

- ...

## Next 3 Actions

1. ...
2. ...
3. ...

## Active Issues

- ISSUE-xxx: ...

## Blockers

- ...

## Recent Verified Actions

- 2026-03-10 15:00 | ...

## Known Pitfalls

- KB-xxx: ...

## Files To Open First

- ...

## First Action In New Window

- ...

## Open Questions

- ...
```

补充规则：

- `Next 3 Actions` 最多 3 条，必须是可立即执行的动作。
- `Recent Verified Actions` 来自 interaction-log 的最近记录，优先保留能解释现状的条目。
- `Known Pitfalls` 只写会影响继续推进的坑，不要堆知识库摘要。
- `Files To Open First` 尽量包含 `.codex/state` 关键文件和最可能继续改动的代码文件。
