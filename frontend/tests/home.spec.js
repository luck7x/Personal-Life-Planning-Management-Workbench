import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "state api disabled in default e2e" })
    });
  });
});

test("首页支持快速添加和今日执行排序", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "今天先安顿下来" })).toBeVisible();
  await expect(page.getByText("当前没有专注")).toBeVisible();
  await expect(page.getByRole("heading", { name: "备忘" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日执行" })).toBeVisible();

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("测试新增任务");
  await page.getByLabel("所在分区").selectOption({ label: "今日执行" });
  await page.getByLabel("开始时间").fill("18:00");
  await page.getByLabel("提前提醒").fill("15");
  await page.getByRole("button", { name: "加入任务" }).click();

  const todayTasks = page.locator('[data-section="today"] [data-task-title]');
  await expect(todayTasks).toContainText(["完成手机首页样例", "整理导师项目材料", "测试新增任务"]);
  await expect(todayTasks.filter({ hasText: "测试新增任务" })).toContainText("通知：提前 15 分钟");

  await page.getByRole("button", { name: "上移 测试新增任务" }).click();
  await page.getByRole("button", { name: "上移 测试新增任务" }).click();

  await expect(todayTasks.first()).toContainText("测试新增任务");
});

test("任务卡支持直接打勾完成并进入已完成", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("完成任务 整理导师项目材料").check();

  await expect(page.locator('[data-section="today"] [data-task-title="整理导师项目材料"]')).toHaveCount(0);
  const doneTask = page.locator('[data-section="done"] [data-task-title="整理导师项目材料"]');
  await expect(doneTask).toBeVisible();
  await expect(doneTask).toContainText("已完成");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "复盘", exact: true }).click();
  await expect(page.locator(".review-card").filter({ hasText: "已完成" })).toContainText("整理导师项目材料");
});

test("周视图只展示明确排期和真实日期记录", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("完成任务 整理导师项目材料").check();
  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("今天明确排期任务");
  await page.getByLabel("所在分区").selectOption({ label: "今日执行" });
  await page.getByLabel("开始时间").fill("14:00");
  await page.getByLabel("结束时间").fill("15:00");
  await page.getByRole("button", { name: "加入任务" }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "周览", exact: true }).click();

  await expect(page.getByRole("heading", { name: "流光周历" })).toBeVisible();
  await expect(page.locator("[data-week-day-col]")).toHaveCount(7);
  await expect(page.locator(".week-hour-label")).toContainText(["06:00", "12:00", "18:00", "24:00"]);
  await expect(page.locator("[data-week-block]").filter({ hasText: "今天明确排期任务" })).toBeVisible();
  await expect(page.locator("[data-week-block]")).not.toContainText("晚上饭后取快递");
  await expect(page.locator("[data-week-block]")).not.toContainText("完成手机首页样例");
  await expect(page.locator("[data-week-block]")).not.toContainText("整理导师项目材料");
  await expect(page.getByText("本周完成 1 项")).toBeVisible();
  await expect(page.locator(".summary-list").filter({ hasText: "整理导师项目材料" })).toBeVisible();
  const weekLayout = await page.evaluate(() => {
    const shell = document.querySelector(".week-timeline-shell");
    const today = document.querySelector("[data-week-today='true']");
    const axis = document.querySelector(".week-time-axis");
    const shellRect = shell.getBoundingClientRect();
    const todayRect = today.getBoundingClientRect();
    const todayCenter = todayRect.left + todayRect.width / 2;
    const shellCenter = shellRect.left + shellRect.width / 2;
    return {
      todayNearCenter: Math.abs(todayCenter - shellCenter) < shellRect.width * 0.28,
      axisPosition: getComputedStyle(axis).position
    };
  });
  expect(weekLayout.todayNearCenter).toBe(true);
  expect(weekLayout.axisPosition).toBe("sticky");
});

