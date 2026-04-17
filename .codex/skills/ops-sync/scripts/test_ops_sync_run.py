import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parent / "ops_sync_run.py"


class OpsSyncRunEncodingTest(unittest.TestCase):
    def test_apply_succeeds_under_chinese_project_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            project_root = Path(tmp_dir) / "中文项目"
            project_root.mkdir(parents=True)

            raw_input_path = project_root / "raw_judge.json"
            raw_input_path.write_text(
                json.dumps(
                    {
                        "decision": "apply",
                        "reason": "test",
                        "summary": "test",
                        "event": {
                            "source": "ops-judge",
                            "intent": "验证中文路径链路",
                            "result": "成功写入状态",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            proc = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--project-root",
                    str(project_root),
                    "--input",
                    str(raw_input_path),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )

            self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
            report = json.loads(proc.stdout)
            self.assertEqual(report["normalize"]["status"], "normalized")
            self.assertEqual(report["apply"]["status"], "apply")
            self.assertNotIn("\ufffd", report["normalize"]["event_file"])
            self.assertTrue(Path(report["normalize"]["event_file"]).exists())


if __name__ == "__main__":
    unittest.main()
