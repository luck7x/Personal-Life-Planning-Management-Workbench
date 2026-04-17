---
name: project-kickoff
description: 项目开场分流入口。引导用户选择“从 0 开始”或“接手现有项目”，必要时先安装本地 `.codex/skills` 套件，再初始化 `.codex/state/` 骨架并填写 BRIEF.md。
---

# Project Kickoff

你现在要执行"项目开场引导"。

目标：在项目开始时，以对话方式引导用户完成初始化设置，建立持久上下文基础。

## 前置检查

若当前项目根目录下不存在以下任一项：

- `.codex/skills/ops-sync`
- `.codex/skills/handoff`
- `.codex/skills/handoff-resume`

则先提示用户运行：

```powershell
python .codex/skills/project-state-init/scripts/project_state_init.py --init-state
```

若本地还没有 `project-state-init`，则提示使用全局 bootstrap：

```powershell
python "$env:USERPROFILE\.codex\skills\project-state-init\scripts\project_state_init.py" --init-state
```

## 问答流程

### Step 1: 检测项目模式

输出：
```
检测到项目目录：{cwd}
当前是哪种模式？
A) 从 0 开始新项目
B) 接手现有项目
```

等待用户选择。

### Step 2: 是否启用持久上下文

输出：
```
是否启用"项目持久上下文"套件？(Y/n)
```

若用户选择 N，输出简要说明后结束。

### Step 3a: 从 0 开始

1. 提示用户运行 `project-state-init --init-state`，确保 `.codex/state/` 骨架存在
2. 询问：请简述项目目标（一句话）
3. 询问：请列出硬约束（如有）
4. 将用户回答填入 `.codex/state/BRIEF.md` 的 Goal 和 Hard Constraints 节
5. 输出后续使用指南

### Step 3b: 接手现有项目

1. 提示用户运行 `project-state-init --init-state`，确保 `.codex/state/` 骨架存在
2. 询问：请简述项目目标
3. 询问：当前最紧迫的问题是什么？
4. 填写 BRIEF.md + progress.md 初始内容
5. 输出后续使用指南

### Step 4: 可选协作分工

输出：
```
是否记录协作分工偏好？(y/N)
```

若是：
- 调研任务交给：___
- 写码任务交给：___
- 审查任务交给：___
- 写入 BRIEF.md 的末尾 Agent Roles 节

## 后续使用指南输出

```
骨架已就绪。后续工作流：
- /ops-sync — 记录关键决策和状态变更
- /handoff — 生成交接文档（换窗口/上下文快满时）
- /handoff-resume — 在新窗口恢复上下文
```

## 约束

- 不自动接管每轮同步
- 不大量写状态
- 不替代 ops-sync
- 不写入未经用户确认的信息
- 这是对话流程 skill，不承诺自动执行安装脚本

