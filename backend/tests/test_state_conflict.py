import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from app import main


class WorkspaceStateConflictTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db_path = main.DB_PATH
        self.old_data_dir = main.DATA_DIR
        self.old_event_id = main.STATE_EVENT_ID
        self.old_event_updated_at = main.STATE_EVENT_UPDATED_AT
        main.DB_PATH = Path(self.tmp.name) / "state-conflict.sqlite3"
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

    def test_stale_base_updated_at_returns_conflict(self):
        first = main.write_workspace_state_with_snapshot({"tasks": [{"id": "a"}]}, reason="first")
        second = main.write_workspace_state_with_snapshot(
            {"tasks": [{"id": "b"}]},
            reason="second",
            base_updated_at=first["updated_at"],
        )

        with self.assertRaises(HTTPException) as ctx:
            main.write_workspace_state_with_snapshot(
                {"tasks": [{"id": "c"}]},
                reason="stale",
                base_updated_at=first["updated_at"],
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["updated_at"], second["updated_at"])
        self.assertEqual(ctx.exception.detail["state"]["tasks"][0]["id"], "b")

    def test_force_allows_intentional_overwrite_after_conflict(self):
        first = main.write_workspace_state_with_snapshot({"tasks": [{"id": "a"}]}, reason="first")
        main.write_workspace_state_with_snapshot(
            {"tasks": [{"id": "b"}]},
            reason="second",
            base_updated_at=first["updated_at"],
        )

        forced = main.write_workspace_state_with_snapshot(
            {"tasks": [{"id": "c"}]},
            reason="force",
            base_updated_at=first["updated_at"],
            force=True,
        )

        self.assertEqual(forced["state"]["tasks"][0]["id"], "c")

    def test_state_write_publishes_sse_event_metadata(self):
        saved = main.write_workspace_state_with_snapshot({"tasks": [{"id": "a"}]}, reason="event")

        self.assertEqual(main.STATE_EVENT_ID, 1)
        self.assertEqual(main.STATE_EVENT_UPDATED_AT, saved["updated_at"])

    def test_parse_event_id_tolerates_invalid_input(self):
        self.assertEqual(main.parse_event_id("12"), 12)
        self.assertEqual(main.parse_event_id("-1"), 0)
        self.assertEqual(main.parse_event_id("bad"), 0)

    def test_normalize_event_cursor_handles_server_restart(self):
        main.STATE_EVENT_ID = 3

        self.assertEqual(main.normalize_event_cursor(2), 2)
        self.assertEqual(main.normalize_event_cursor(99), 3)


if __name__ == "__main__":
    unittest.main()
