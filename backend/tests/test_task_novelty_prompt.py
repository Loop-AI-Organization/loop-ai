import unittest
from unittest.mock import patch

from loop_ai.orchestrator.orchestrator import classify_task_novelty, classify_tasks_batch


class _Settings:
    openrouter_triage_model = "test-model"


class TaskNoveltyPromptTest(unittest.TestCase):
    def test_single_task_novelty_prompt_escapes_json_example_braces(self):
        with patch("loop_ai.orchestrator.orchestrator.load_settings", return_value=_Settings()), patch(
            "loop_ai.orchestrator.orchestrator.chat_completion",
            return_value='{"kind": "new", "task_id": null, "suggested_status": null, "reason": "new work"}',
        ) as chat:
            result = classify_task_novelty(
                title="Finalize the Sprint 3 task export demo",
                description=None,
                existing_tasks=[{"id": "task-1", "title": "Existing task", "status": "open"}],
            )

        self.assertEqual(result["kind"], "new")
        prompt = chat.call_args.kwargs["messages"][0]["content"]
        self.assertIn('"kind": "new" | "duplicate" | "update"', prompt)
        self.assertIn("Finalize the Sprint 3 task export demo", prompt)

    def test_batch_task_novelty_prompt_still_formats_candidates(self):
        with patch("loop_ai.orchestrator.orchestrator.load_settings", return_value=_Settings()), patch(
            "loop_ai.orchestrator.orchestrator.chat_completion",
            return_value='[{"kind": "new", "task_id": null, "suggested_status": null, "reason": "new work"}]',
        ) as chat:
            results = classify_tasks_batch(
                candidates=[{"title": "Export tasks", "description": "Create a checklist"}],
                existing_tasks=[{"id": "task-1", "title": "Existing task", "status": "open"}],
            )

        self.assertEqual(results[0]["kind"], "new")
        prompt = chat.call_args.kwargs["messages"][0]["content"]
        self.assertIn('"kind": "new" | "duplicate" | "update"', prompt)
        self.assertIn("Export tasks", prompt)


if __name__ == "__main__":
    unittest.main()