test("后端空状态不会在周历回退显示示例任务", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.unroute("**/api/state");
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updated_at: "2026-05-29T00:00:00+00:00",
          state: {
            version: 2,
            theme: "ink",
            projects: [],
            tasks: [],
            timeBlocks: { [today]: [] },
            completedRecords: [],
            reviewDaily: { entries: { [today]: { reflection: "" } } },
            healthHabits: [],
            notificationSettings: {}
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updated_at: "2026-05-29T00:01:00+00:00", state: route.request().postDataJSON().state })
    });
  });

  await Promise.all([
    page.waitForResponse("**/api/state"),
    page.goto("/?view=week")
  ]);
  await expect(page.locator("[data-week-day-col]")).toHaveCount(7);
  await expect(page.locator("[data-week-block]")).toHaveCount(0);
  await expect(page.getByText("晚上饭后取快递")).toHaveCount(0);
  await expect(page.getByText("完成手机首页样例")).toHaveCount(0);
});

test("周视图支持手动补录和编辑时间块", async ({ page }) => {
  await page.goto("/?view=week");

  await page.getByRole("button", { name: "补录时间块" }).click();
  await page.getByLabel("补录标题").fill("补记晚间散步");
  await page.getByLabel("补录开始时间").fill("20:00");
  await page.getByLabel("补录结束时间").fill("20:30");
  await page.getByRole("button", { name: "保存时间块" }).click();

  await expect(page.locator("[data-week-block]").filter({ hasText: "补记晚间散步" })).toBeVisible();
  await page.getByRole("button", { name: "编辑时间块 补记晚间散步" }).click();
  await page.getByLabel("补录标题").fill("补记晚间散步");
  await page.getByRole("button", { name: "保存时间块" }).click();
  await page.getByRole("button", { name: "编辑时间块 补记晚间散步" }).click();
  await page.getByLabel("补录标题").fill("补记晚间散步 v2");
  await page.getByLabel("补录结束时间").fill("20:45");
  await page.getByRole("button", { name: "保存时间块" }).click();

  const edited = page.locator("[data-week-block]").filter({ hasText: "补记晚间散步 v2" });
  await expect(edited).toBeVisible();
  await expect(edited).toContainText("20:00 - 20:45");
});

test("子任务卡片可勾选且全部完成后父任务自动完成", async ({ page }) => {
  await page.goto("/");

  const parentTask = page.locator('[data-task-title="完成手机首页样例"]');
  await page.getByLabel("完成子任务 补齐专注主流程").check();
  await expect(parentTask).toContainText("子任务 1/2");
  await expect(parentTask).toBeVisible();

  await page.getByLabel("完成子任务 验证休息恢复").check();
  await expect(page.locator('[data-section="today"] [data-task-title="完成手机首页样例"]')).toHaveCount(0);
  const doneParent = page.locator('[data-section="done"] [data-task-title="完成手机首页样例"]');
  await expect(doneParent).toBeVisible();
  await expect(doneParent).toContainText("子任务 2/2");
});

