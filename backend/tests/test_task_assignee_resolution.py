import unittest

from app.routes import _format_unresolved_assignee_note, _partition_resolved_assignees


class TaskAssigneeResolutionTest(unittest.TestCase):
    def test_unmatched_names_are_not_treated_as_assignees(self):
        matched, unmatched = _partition_resolved_assignees(
            ["krish"],
            [{"display_name": "krish", "user_id": None}],
        )

        self.assertEqual(matched, [])
        self.assertEqual(unmatched, ["krish"])

    def test_matched_workspace_members_are_kept_as_assignees(self):
        matched, unmatched = _partition_resolved_assignees(
            ["krish"],
            [{"display_name": "Krishna Kasturi", "user_id": "user-1"}],
        )

        self.assertEqual(matched, [{"display_name": "Krishna Kasturi", "user_id": "user-1"}])
        self.assertEqual(unmatched, [])

    def test_unresolved_note_explains_task_is_unassigned(self):
        note = _format_unresolved_assignee_note(["krish", "unknown person"])

        self.assertEqual(
            note,
            'I couldn\'t find "krish" or "unknown person" in this workspace, so I left those assignees unassigned.',
        )


if __name__ == "__main__":
    unittest.main()
