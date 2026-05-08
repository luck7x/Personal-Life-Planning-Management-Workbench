import unittest
from datetime import datetime, timedelta

from app.reminders import LOCAL_TZ, collect_due_reminders


class ReminderConfigTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 5, 8, 9, 0, tzinfo=LOCAL_TZ)

    def due_after(self, minutes):
        return (self.now + timedelta(minutes=minutes)).isoformat(timespec="minutes")

    def test_global_lead_minutes_limits_due_soon_candidates(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 5, "atDue": True, "overdue": True},
            "tasks": [
                {"id": "t1", "title": "五分钟内", "status": "todo", "dueDate": self.due_after(5)},
                {"id": "t2", "title": "十分钟后", "status": "todo", "dueDate": self.due_after(10)},
            ],
        }

        candidates = collect_due_reminders(state, soon_hours=24, now=self.now)

        self.assertEqual([item.task_id for item in candidates], ["t1"])
        self.assertEqual(candidates[0].kind, "due_soon")

    def test_task_can_disable_notifications(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 30, "atDue": True, "overdue": True},
            "tasks": [
                {
                    "id": "t1",
                    "title": "不提醒任务",
                    "status": "todo",
                    "dueDate": self.due_after(5),
                    "notification": {"mode": "off"},
                }
            ],
        }

        self.assertEqual(collect_due_reminders(state, soon_hours=24, now=self.now), [])

    def test_task_custom_lead_overrides_global_default(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 5, "atDue": True, "overdue": True},
            "tasks": [
                {
                    "id": "t1",
                    "title": "任务自定义提前",
                    "status": "todo",
                    "dueDate": self.due_after(15),
                    "notification": {"mode": "custom", "leadMinutes": 15, "atDue": True, "overdue": True},
                }
            ],
        }

        candidates = collect_due_reminders(state, soon_hours=24, now=self.now)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].task_id, "t1")

    def test_subtask_inherits_parent_off_but_custom_can_override(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 30, "atDue": True, "overdue": True},
            "tasks": [
                {
                    "id": "t1",
                    "title": "父任务",
                    "status": "todo",
                    "dueDate": self.due_after(60),
                    "notification": {"mode": "off"},
                    "subtasks": [
                        {"id": "s1", "title": "继承关闭", "dueDate": self.due_after(5)},
                        {
                            "id": "s2",
                            "title": "子任务自定义提醒",
                            "dueDate": self.due_after(5),
                            "notification": {"mode": "custom", "leadMinutes": 5, "atDue": True, "overdue": True},
                        },
                    ],
                }
            ],
        }

        candidates = collect_due_reminders(state, soon_hours=24, now=self.now)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].subtask_id, "s2")

    def test_overdue_can_be_disabled_globally(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 30, "atDue": True, "overdue": False},
            "tasks": [
                {"id": "t1", "title": "已过期但关闭逾期提醒", "status": "todo", "dueDate": self.due_after(-10)}
            ],
        }

        self.assertEqual(collect_due_reminders(state, soon_hours=24, now=self.now), [])

    def test_at_due_reminder_works_without_lead_minutes(self):
        state = {
            "notificationSettings": {"enabled": True, "leadMinutes": 0, "atDue": True, "overdue": True},
            "tasks": [
                {"id": "t1", "title": "准点提醒", "status": "todo", "dueDate": self.due_after(0)}
            ],
        }

        candidates = collect_due_reminders(state, soon_hours=24, now=self.now)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].kind, "due_now")


if __name__ == "__main__":
    unittest.main()