test("复盘自由反思支持实时 Markdown 预览", async ({ page }) => {
  await page.goto("/?view=review");

  await page.locator(".markdown-box").fill("## 新复盘\n今天 **推进** 了首页。\n- 快速添加\n- 排序");

  const preview = page.locator(".markdown-preview");
  await expect(preview.getByRole("heading", { name: "新复盘" })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("推进");
  await expect(preview.locator("li")).toHaveText(["快速添加", "排序"]);
});

test("任务和子任务支持专注、休息暂停和恢复", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "开始专注 完成手机首页样例" }).click();
  await expect(page.getByRole("dialog", { name: "开始专注设置" })).toBeVisible();
  await page.getByLabel("预计时长（分钟，可留空）").fill("30");
  await page.getByLabel("提前提醒（分钟，可留空）").fill("3");
  await page.getByRole("button", { name: "开始", exact: true }).click();

  await expect(page.locator(".now-panel").getByText("正在专注：完成手机首页样例", { exact: true })).toBeVisible();
  await expect(page.getByText("预计 30 分钟 · 结束前 3 分钟提醒")).toBeVisible();
  await expect(page.locator(".timeline")).toContainText("正在专注：完成手机首页样例");

  await page.getByRole("button", { name: "一键休息" }).click();
  await expect(page.getByRole("dialog", { name: "一键休息设置" })).toBeVisible();
  await page.getByLabel("预计休息（分钟）").fill("1");
  await page.getByRole("button", { name: "开始休息" }).click();

  await expect(page.getByRole("dialog", { name: "休息中" })).toBeVisible();
  await expect(page.locator(".timeline")).toContainText("完成手机首页样例");
  await expect(page.locator(".timeline")).toContainText("休息中");
  await page.getByRole("button", { name: "结束休息" }).click();

  await expect(page.getByRole("dialog", { name: "恢复专注" })).toBeVisible();
  await page.getByRole("button", { name: "恢复专注" }).click();
  await expect(page.locator(".now-panel").getByText("正在专注：完成手机首页样例", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "结束专注" }).click();
  await expect(page.getByRole("dialog", { name: "结束专注校正" })).toBeVisible();
  await page.getByRole("button", { name: "记录完成" }).click();
  await expect(page.locator(".timeline")).toContainText("完成手机首页样例");
});

test("子任务可以单独开始专注", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "开始专注 补齐专注主流程" }).click();
  await expect(page.getByRole("dialog", { name: "开始专注设置" })).toContainText("补齐专注主流程");
  await page.getByRole("button", { name: "开始", exact: true }).click();

  await expect(page.locator(".now-panel").getByText("正在专注：补齐专注主流程", { exact: true })).toBeVisible();
  await expect(page.getByText("归属：完成手机首页样例")).toBeVisible();
});

test("设置页支持 WxPusher 测试，专注超时会自动暂停并要求校正", async ({ page }) => {
  const notificationRequests = [];
  await page.route("**/api/notifications/test", async (route) => {
    notificationRequests.push({
      headers: route.request().headers(),
      body: route.request().postDataJSON()
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, results: [{ channel: "wxpusher", ok: true, detail: "ok" }] })
    });
  });

  await page.goto("/?view=settings");
  await page.getByLabel("WxPusher SPT").fill("SPT_TEST_ONLY");
  await page.getByLabel("后端访问密钥").fill("TOKEN_TEST_ONLY");
  await page.getByLabel("任务默认提前提醒").fill("12");
  await page.getByLabel("专注结束前提醒").fill("0");
  await page.getByLabel("专注超时兜底分钟").fill("0.01");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText("连接信息已保存到当前设备；通知规则会随工作台状态写入后端。")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("WxPusher SPT")).toHaveValue("SPT_TEST_ONLY");
  await expect(page.getByLabel("后端访问密钥")).toHaveValue("TOKEN_TEST_ONLY");
  await expect(page.getByLabel("后端 API 地址")).toHaveValue("http://127.0.0.1:8000/api");
  await page.getByRole("button", { name: "发送测试" }).click();
  await expect(page.getByText("WxPusher 通知已发送。")).toBeVisible();
  expect(notificationRequests[0].headers["x-mingxin-token"]).toBe("TOKEN_TEST_ONLY");
  expect(notificationRequests[0].body.wxpusher_spt).toBe("SPT_TEST_ONLY");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "今天", exact: true }).click();
  await page.getByRole("button", { name: "开始专注 完成手机首页样例" }).click();
  await page.getByLabel("预计时长（分钟，可留空）").fill("0.01");
  await page.getByLabel("提前提醒（分钟，可留空）").fill("0");
  await page.getByRole("button", { name: "开始", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "结束专注校正" })).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole("dialog", { name: "结束专注校正" })).toContainText("自动暂停");
  await page.getByRole("button", { name: "记录完成" }).click();
  await expect(page.locator(".timeline")).toContainText("完成手机首页样例");
  expect(notificationRequests.length).toBeGreaterThanOrEqual(3);
});

