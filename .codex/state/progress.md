# Progress

## Current Focus

- 仓库分支已收敛为占位的 main 与唯一开发分支 feature/self-supervision-mvp；后续开发与验证统一在 feature/self-supervision-mvp 对应 worktree 上进行。

## Active Issues

- main 已重置为占位分支，只保留 README.md 与 .gitignore；不要再把 main 当作功能开发主线。
- 唯一正式开发分支为 feature/self-supervision-mvp；当前开发目录仍位于 .worktrees/archive-merge-into-self-supervision，后续要以分支名而不是目录名识别主线。
- 旧目录 .worktrees/self-supervision-mvp 仍有物理残留，因为 qa-http-server.log 正被占用；这不是 Git worktree 绑定问题，而是日志文件句柄未释放。

## Blockers

- None

## Next 3 Actions

1. 后续所有实现、测试和浏览器验证统一在 feature/self-supervision-mvp 所在 worktree 上执行；开始新任务前先检查 git status --short。
2. 在方便时停止占用 qa-http-server.log 的进程，删除残留目录 .worktrees/self-supervision-mvp，完成旧 worktree 物理清理。
3. 下一次阶段性变更后补新的 handoff 或 ops-sync，避免状态再次停留在旧的 merge/archive 命名上。

## Done
- 已完成项目持久上下文初始化。
- 已记录项目目标与当前最紧迫问题。
- 已记录多 agent 协作分工偏好。
- 将日历周视图从 7 张独立白卡改为更接近 FullCalendar timeGrid 的共享网格结构。
- 新增周范围标题、共享时间轴、today 高亮与 now line。
- 为日历事件块加入分类色变量，并调整 compact 规则，避免中等高度双列事件被过度压缩。
- 新增并更新 calendar-view DOM 测试，验证共享时间轴、可读性规则和分类色注入。
- 运行 npm test，全量 73 项测试通过。
- 将重叠事件布局从严格等分改为更接近 FullCalendar `slotEventOverlap` 的阶梯式半遮挡策略。
- 新增 `getOverlapVisualMetrics` 回归测试，并更新 DOM / 样式契约测试，验证 3 列 overlap、`now line` 层级与日列可访问标签。
- 再次运行 npm test，全量 75 项测试通过。
- 完成桌面端与移动端三重重叠浏览器复测：桌面端前两块宽度约 119.6px、第三块约 57.8px；移动端前两块约 75.3px、第三块约 35.7px。
- 已引入并调研本地参考项目 `参考项目/ilamy-calendar-main`，确认其日内重叠事件采用动态 offset layered overlap，而不是 FullCalendar 式线性压窄。
- 已将当前项目的重叠事件视觉公式调整为参考项目式策略：2 并发 `100/75`，3 并发 `100/75/50`，4 并发 `100/80/60/40`，5+ 总偏移封顶 `70%`。
- 再次运行 npm test，全量 75 项测试通过。
- 完成桌面端与移动端三重重叠浏览器复测：桌面端约 `182.3 / 135.7 / 89.1px`，移动端约 `115 / 85.25 / 55.5px`。
- 为 layered overlap 继续加入按 lane 递减的背景透明度、递增阴影与 hover 态恢复更实卡片的视觉 token。
- 更新 DOM / 样式契约测试后再次运行 npm test，全量 77 项测试通过。
- 完成透明度增强版三重重叠浏览器复测，确认桌面 / 移动端宽度保持不变，样式变量为：底层 `0.18`、中层 `0.13`、上层 `0.10`。
- 确认 python -m http.server 4173 在当前环境下可以稳定托管 prototype-mvp 静态页面。
- 完成桌面端浏览器 smoke QA，确认周范围标题、today 高亮、now line 和分类色事件块已生效。
- 完成移动端浏览器 smoke QA，确认周视图采用横向滚动而不是强行压缩成单列。
- 完成手动补记真实交互测试，表单校验生效，提交后事件写入 localStorage 并关闭弹窗。
- 实现 manual/task 日历块统一编辑、删除与 task 放弃链路
- 补充并归并 calendar-view DOM 回归测试，覆盖 manual/task 的编辑、删除、放弃路径
- 运行 npm test，全量 82 项通过
- 新增 docs/agent-team-injection-protocol.md，固化当前 agent team 注入规范
- backend 评估确认当前功能无需后端支持，task 日历块仍是 tasks 的投影
- 修复已放弃 task 在统一编辑中可丢失放弃原因的问题
- 修复 unified manual edit 清空开始时间时的错误提示映射
- 运行 npm test，全量 84 项通过
- 完成桌面/移动端浏览器 QA，确认核心编辑链路与按钮布局正常
- 吸收最终 QA/review/research 结论，确认当前真正问题是 3+ lane 高密度可读性而不是统一编辑链路。
- 将 getOverlapVisualMetrics 调整为 2 lane 保留 layered overlap、3+ lane 改为非重叠分栏。
- 将 calendar-week 日列最小宽度提高到 190px，配合现有横向滚动为 3+ 并发提供额外可读宽度。
- 更新 calendar-layout/calendar-view-dom/calendar-style-contract 测试并运行 npm test，全量 85 项通过。
- 完成桌面 1440px 与移动端 390px 浏览器复测：三条同时间段块均无 pairwise overlap，编辑弹窗仍完整位于视口内。
- 确认当前 overlap 修复不需要后端支持；它仍是纯前端布局与渲染层问题。
- 修复 getOverlapVisualMetrics 对 3+ lane 的错误宽度计算，恢复 layered overlap。
- 修正 calendar-layout.test.js 与 calendar-view-dom.test.js 中被错误实现固化的预期。
- 完成重叠但非 compact 卡片的内容减载，改为标题优先展示。
- 通过测试与真浏览器 CSS 渲染双重验证确认回归已修复。
- 修复 ops-sync orchestrator 在 Windows 中文路径下 normalize→apply 间的 UTF-8 输出链路。
- 为 ops_sync_run.py 补充中文路径回归测试，并在 SKILL.md 明确 Windows 中文路径约束。
- 提升 #modal-host 的 stacking context，修复 now line 红线压过编辑弹窗的层级问题。
- 重新运行 ops-sync 与日历相关自动化测试：python 单测通过，vitest 34/34 通过。
- 完成 Web 任务工作台 Task 3-5：将任务页落为桌面两栏工作台，引入右侧任务抽屉与垃圾篓抽屉，并补齐归档页点击、恢复、编辑链路。
- 新增 `tests/task-style-contract.test.js`，锁定两栏布局、列内滚动、空状态、右侧抽屉和归档层级的样式契约。
- 定向测试通过：`npm test -- tests/task-view-dom.test.js tests/archive-view-dom.test.js tests/task-style-contract.test.js` 共 30/30 通过。
- 全量测试通过：`npm test` 共 101/101 通过。
- 完成桌面端真实浏览器 QA：验证工作台左 rail / 右主区为真实两栏；任务抽屉、垃圾篓抽屉、归档页点击/恢复链路在本地静态服务下可用。
- 浏览器 QA 抓到并修复归档任务 `dueAt = null` 被错误渲染/保存为 `1970-01-01T08:00` 的问题；新增归档 DOM 回归测试锁定空截止时间保持为空。
- 再次运行全量测试：`npm test` 共 102/102 通过。
- 确认 merge worktree `merge/archive-into-self-supervision` 最近提交为 `980d46b`、`5eb99f6`、`f68b1ef`，且 `git status --short` 为空。
- 确认原 `feature/self-supervision-mvp` worktree 仍是脏现场，包含 `styles.css`、多份测试文件与新增文档等未整理改动。
- 已做出分支治理决策：正式冻结原脏 worktree，后续开发主线切换到 merge worktree。
- 已补齐 `Done -> Archived` 每日自动流转：`rolloverTasks()` 现在会在跨日本地日时自动归档已完成任务，`bootstrap()` 载入旧状态时同样生效。
- 已补测试锁定自动归档行为：`tests/rollover-calendar.test.js` 与 `tests/task-view-dom.test.js` 定向验证共 `34/34` 通过。
- 已完成分支规范化：唯一正式开发分支为 `feature/self-supervision-mvp`，旧脏现场与 clean 临时分支分别归档为 `archive/feature-self-supervision-mvp-dirty-20260417` 与 `archive/feature-archive-task1-clean`。
- 已对 main 的未提交现场做归档提交 caae4f1，并随后提交 31591b8 将 main 重置为仅保留 README.md 与 .gitignore 的占位分支。
- 已对原 clean / dirty 归档分支的未提交现场分别做归档提交 80a7183 与 496ca89，并删除对应分支引用。
- 已删除其他项目分支，当前 git branch -vv 只剩 main 与 feature/self-supervision-mvp。
- 已保留 archive-feature-archive-task1-clean-20260417 与 archive-feature-self-supervision-mvp-dirty-20260417 两个 tag，作为已删分支历史锚点。

