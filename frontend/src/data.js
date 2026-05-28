export const tabs = [
  { key: "today", label: "今天" },
  { key: "week", label: "周览" },
  { key: "projects", label: "项目" },
  { key: "review", label: "复盘" },
  { key: "health", label: "养息" },
  { key: "settings", label: "设置" }
];

export const themes = [
  { key: "porcelain", name: "白瓷雾蓝", colors: ["#20326f", "#ffe2a8", "#2d8f95"] },
  { key: "camellia", name: "山茶赤陶", colors: ["#7a2038", "#ffd6b3", "#3e8d72"] },
  { key: "lake", name: "湖水青绿", colors: ["#004e5e", "#bdf7e8", "#0c71b8"] },
  { key: "graphite", name: "夜航石墨", colors: ["#111421", "#f2c66d", "#90b7ff"] },
  { key: "ink", name: "纸墨金章", colors: ["#11141d", "#f0c65b", "#b23a48"] }
];

export const todayItems = [
  {
    id: "memo-1",
    tone: "memo",
    title: "晚上饭后取快递",
    status: "memo",
    meta: ["19:30 提醒", "不进入逾期"],
    action: "完成"
  },
  {
    id: "today-1",
    tone: "today",
    title: "完成手机首页样例",
    projectId: "project-personal-system",
    status: "todo",
    draggable: true,
    meta: ["个人系统", "子任务 0/2", "已专注 24 分钟"],
    action: "专注",
    subtasks: [
      { id: "today-1-sub-1", title: "补齐专注主流程", meta: ["预计 45min", "可单独专注"] },
      { id: "today-1-sub-2", title: "验证休息恢复", meta: ["预计 20min", "测试用"] }
    ]
  },
  {
    id: "today-2",
    tone: "today",
    title: "整理导师项目材料",
    projectId: "project-mentor",
    status: "todo",
    draggable: true,
    meta: ["导师项目", "今日推进"],
    action: "专注"
  },
  {
    id: "future-1",
    tone: "future",
    title: "周三前交论文初稿",
    projectId: "project-mentor",
    status: "planned",
    meta: ["剩 2 天", "可明天开始"],
    action: "排入"
  },
  {
    id: "idea-1",
    tone: "idea",
    title: "做一个自己的记录系统",
    status: "todo",
    meta: ["无期限", "好想法先放着"],
    action: "看看"
  }
];

export const defaultProjects = [
  {
    id: "project-personal-system",
    title: "个人记录系统",
    note: "活跃任务 4 个，今日已排入 1 个。项目只负责承载长期上下文，不直接压到首页。"
  },
  {
    id: "project-mentor",
    title: "导师项目",
    note: "下一步：整理材料和本周沟通记录。可归档，归档后不进入日常干扰。"
  }
];

export const defaultReflection = `## 今天的判断
不要把工具做成负担。

- 首页只保留今天需要看的东西
- 项目放后面
- 复盘由系统先帮我铺底`;