test("后端状态可恢复并在修改后自动保存", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const postedStates = [];
  await page.unroute("**/api/state");
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updated_at: "2026-05-28T00:00:00+00:00",
          state: {
            version: 2,
            theme: "ink",
            projects: [{ id: "project-backend", title: "后端项目", note: "从后端恢复" }],
            tasks: [
              {
                id: "backend-task-1",
                lane: "today",
                tone: "today",
                title: "后端恢复任务",
                status: "todo",
                projectId: "project-backend",
                subtasks: []
              }
            ],
            timeBlocks: { [today]: [] },
            completedRecords: [],
            reviewDaily: { entries: { [today]: { reflection: "## 后端复盘" } } },
            healthHabits: [
              { id: "water", icon: "💧", title: "饮水", mode: "multi", unit: "ml", defaultValue: "250", records: [] }
            ],
            notificationSettings: {
              enabled: true,
              wxpusherSpt: "SPT_FROM_BACKEND",
              taskLeadMinutes: 8,
              focusLeadMinutes: 3,
              focusGraceMinutes: 30
            }
          }
        })
      });
      return;
    }
    postedStates.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updated_at: "2026-05-28T00:01:00+00:00", state: route.request().postDataJSON().state })
    });
  });

  await page.goto("/");
  await expect(page.getByText("后端恢复任务")).toBeVisible();
  await expect(page.getByText("已同步")).toBeVisible();

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("写入后端的新任务");
  await page.getByLabel("所在分区").selectOption({ label: "今日执行" });
  await page.getByRole("button", { name: "加入任务" }).click();

  await expect.poll(() => postedStates.some((entry) => entry.state.tasks.some((task) => task.title === "写入后端的新任务"))).toBe(true);
  const lastState = postedStates.findLast((entry) => entry.state.tasks.some((task) => task.title === "写入后端的新任务")).state;
  expect(lastState.tasks.some((task) => task.title === "写入后端的新任务")).toBe(true);
  expect(lastState.notificationSettings.wxpusherSpt).toBe("SPT_FROM_BACKEND");
  expect(lastState.notificationSettings.apiToken).toBeUndefined();

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "复盘", exact: true }).click();
  await expect(page.locator(".markdown-box")).toHaveValue("## 后端复盘");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "养息", exact: true }).click();
  await expect(page.getByRole("heading", { name: "饮水" })).toBeVisible();
});