## Notes
- 当前真实主线已从旧日历优化切到 Web 任务工作台与归档模块；除非用户明确切回，否则不要再按旧 overlap / now line Next 3 推进。
- 后续由主 agent 统一编排调研、实现、审查、用户测试与状态同步，避免多 agent 直接并发写状态文件。
- 用户已明确提供 https://fullcalendar.io/demos 作为期望效果参考，目标从泛化的 Notion Calendar 收敛到 FullCalendar timeGrid。
- 已参考 FullCalendar `slotEventOverlap` 官方文档与源码思路，当前实现对齐到“允许重叠且最多遮住一半”的视觉策略。
- 经过与本地参考项目对比，当前更偏向“可读性优先”的 layered overlap，而不是完全追随 FullCalendar 的保守半遮挡公式。
- 参考项目本身并不依赖更透明的色块或强 hover/focus 态，当前项目的分层透明度与 hover 阴影属于在其布局思路之上的增强，而不是照搬。
- 浏览器截图验证中出现本地服务进程不稳定问题，当前判断为环境层问题，不是前端代码回归。
- 移动端视口本轮复测下 .calendar-week 的 clientWidth=435、scrollWidth=892、overflowX=auto。
- 三车道 layered overlap 下，移动端 today 列宽约 115px、85.25px、55.5px，明显优于上一轮 FullCalendar 风格实现，但 4 列以上仍需继续观察。
- 当前代码工作目录仍是 .worktrees/self-supervision-mvp/prototype-mvp，而状态目录在仓库根 .codex/state
- 子 agent 若运行在独立 worktree 但真实源码位于绝对路径时，prompt 必须显式声明源码根，避免误判无文件
- 本轮验证证据为 npm test 全量 82/82 通过
- 桌面端浏览器 QA：manual 编辑保存成功，task 删除后任务与日历投影同时消失
- 移动端浏览器 QA：task 放弃后状态变为 trash，放弃原因成功写回；modal 按钮组右边界未超出视口
- review agent 将当前问题定义为真实几何 overlap 造成的可读性风险；qa agent补充指出旧 QA 的矩形相交规则过严，但在高密度场景下仍存在真实体验风险。主 agent 已采纳折中方案：2 lane 保留 layered overlap，3+ lane 改为并排分栏。
- research agent 建议未来 4+ 密度优先考虑 eventMaxStack / +N / agenda-modal 这类结构性降级，而不是继续局部 CSS 微调。
- 当前真实实现已重新对齐参考项目式 layered overlap。
- 此前 state/HANDOFF 中关于“3+ non-overlap”的描述应视为过时。
- 此前 interaction-log 中“验证中文路径 orchestrator”仅是链路 smoke 记录，这一轮才是正式根因修复与状态同步。
- 红线压 modal 的问题当前已完成代码修复与自动化验证，真实浏览器专测仍需在下一步单独确认。
- 当前工作台链路里的“详情操作”已经从旧 modal 迁到右侧 drawer；后续涉及 task/trash/archive 交互时，默认先检查 drawer 状态和事件分发，而不是按旧 modal 语义排查。
- 浏览器自动化里，文本输入对抽屉标题更稳定的是 `type_text(clear_first=true)` 而不是 `paste_text`；后续做实机脚本时优先用前者，避免误判为页面未保存。
- 除非用户明确要求回收或清理旧现场，否则不要删除、重置或覆盖原 `feature/self-supervision-mvp` worktree；它当前只承担“保留脏现场”的作用。
- 后续窗口若看到 `progress.md` 与本地 worktree 事实冲突，应以 merge worktree 的实时 `git status` / `git log` 为准。
- 当前 `.gitignore` 的最新期望状态包含 `.ace-tool/` 忽略规则；后续不要把这类环境差异视作业务功能变更。
- main 当前是空壳入口分支，README.md 明确声明 MVP 主力开发分支为 feature/self-supervision-mvp。
- 当前 feature/self-supervision-mvp 对应 worktree 工作区干净，最新提交为 409fbc0 feat: automate done task archival on rollover。
- 如果后续需要彻底清理旧目录，先处理 qa-http-server.log 的占用进程，再删 .worktrees/self-supervision-mvp。
