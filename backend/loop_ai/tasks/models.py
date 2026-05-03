from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

TaskStatus = Literal["proposed", "open", "in_progress", "done", "blocked"]
TaskEventKind = Literal[
    "created",
    "confirmed",
    "status_changed",
    "assignee_added",
    "assignee_removed",
    "edited",
    "rejected",
]


class TaskAssignee(BaseModel):
    task_id: str
    display_name: str
    user_id: Optional[str] = None
    added_by: Optional[str] = None
    added_at: Optional[datetime] = None


class Task(BaseModel):
    id: str
    workspace_id: str
    channel_id: str
    title: str
    description: Optional[str] = None
    status: TaskStatus = "proposed"
    due_date: Optional[datetime] = None
    source_message_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    assignees: list[TaskAssignee] = Field(default_factory=list)


class TaskEvent(BaseModel):
    id: str
    task_id: str
    kind: TaskEventKind
    actor_user_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TaskAssigneeInput(BaseModel):
    display_name: str
    user_id: Optional[str] = None


class TaskCreate(BaseModel):
    workspace_id: str
    channel_id: str
    title: str
    description: Optional[str] = None
    status: TaskStatus = "proposed"
    due_date: Optional[datetime] = None
    source_message_id: Optional[str] = None
    assignees: list[TaskAssigneeInput] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None