test("复盘页自动汇总用户日常输入、时间线和未完成事项", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("晚上买牛奶");
  await page.getByLabel("所在分区").selectOption({ label: "备忘" });
  await page.getByLabel("开始时间").fill("19:30");
  await page.getByRole("button", { name: "加入任务" }).click();

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("写复盘测试任务");
  await page.getByLabel("所在分区").selectOption({ label: "今日执行" });
  await page.getByLabel("开始时间").fill("21:00");
  await page.getByRole("button", { name: "加入任务" }).click();

  await page.getByRole("button", { name: "开始专注 写复盘测试任务" }).click();
  await page.getByLabel("预计时长（分钟，可留空）").fill("25");
  await page.getByLabel("提前提醒（分钟，可留空）").fill("5");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("button", { name: "一键休息" }).click();
  await page.getByLabel("预计休息（分钟）").fill("5");
  await page.getByRole("button", { name: "开始休息" }).click();
  await page.getByRole("button", { name: "结束休息" }).click();
  await page.getByRole("button", { name: "恢复专注" }).click();
  await page.getByRole("button", { name: "结束专注" }).click();
  await page.getByLabel("真实结束时间").fill("21:30");
  await page.getByRole("button", { name: "记录完成" }).click();

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "复盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日时间线" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "自动摘要" })).toBeVisible();
  await expect(page.locator(".timeline")).toContainText("写复盘测试任务");
  await expect(page.locator(".review-card").filter({ hasText: "已完成" })).toContainText("写复盘测试任务");
  await expect(page.getByText("晚上买牛奶")).toBeVisible();
  await expect(page.getByText("整理导师项目材料")).toBeVisible();

  await page.locator(".markdown-box").fill("## 晚间复盘\n今天完成了 **复盘闭环**。\n- 记录时间线\n- 看未完成");
  await expect(page.locator(".markdown-preview").getByRole("heading", { name: "晚间复盘" })).toBeVisible();
  await expect(page.locator(".markdown-preview").locator("strong")).toHaveText("复盘闭环");

  await page.locator(".markdown-box").scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const app = document.querySelector(".app");
    const phone = document.querySelector(".phone");
    const tabbar = document.querySelector(".tabbar");
    const textarea = document.querySelector(".markdown-box");
    const visibleButtons = [...document.querySelectorAll("button")]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => button.getBoundingClientRect());
    const tabbarRect = tabbar.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    return {
      appOverflowsX: app.scrollWidth > app.clientWidth + 1,
      phoneOverflowsX: phone.scrollWidth > phone.clientWidth + 1,
      textareaCoveredByTabbar: textareaRect.bottom > tabbarRect.top,
      tinyButtons: visibleButtons.filter((rect) => rect.width < 24 || rect.height < 24).length
    };
  });

  expect(layout.appOverflowsX).toBe(false);
  expect(layout.phoneOverflowsX).toBe(false);
  expect(layout.textareaCoveredByTabbar).toBe(false);
  expect(layout.tinyButtons).toBe(0);
  await page.screenshot({ path: "../docs/prototypes/mingxintai-2-todo7-review-390.png" });
});

test("项目页支持新增项目", async ({ page }) => {
  await page.goto("/?view=projects");

  await page.getByRole("button", { name: "新增项目" }).click();
  await page.getByLabel("项目名称").fill("VPS 运维");
  await page.getByLabel("项目备注").fill("续期、备份和部署记录都收在这里。");
  await page.getByRole("button", { name: "保存项目" }).click();

  await expect(page.getByRole("heading", { name: "VPS 运维" })).toBeVisible();
  await expect(page.getByText("续期、备份和部署记录都收在这里。")).toBeVisible();
});

test("项目页支持归档和恢复项目", async ({ page }) => {
  await page.goto("/?view=projects");

  const mentorProject = page.locator('[data-project-tasks="project-mentor"]');
  await expect(mentorProject).toBeVisible();
  await mentorProject.getByRole("button", { name: "归档" }).click();

  await expect(page.locator('[data-project-tasks="project-mentor"]')).toHaveCount(0);
  const archivedProject = page.locator('[data-archived-project="project-mentor"]');
  await expect(archivedProject).toBeVisible();
  await expect(archivedProject).toContainText("导师项目");

  await archivedProject.getByRole("button", { name: "恢复" }).click();
  await expect(page.locator('[data-archived-project="project-mentor"]')).toHaveCount(0);
  await expect(page.locator('[data-project-tasks="project-mentor"]')).toBeVisible();
});

