import inspect
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import export_channel_tasks


class _TaskQuery:
    def __init__(self, data):
        self.data = data

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def neq(self, _column, _value):
        return self

    def limit(self, _count):
        return self

    def execute(self):
        return type("Result", (), {"data": self.data})()


class _Supabase:
    def __init__(self, task_rows):
        self.task_rows = task_rows
        self.queried_tables = []

    def table(self, table_name):
        self.queried_tables.append(table_name)
        if table_name != "tasks":
            raise AssertionError(f"Unexpected table query: {table_name}")
        return _TaskQuery(self.task_rows)


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
            "app.routes.supabase", _Supabase([{"id": "task-1"}])
        ), patch(
            "app.routes.export_tasks_as_document", return_value=generated
        ) as export_mock:
            result = export_channel_tasks("ch-1", {"sub": "user-1"})

        self.assertEqual(result, {"file": generated})
        export_mock.assert_called_once_with(
            channel_id="ch-1",
            workspace_id="ws-1",
            title="Task List",
            created_by="user-1",
        )

    def test_route_is_synchronous_to_avoid_event_loop_blocking(self):
        self.assertFalse(inspect.iscoroutinefunction(export_channel_tasks))

    def test_returns_400_when_no_confirmed_task_query_returns_empty(self):
        supabase = _Supabase([])
        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=True), patch(
            "app.routes.supabase", supabase
        ), patch("app.routes.export_tasks_as_document") as export_mock:
            with self.assertRaises(HTTPException) as ctx:
                export_channel_tasks("ch-1", {"sub": "user-1"})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No confirmed tasks available to export")
        self.assertEqual(supabase.queried_tables, ["tasks"])
        export_mock.assert_not_called()

    def test_returns_500_when_export_fails_after_confirmed_task_exists(self):
        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=True), patch(
            "app.routes.supabase", _Supabase([{"id": "task-1"}])
        ), patch("app.routes.export_tasks_as_document", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                export_channel_tasks("ch-1", {"sub": "user-1"})

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertEqual(ctx.exception.detail, "Failed to export tasks")

    def test_returns_403_when_user_cannot_access_workspace(self):
        supabase = _Supabase([{"id": "task-1"}])
        with patch(
            "app.routes._select_channel_by_id",
            return_value={"id": "ch-1", "workspace_id": "ws-1"},
        ), patch("app.routes._user_can_access_workspace", return_value=False), patch(
            "app.routes.supabase", supabase
        ), patch("app.routes.export_tasks_as_document") as export_mock:
            with self.assertRaises(HTTPException) as ctx:
                export_channel_tasks("ch-1", {"sub": "user-1"})

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(supabase.queried_tables, [])
        export_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
