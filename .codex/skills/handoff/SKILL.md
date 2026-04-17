---
name: handoff
description: 生成并覆盖写入 `.codex/state/HANDOFF.md` 的接力文档，用于 Codex CLI 多窗口切换、上下文快满、阶段性总结与交接。当用户说“接力”“换窗口”“上下文快满”“总结”或输入 `/handoff` 时使用；读取 `.codex/state/`，产出可直接继续工作的高密度 Markdown，并在回复里用 `md` 代码块原样输出。
---

# Handoff

你现在要执行“接力文档生成”。

目标：从 `.codex/state/` 提炼出一份能在新窗口直接继续工作的 `HANDOFF.md`，并覆盖写入 `.codex/state/HANDOFF.md`。

## 读取顺序

按下列顺序读取，缺失则标注“待确认”：

1. `.codex/state/BRIEF.md`
2. `.codex/state/progress.md`
3. `.codex/state/interaction-log.md` 最近 15-25 条
4. `.codex/state/issues/` 中与 Active Issues 相关的 1-3 个文件
5. `.codex/state/kb/` 中与当前焦点最相关的 1-3 个文件

## 如果状态目录缺失

- 创建 `.codex/state/`。
- 至少创建空的 `BRIEF.md`、`progress.md`、`interaction-log.md`。
- 然后继续生成 HANDOFF，但在缺失信息处明确写“待补”。

## 生成要求

- 只保留下一窗口真正需要的高密度信息，不写长篇复盘。
- 继承 BRIEF 里的目标、约束、范围。
- 对齐 progress 里的 Current Focus、Blockers、Next 3、Active Issues。
- 把 interaction-log 压缩成“最近已验证动作”。
- 把 issues/kb 压缩成“当前风险与坑点”。
- 给出“新窗口第一步应该做什么”。

## 输出格式

- 使用 `references/handoff-writer.md` 作为结构模板。
- 先把完整内容写入 `.codex/state/HANDOFF.md`。
- 再在回复里用一个 `md` 代码块原样输出同样的内容。
- 不要输出解释性前言；正文就是交接文档本体。