test("已有任务可以追加子任务并在项目页查看归属任务", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "管理任务 整理导师项目材料" }).click();
  await expect(page.getByRole("dialog", { name: "任务管理" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "任务管理" })).toContainText("整理导师项目材料");
  await page.getByRole("textbox", { name: "新增子任务" }).fill("联系导师确认材料");
  await page.getByRole("button", { name: "添加子任务" }).click();
  await expect(page.getByRole("dialog", { name: "任务管理" })).toContainText("联系导师确认材料");
  await page.getByLabel("完成子任务 联系导师确认材料").check();
  await expect(page.getByRole("dialog", { name: "任务管理" }).locator('[data-subtask-title="联系导师确认材料"]')).toHaveClass(/done/);
  await page.getByRole("button", { name: "关闭任务管理" }).click();

  const task = page.locator('[data-section="done"] [data-task-title="整理导师项目材料"]');
  await expect(task).toContainText("子任务 1/1");
  await expect(task).toContainText("联系导师确认材料");
  await expect(page.getByRole("button", { name: "排入" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "看看" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "项目", exact: true }).click();
  await expect(page.getByRole("heading", { name: "项目任务" })).toBeVisible();
  const mentorProject = page.locator('[data-project-tasks="project-mentor"]');
  await expect(mentorProject).toContainText("整理导师项目材料");
  await expect(mentorProject).toContainText("联系导师确认材料");
  const taskBoard = page.locator('[data-task-board="all"]');
  await expect(taskBoard.getByRole("heading", { name: "备忘" })).toBeVisible();
  await expect(taskBoard.getByRole("heading", { name: "今日执行" })).toBeVisible();
  await expect(taskBoard.getByRole("heading", { name: "未来待办" })).toBeVisible();
  await expect(taskBoard.getByRole("heading", { name: "想法池" })).toBeVisible();
  await expect(taskBoard.locator('[data-task-board-section="memo"]')).toHaveClass(/accent-memo/);
  await expect(taskBoard.locator('[data-task-board-section="today"]')).toHaveClass(/accent-today/);
  await expect(taskBoard.locator('[data-task-board-section="future"]')).toHaveClass(/accent-future/);
  await expect(taskBoard.locator('[data-task-board-section="idea"]')).toHaveClass(/accent-idea/);
  await expect(taskBoard.locator('[data-task-board-section="today"]')).not.toContainText("整理导师项目材料");
  await expect(taskBoard).not.toContainText("整理导师项目材料");
  await expect(taskBoard.locator('[data-task-board-section="future"]')).toContainText("剩 2 天");
});

test("任务管理支持修改任务属性和编辑删除子任务", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "管理任务 整理导师项目材料" }).click();
  const dialog = page.getByRole("dialog", { name: "任务管理" });
  await expect(dialog).toBeVisible();

  await page.getByLabel("所属项目").selectOption({ label: "个人记录系统" });
  await page.getByLabel("所在分区").selectOption({ label: "未来待办" });
  await page.getByLabel("任务状态").selectOption({ label: "已计划" });
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(dialog).toContainText("已保存");
  await page.getByRole("button", { name: "关闭任务管理" }).click();

  await expect(page.locator('[data-section="today"] [data-task-title="整理导师项目材料"]')).toHaveCount(0);
  const movedTask = page.locator('[data-section="future"] [data-task-title="整理导师项目材料"]');
  await expect(movedTask).toBeVisible();
  await expect(movedTask).toContainText("个人记录系统");
  await expect(movedTask).toContainText("已计划");
  await expect(movedTask.getByRole("button", { name: "开始专注 整理导师项目材料" })).toHaveCount(0);

  await movedTask.getByRole("button", { name: "管理" }).click();
  await page.getByRole("textbox", { name: "新增子任务" }).fill("联系导师确认材料");
  await page.getByLabel("子任务开始日期").fill("2026-05-29");
  await page.getByLabel("子任务到期日期").fill("2026-05-30");
  await page.getByRole("button", { name: "添加子任务" }).click();
  await expect(dialog.locator('[data-subtask-title="联系导师确认材料"]')).toBeVisible();

  await page.getByRole("button", { name: "编辑子任务 联系导师确认材料" }).click();
  await page.getByLabel("子任务名称").fill("联系导师确认材料 v2");
  await page.getByLabel("编辑子任务开始日期").fill("2026-05-30");
  await page.getByLabel("编辑子任务到期日期").fill("2026-05-31");
  await page.getByRole("button", { name: "保存子任务" }).click();
  await expect(dialog.locator('[data-subtask-title="联系导师确认材料 v2"]')).toContainText("开始 2026-05-30");
  await expect(dialog.locator('[data-subtask-title="联系导师确认材料 v2"]')).toContainText("到期 2026-05-31");

  await page.getByRole("button", { name: "删除子任务 联系导师确认材料 v2" }).click();
  await expect(dialog.locator('[data-subtask-title="联系导师确认材料 v2"]')).toHaveCount(0);
  const detailLayout = await page.evaluate(() => {
    const app = document.querySelector(".app");
    const phone = document.querySelector(".phone");
    const visibleButtons = [...document.querySelectorAll("button")]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((button) => button.getBoundingClientRect());

    return {
      appOverflowsX: app.scrollWidth > app.clientWidth + 1,
      phoneOverflowsX: phone.scrollWidth > phone.clientWidth + 1,
      tinyButtons: visibleButtons.filter((rect) => rect.width < 24 || rect.height < 24).length
    };
  });

  expect(detailLayout.appOverflowsX).toBe(false);
  expect(detailLayout.phoneOverflowsX).toBe(false);
  expect(detailLayout.tinyButtons).toBe(0);
  await page.getByRole("button", { name: "关闭任务管理" }).click();

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "项目", exact: true }).click();
  await expect(page.locator('[data-project-tasks="project-personal-system"]')).toContainText("整理导师项目材料");
  await expect(page.locator('[data-project-tasks="project-mentor"]')).not.toContainText("整理导师项目材料");
});

