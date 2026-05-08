import unittest

from loop_ai.orchestrator.orchestrator import format_task_export_markdown


class TaskExportMarkdownTest(unittest.TestCase):
    def test_groups_confirmed_tasks_by_status_and_renders_checklists(self):
        content = format_task_export_markdown(
            title="Sprint Tasks",
            tasks=[
                {
                    "title": "Wire export button",
                    "status": "open",
                    "description": "Add the action to the inspector task panel.",
                    "due_date": "2026-07-13T00:00:00Z",
                    "task_assignees": [{"display_name": "Raeed Saad"}],
                },
                {
                    "title": "Verify generated checklist",
                    "status": "done",
                    "description": None,
                    "due_date": None,
                    "task_assignees": [{"display_name": "Ashwin Murthy"}],
                },
                {
                    "title": "Unreviewed AI suggestion",
                    "status": "proposed",
                    "description": "This should not leave the taskboard.",
                    "due_date": None,
                    "task_assignees": [],
                },
            ],
        )

        self.assertIn("# Sprint Tasks", content)
        self.assertIn("## Open", content)
        self.assertIn("- [ ] Wire export button (Assignees: Raeed Saad; Due: 2026-07-13)", content)
        self.assertIn("  - Add the action to the inspector task panel.", content)
        self.assertIn("## Done", content)
        self.assertIn("- [x] Verify generated checklist (Assignees: Ashwin Murthy)", content)
        self.assertNotIn("Unreviewed AI suggestion", content)

    def test_returns_empty_string_when_only_proposed_tasks_exist(self):
        content = format_task_export_markdown(
            title="Task List",
            tasks=[
                {
                    "title": "Maybe do this",
                    "status": "proposed",
                    "description": None,
                    "due_date": None,
                    "task_assignees": [],
                }
            ],
        )

        self.assertEqual(content, "")


if __name__ == "__main__":
    unittest.main()
