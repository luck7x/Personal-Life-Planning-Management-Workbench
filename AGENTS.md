# 项目持久上下文套件规范

## 目标

- 让 Codex 在新话题、新窗口、长任务中优先读取 `.codex/state/`，而不是依赖脆弱的会话历史。
- 把长期上下文压缩为少量稳定文件：`BRIEF.md`、`progress.md`、`interaction-log.md`、`issues/`、`kb/`、`HANDOFF.md`。
- 允许多 agent 并行收集信息，但保持状态写入单点化，避免冲突和漂移。

## 状态目录

- `.codex/state/BRIEF.md`：项目目标、硬约束、范围、需求演进。
- `.codex/state/progress.md`：当前焦点、阻塞点、Next 3、Done。
- `.codex/state/interaction-log.md`：按时间追加的可验证动作日志。
- `.codex/state/issues/ISSUE-*.md`：具体问题的生命周期记录。
- `.codex/state/kb/KB-*.md`：高频坑、关键经验、复用结论。
- `.codex/state/HANDOFF.md`：交接文档，由 `handoff` 覆盖生成。

## 触发规则

- 用户说“继续之前的任务”“恢复上下文”“恢复上个窗口”时，先用 `handoff-resume`。
- 用户说“接力”“换窗口”“上下文快满”“阶段性总结”时，用 `handoff`。
- 出现明确决策、文件修改、命令结果、外部搜索结果、根因定位、状态变化时，用 `ops-sync`。
- 同一项目里切换新话题时，先读 `BRIEF.md`、`progress.md`、`HANDOFF.md`，再决定是否补充 `issues/` 或 `kb/`。

## 多 Agent 规则

- 主 agent 负责规划、汇总、最终写入 `.codex/state/`。
- 子 agent 默认只读调研，不直接修改 `.codex/state/`。
- 子 agent 返回结果后，主 agent 再统一触发一次 `ops-sync`，把结论沉淀到状态文件。
- 若多个子任务涉及同一状态文件，必须串行汇总，禁止并发写入。

## 写入原则

- 优先增量更新，不重写整页。
- `interaction-log.md` 只追加，不改历史。
- `progress.md` 只改变化区块，`Next 3` 永远不超过 3 条。
- `BRIEF.md` 只在需求、规则、决策改变时追加一行演进。
- `HANDOFF.md` 只由 `handoff` 生成；`ops-sync` 不写它。

## 输出原则

- 使用简体中文。
- 缺失信息显式标注“待确认”，不要凭空补全。
- 结论尽量绑定证据：文件、命令、Issue、KB、来源链接。
- 每次完成用户任务后，最终回复必须附上更新后的 `TODO.md` 状态摘要；若本轮改动了 `TODO.md`，要说明新增、完成或调整了哪些条目。
- 每轮涉及前端交互或页面表现的任务，必须分配一个测试 agent；测试 agent 使用 Playwright MCP / Playwright CLI 调用本地 Chrome/Chromium 模拟人工操作并产出截图或可核验日志，不允许只靠静态代码审查。
- 测试 agent 必须优先模拟用户日常输入与按钮路径：点击、输入、选择、提交、切换页面、关闭弹层、截图；不能只调用内部函数或只断言静态 DOM。
- 测试 agent 的提示词必须明确：不要使用面板 CLI，不要注册窗口，不要修改业务代码；只负责像真实用户一样点击、输入、截图和报告问题。
