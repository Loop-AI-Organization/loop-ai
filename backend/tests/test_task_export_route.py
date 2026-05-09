import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import export_channel_tasks


class TaskExportRouteTest(unittest.TestCase):
    def test_returns_generated_file_for_accessible_channel(self):
        generated = {
            "id": "file-1",
            "workspace_id": "ws-1",
            "source": "generated",
            "storage_path": "ws-1/docs/file.md",
            "file_name": "Task-List.md",
            "file_size": 42,
            "content_type": "text/markdown",
            "created_by": "user-1",
            "created_at": "2026-05-08T12:00:00Z",
            "summary": "Task export: 1 task(s)",
            "project_context": "Exported from channel tasks",
            "tags": ["tasks", "export"],
            "metadata_status": "ready",
            "source_channel_id": "ch-1",
        }

        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=True), patch(
            "app.routes.export_tasks_as_document", return_value=generated
        ) as export_mock:
            result = asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(result, {"file": generated})
        export_mock.assert_called_once_with(
            channel_id="ch-1",
            workspace_id="ws-1",
            title="Task List",
            created_by="user-1",
        )

    def test_returns_400_when_no_confirmed_tasks_exist(self):
        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=True), patch(
            "app.routes.export_tasks_as_document", return_value=None
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No confirmed tasks available to export")

    def test_returns_403_when_user_cannot_access_workspace(self):
        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