test("快速添加支持完整任务字段和子任务", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("周三论文初稿");
  await page.getByLabel("所属项目").selectOption({ label: "导师项目" });
  await page.getByLabel("所在分区").selectOption({ label: "未来待办" });
  await page.getByLabel("任务状态").selectOption({ label: "未开始" });
  await page.getByLabel("紧急程度").selectOption({ label: "重要不紧急" });
  await page.getByLabel("计划日期").fill("2026-05-29");
  await page.getByLabel("到期日期").fill("2026-05-30");
  await page.getByLabel("开始时间").fill("10:00");
  await page.getByLabel("结束时间").fill("12:00");
  await page.getByLabel("预计分钟").fill("120");
  await page.getByRole("textbox", { name: "子任务" }).fill("搭建提纲\n整理参考文献");
  await page.getByLabel("提前提醒").fill("30");
  await page.getByRole("button", { name: "加入任务" }).click();

  const task = page.locator('[data-section="future"] [data-task-title="周三论文初稿"]');
  await expect(task).toBeVisible();
  await expect(task).toContainText("导师项目");
  await expect(task).toContainText("未开始");
  await expect(task).toContainText("重要不紧急");
  await expect(task).toContainText("计划 2026-05-29");
  await expect(task).toContainText("到期 2026-05-30");
  await expect(task).toContainText("10:00 - 12:00");
  await expect(task).toContainText("预计 120min");
  await expect(task).toContainText("通知：提前 30 分钟");
  await expect(task).toContainText("子任务 0/2");
  await expect(task).toContainText("搭建提纲");
  await expect(task).toContainText("整理参考文献");
});

