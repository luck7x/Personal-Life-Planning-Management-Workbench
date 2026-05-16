import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app import main


class EntityOperationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = main.DB_PATH
        self.old_data_dir = main.DATA_DIR
        self.old_event_id = main.STATE_EVENT_ID
        self.old_event_updated_at = main.STATE_EVENT_UPDATED_AT
        main.DB_PATH = Path(self.tmp.name) / "entities.sqlite3"
        main.DATA_DIR = main.DB_PATH.parent
        main.STATE_EVENT_ID = 0
        main.STATE_EVENT_UPDATED_AT = None
        main.init_db()

    def tearDown(self):
        main.DB_PATH = self.old_db_path
        main.DATA_DIR = self.old_data_dir
        main.STATE_EVENT_ID = self.old_event_id
        main.STATE_EVENT_UPDATED_AT = self.old_event_updated_at
        self.tmp.cleanup()

    def test_workspace_write_backfills_entity_tables(self):
        main.write_workspace_state_with_snapshot(
            {
                "projects": [{"id": "p1", "title": "项目", "status": "active"}],
                "tasks": [
                    {
                        "id": "t1",
                        "title": "任务",
                        "projectId": "p1",
                        "status": "todo",
                        "lane": "today",
                        "dueDate": "2026-05-20",
                        "subtasks": [{"id": "s1", "title": "步骤", "done": False}],
                    }
                ],
                "focus": {"sessions": [{"id": "f1", "title": "专注", "date": "2026-05-16", "start": "09:00", "end": "10:00", "minutes": 60}]},
                "timeBlocks": {"2026-05-16": [{"id": "b1", "title": "安排", "start": "09:00", "end": "10:00"}]},
                "notificationSettings": {"enabled": True, "leadMinutes": 30},
                "foods": [{"id": "food1", "date": "2026-05-16", "name": "早餐"}],
                "waters": [{"id": "water1", "date": "2026-05-16", "amount": 250}],
                "weights": [{"id": "weight1", "date": "2026-05-16", "value": 70}],
                "heights": [{"id": "height1", "date": "2026-05-16", "value": 175}],
                "habits": {"entries": {"2026-05-16": {"habit_early_wake": {"start": "07:00", "end": "07:00"}}}},
                "reviewDaily": {"entries": {"2026-05-16": {"markdown": "今天复盘"}}},
                "care": {"entries": {"2026-05-16": {"lights": []}}},
                "submissions": [{"id": "sub1", "title": "投稿", "stage": "选题中", "deadline": "2026-05-20"}],
            },
            reason="seed",
        )

        entities = main.read_entities()

        self.assertEqual(entities["counts"]["projects"], 1)
        self.assertEqual(entities["counts"]["tasks"], 1)
        self.assertEqual(entities["counts"]["subtasks"], 1)
        self.assertEqual(entities["counts"]["focus_sessions"], 1)
        self.assertEqual(entities["counts"]["time_blocks"], 1)
        self.assertEqual(entities["counts"]["health_records"], 5)
        self.assertEqual(entities["counts"]["daily_reviews"], 1)
        self.assertEqual(entities["counts"]["care_entries"], 1)
        self.assertEqual(entities["counts"]["submissions"], 1)

    def test_task_and_subtask_operation_updates_workspace_and_entities(self):
        task_result = main.upsert_task_item({"title": "今日执行", "lane": "today"})
        task = task_result["result"]
        subtask_result = main.upsert_subtask_item(task["id"], {"title": "第一步", "dueDate": "2026-05-17"})

        state = main.read_workspace_state()["state"]
        entities = main.read_entities()

        self.assertEqual(state["tasks"][0]["title"], "今日执行")
        self.assertEqual(state["tasks"][0]["subtasks"][0]["title"], "第一步")
        self.assertEqual(subtask_result["result"]["dueDate"], "2026-05-17")
        self.assertEqual(entities["counts"]["tasks"], 1)
        self.assertEqual(entities["counts"]["subtasks"], 1)

    def test_record_level_conflict_blocks_stale_task_update(self):
        task = main.upsert_task_item({"id": "t1", "title": "旧标题"})["result"]
        updated = main.upsert_task_item({"id": "t1", "title": "新标题"})["result"]

        with self.assertRaises(HTTPException) as ctx:
            main.upsert_task_item({"id": "t1", "title": "过期写入"}, base_updated_at=task["updatedAt"])

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["updated_at"], updated["updatedAt"])

    def test_subtask_operation_requires_existing_parent_task(self):
        with self.assertRaises(HTTPException) as ctx:
            main.upsert_subtask_item("missing", {"title": "孤儿步骤"})

        self.assertEqual(ctx.exception.status_code, 404)

    def test_server_focus_start_stop_generates_session_once(self):
        task = main.upsert_task_item({"id": "t1", "title": "服务端计时"})["result"]
        focus = main.start_focus_session(main.FocusStartIn(task_id=task["id"], expected_minutes=25))["result"]

        active_state = main.read_workspace_state()["state"]
        self.assertEqual(active_state["focus"]["activeItems"][0]["id"], focus["id"])
        self.assertEqual(active_state["tasks"][0]["status"], "active")

        stopped = main.stop_focus_session(main.FocusStopIn(focus_id=focus["id"]))["result"]
        done_state = main.read_workspace_state()["state"]
        entities = main.read_entities()

        self.assertEqual(stopped["id"], focus["id"])
        self.assertEqual(done_state["focus"]["activeItems"], [])
        self.assertEqual(done_state["focus"]["sessions"][0]["id"], focus["id"])
        self.assertEqual(entities["counts"]["focus_sessions"], 1)

        with self.assertRaises(HTTPException) as ctx:
            main.stop_focus_session(main.FocusStopIn(focus_id=focus["id"]))

        self.assertEqual(ctx.exception.status_code, 404)

    def test_operation_batch_is_idempotent_for_offline_replay(self):
        operation = main.OperationIn(
            id="op-task-1",
            type="task.upsert",
            payload={"item": {"title": "离线补交"}},
        )

        first = main.apply_operation_batch([operation])
        second = main.apply_operation_batch([operation])
        state = main.read_workspace_state()["state"]

        self.assertTrue(first["results"][0]["ok"])
        self.assertTrue(second["results"][0]["cached"])
        self.assertEqual(len(state["tasks"]), 1)

    def test_operation_batch_reports_conflict_without_stopping_later_items(self):
        task = main.upsert_task_item({"id": "t1", "title": "旧标题"})["result"]
        updated = main.upsert_task_item({"id": "t1", "title": "新标题"})["result"]

        result = main.apply_operation_batch(
            [
                main.OperationIn(
                    id="op-conflict",
                    type="task.upsert",
                    payload={"item": {"id": "t1", "title": "过期"}, "base_updated_at": task["updatedAt"]},
                ),
                main.OperationIn(
                    id="op-next",
                    type="task.upsert",
                    payload={"item": {"id": "t2", "title": "后续仍执行"}},
                ),
            ]
        )
        state = main.read_workspace_state()["state"]

        self.assertFalse(result["ok"])
        self.assertEqual(result["results"][0]["status_code"], 409)
        self.assertTrue(result["results"][1]["ok"])
        self.assertEqual(len(state["tasks"]), 2)
        self.assertEqual(updated["title"], "新标题")

    def test_operation_batch_requires_operation_id_for_idempotency(self):
        result = main.apply_operation_batch(
            [main.OperationIn(type="task.upsert", payload={"item": {"title": "无 id"}})]
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["results"][0]["status_code"], 400)

    def test_ai_context_returns_task_focus_review_summary(self):
        today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
        main.write_workspace_state_with_snapshot(
            {
                "tasks": [
                    {"id": "today", "title": "今日", "lane": "today", "status": "todo"},
                    {"id": "done", "title": "完成", "lane": "done", "status": "done", "doneAt": f"{today}T10:00"},
                ],
                "projects": [{"id": "p1", "title": "项目", "status": "active"}],
                "focus": {"sessions": [{"id": "f1", "date": today, "minutes": 30}]},
                "reviewDaily": {"entries": {today: {"markdown": "复盘"}}},
            },
            reason="ai-context",
        )

        context = main.ai_context_payload(range_days=30)

        self.assertEqual(context["today_tasks"][0]["id"], "today")
        self.assertEqual(context["projects"][0]["id"], "p1")
        self.assertGreaterEqual(context["focus"]["minutes"], 30)


if __name__ == "__main__":
    unittest.main()
