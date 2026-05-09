import asyncio
import unittest
from unittest.mock import patch

from app.routes import delete_task


class _Query:
    def __init__(self, table_name, rows):
        self.table_name = table_name
        self.rows = rows

    def select(self, _columns):
        return self

    def insert(self, _row):
        return self

    def delete(self):
        return self

    def eq(self, _column, _value):
        return self

    def execute(self):
        return type("Result", (), {"data": self.rows})()


class _Supabase:
    def __init__(self, task_rows):
        self.task_rows = task_rows
        self.queried_tables = []

    def table(self, table_name):
        self.queried_tables.append(table_name)
        if table_name == "tasks":
            return _Query(table_name, self.task_rows)
        if table_name == "task_events":
            return _Query(table_name, [])
        raise AssertionError(f"Unexpected table query: {table_name}")


class TaskDeleteRouteTest(unittest.TestCase):
    def test_delete_missing_task_is_idempotent(self):
        supabase = _Supabase([])

        with patch("app.routes.supabase", supabase):
            result = asyncio.run(delete_task("missing-task", {"sub": "user-1"}))

        self.assertEqual(result, {"ok": True})
        self.assertEqual(supabase.queried_tables, ["tasks"])

    def test_delete_existing_proposed_task_records_rejection_then_deletes(self):
        supabase = _Supabase([{"id": "task-1", "status": "proposed"}])

        with patch("app.routes.supabase", supabase):
            result = asyncio.run(delete_task("task-1", {"sub": "user-1"}))

        self.assertEqual(result, {"ok": True})
        self.assertEqual(supabase.queried_tables, ["tasks", "task_events", "tasks"])


if __name__ == "__main__":
    unittest.main()