test("真实用户从一天到一周的连续路径可用", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "快速添加" }).click();
  await page.getByLabel("标题").fill("一周真实路径任务");
  await page.getByLabel("所属项目").selectOption({ label: "个人记录系统" });
  await page.getByLabel("所在分区").selectOption({ label: "今日执行" });
  await page.getByLabel("任务状态").selectOption({ label: "未开始" });
  await page.getByLabel("开始时间").fill("09:00");
  await page.getByLabel("结束时间").fill("10:00");
  await page.getByRole("textbox", { name: "子任务" }).fill("准备材料\n写第一段");
  await page.getByRole("button", { name: "加入任务" }).click();

  const task = page.locator('[data-section="today"] [data-task-title="一周真实路径任务"]');
  await expect(task).toContainText("子任务 0/2");
  await task.getByRole("button", { name: "管理" }).click();
  const dialog = page.getByRole("dialog", { name: "任务管理" });
  await page.getByRole("textbox", { name: "新增子任务" }).fill("临时检查项");
  await page.getByRole("button", { name: "添加子任务" }).click();
  await expect(dialog.locator('[data-subtask-title="临时检查项"]')).toBeVisible();
  await page.getByRole("button", { name: "删除子任务 临时检查项" }).click();
  await expect(dialog.locator('[data-subtask-title="临时检查项"]')).toHaveCount(0);
  await page.getByRole("button", { name: "关闭任务管理" }).click();

  await page.getByLabel("完成任务 一周真实路径任务").check();
  await expect(page.locator('[data-section="done"] [data-task-title="一周真实路径任务"]')).toBeVisible();

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "周览", exact: true }).click();
  await expect(page.getByRole("heading", { name: "这一周怎么过" })).toBeVisible();
  await expect(page.locator("[data-week-day]").filter({ hasText: "今天" })).toContainText("一周真实路径任务");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "项目", exact: true }).click();
  await expect(page.locator('[data-project-tasks="project-personal-system"]')).toContainText("一周真实路径任务");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "复盘", exact: true }).click();
  await expect(page.locator(".review-card").filter({ hasText: "已完成" })).toContainText("一周真实路径任务");
  await page.locator(".markdown-box").fill("## 一周路径复盘\n完成了 **真实路径** 检查。");
  await expect(page.locator(".markdown-preview").locator("strong")).toHaveText("真实路径");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "养息", exact: true }).click();
  await page.getByRole("button", { name: "添加 饮水" }).click();
  await page.getByLabel("数值 / 内容").fill("400");
  await page.getByLabel("开始时间").fill("15:00");
  await page.getByLabel("结束时间").fill("15:00");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator('[data-health-card="water"]')).toContainText("400 ml");

  const layout = await page.evaluate(() => {
    const app = document.querySelector(".app");
    const phone = document.querySelector(".phone");
    return {
      appOverflowsX: app.scrollWidth > app.clientWidth + 1,
      phoneOverflowsX: phone.scrollWidth > phone.clientWidth + 1
    };
  });
  expect(layout.appOverflowsX).toBe(false);
  expect(layout.phoneOverflowsX).toBe(false);
});

test("养息页支持默认记录和自定义习惯", async ({ page }) => {
  await page.goto("/?view=health");

  await expect(page.getByRole("heading", { name: "养息不审判" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "早起" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "饮水" })).toBeVisible();

  await page.getByRole("button", { name: "记录 早起" }).click();
  await page.getByLabel("开始时间").fill("07:10");
  await page.getByLabel("结束时间").fill("07:10");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator('[data-health-card="wake"]')).toContainText("07:10");

  await page.getByRole("button", { name: "添加 饮水" }).click();
  await page.getByLabel("数值 / 内容").fill("350");
  await page.getByLabel("开始时间").fill("09:20");
  await page.getByLabel("结束时间").fill("09:20");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator('[data-health-card="water"]')).toContainText("350 ml");
  await expect(page.locator('[data-health-card="water"]')).toContainText("09:20");

  await page.getByRole("button", { name: "添加自定义" }).click();
  await page.getByLabel("习惯名称").fill("护眼");
  await page.getByLabel("记录方式").selectOption("多项");
  await page.getByLabel("单位").fill("min");
  await page.getByRole("button", { name: "保存习惯" }).click();
  await expect(page.getByRole("heading", { name: "护眼" })).toBeVisible();

  await page.getByRole("button", { name: "添加 护眼" }).click();
  await page.getByLabel("数值 / 内容").fill("15");
  await page.getByLabel("开始时间").fill("10:00");
  await page.getByLabel("结束时间").fill("10:15");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator('[data-health-card]').filter({ hasText: "护眼" })).toContainText("15 min");
  await expect(page.locator('[data-health-card]').filter({ hasText: "护眼" })).toContainText("10:00 - 10:15 · 15min");

  await page.screenshot({ path: "../docs/prototypes/mingxintai-2-health-records-390.png", fullPage: true });
});
