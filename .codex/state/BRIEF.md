# BRIEF

## Goal

- 创建一个 Web 页面，用于监督用户的 ToDo List 和时间记录，整体体验参考 Notion Calendar。

## Hard Constraints

- 日历视图需要尽量接近 Notion Calendar 的视觉与交互风格。
- 日程块中的文字必须保持可读，不能因为块的长宽高问题被严重压缩。

## Scope

- In scope:
  - ToDo List 与时间记录的统一日历视图。
  - 日历视图样式优化，向 Notion Calendar 靠拢。
  - 修复当前日程块在布局尺寸下的内容显示问题。
- Out of scope:
  - None

## Open Questions

- 用户当前最看重的是视觉还原、信息密度，还是交互行为一致性，尚未明确。
- 需要对齐到 Notion Calendar 的范围是否包含拖拽、缩放、跨天事件等交互，尚未明确。

## Requirements Evolution
- 初始目标：做一个监督 ToDo List 和时间记录的 Web 页面。
- 当前优先级：先优化日历视图，使其更接近 Notion Calendar。
- 已知问题：日程块因尺寸设计不合理导致文字被压缩，影响可读性与观察效率。
- 已确认采用多 agent 协作偏好，由主 agent 统一编排并负责状态写入与 ops-sync。
- 用户已明确以 FullCalendar demos 作为日历视图参考，当前周视图优化应优先对齐 FullCalendar timeGrid 的结构、信息密度与事件块可读性。
- 已确认当前重叠事件策略优先参考 FullCalendar `slotEventOverlap`：允许事件重叠，且视觉上最多遮住一半，而不是按 lane 严格等分压窄。
- 用户已引入本地参考项目 `参考项目/ilamy-calendar-main`，后续日历并行任务块的可读性优化可以直接借鉴其日内 layered overlap 与 UI 处理思路。
- 当前优先级已从周视图 overlap/截断提示切换为日历块统一编辑；task 日历块与真实任务记录保持一一对应，时间修改即修改真实任务记录。
- 当前高密度 overlap 第一轮修复已完成：保留 2 lane layered overlap，3+ lane 改为非重叠分栏，并将后续主线收敛为 4+ 并发的 +N / agenda 等降级策略评估。
- 日历周视图已恢复参考项目式 layered overlap；3+ 并发不再采用 non-overlap 分栏，后续关注点转为 4+ 并发降级策略。
- 当前优先级已切到 Web 任务工作台改版：Task 3-5 已完成桌面两栏布局、右侧任务抽屉、垃圾篓抽屉与归档页恢复/编辑链路，下一步先做真实浏览器 QA 再决定是否收尾提交。

## Agent Roles

- 主 agent：负责整体编排、任务拆解、结果汇总、实现代码变更，以及使用 `ops-sync` 记录关键决策和状态变更。
- 调研 agent：负责外部检索与事实核查，优先使用 `grok search mcp`，`extra_sources` 目标配置为 `20`，并结合 Exa 相关 skills 辅助检索。
- 前端 agent：负责前端实现与页面优化，优先使用前端相关 skills、plugins，并可通过 MCP 启动浏览器做验证；若现有前端 skills 不足，可进一步检索并安装对当前项目有效的权威 skills。
- 后端 agent：按需介入，负责后端相关支持；若当前阶段无需后端能力，则不强制启用。
- 代码审查 agent：负责独立审查代码，重点检查缺陷、回归风险、样式/结构问题与测试缺口。
- 用户测试 agent：负责模拟真实用户操作测试 Web 内容，覆盖基本交互、布局错位、样式重叠等问题，并可通过 MCP 启动浏览器执行验证；若现有工具链不足，可进一步检索适合 Codex 联动的 MCP 或 skills，辅助前端自动化测试。
