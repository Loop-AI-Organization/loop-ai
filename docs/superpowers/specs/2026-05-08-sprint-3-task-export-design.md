# Sprint 3 Task Export Design

## Goal

Implement User Story #5 for Sprint 3: users can export action items from recent discussions into a document. The feature should turn confirmed channel tasks into a generated Markdown task report or checklist that is saved as a workspace file and can be downloaded from the existing Files experience.

## Current Context

LoopAI already has most of the backend foundations for this story:

- The `tasks`, `task_assignees`, and `task_events` tables exist.
- The Inspector panel loads channel tasks and renders proposed and active task cards.
- The backend orchestrator already has `export_tasks_as_document()`, which reads confirmed channel tasks, generates Markdown, uploads it to the `workspace-files` bucket, and inserts a generated `files` row.
- The chat triage path can already detect an `export_tasks` file intent and call the export engine.

The missing product surface is a direct user action in the task UI. Users should not need to phrase a chat command correctly just to export the taskboard.

## Product Behavior

The Inspector Tasks tab will include an `Export Tasks` action near the task list. The action exports only confirmed tasks: `open`, `in_progress`, `blocked`, and `done`.

Proposed tasks are intentionally excluded. Proposed items are AI-detected candidates that have not been accepted by a user yet, so including them in a project report could make unverified work look authoritative. If a channel has only proposed tasks, the UI should disable export or show a clear error telling users to confirm tasks before exporting.

On successful export, LoopAI creates a generated Markdown file in the current workspace. The user should see enough feedback to know the export was created, and the Files tab should reflect the new file after refresh.

## Backend Design

Add a direct API route:

`POST /api/channels/{channel_id}/tasks/export`

The route will:

1. Authenticate the current user.
2. Validate the channel exists and that the user can access its workspace.
3. Call the existing `export_tasks_as_document()` function with the channel id, workspace id, a default title such as `Task List`, and the current user id.
4. Return the generated file record in the same shape expected by frontend file-mapping code.
5. Return a useful `400` response when no confirmed tasks are available to export.

This keeps export available from both paths: natural-language chat intent and direct UI action. The direct route avoids having the frontend manufacture a fake `@ai export tasks` message.

## Document Format

The exported document will remain Markdown because the existing file system and generated document flow already use `text/markdown`.

The content should be a checklist grouped by status:

- Open
- In Progress
- Blocked
- Done

Each task line should include the title, assignee names when available, and due date when available. Done tasks should render as checked checklist items. Open, in-progress, and blocked tasks should render as unchecked checklist items. Descriptions can appear as indented continuation text below the task.

The existing export engine uses the LLM to format the final Markdown. For reliability, the implementation plan should either add deterministic formatting or constrain tests around the structured input and route behavior. If the codebase can support it cleanly, deterministic Markdown generation is preferred for this narrow checklist output.

## Frontend Design

Add a small export control to the Tasks tab in `InspectorPanel`.

Behavior:

- The button is visible when a current channel is selected.
- The button is disabled when there are no confirmed tasks.
- While exporting, the button shows a loading state.
- On success, workspace files are refreshed so the generated checklist appears in the Files tab.
- On failure, the panel shows a short error message.

The button should use the existing UI primitives and Lucide icons. It should fit the inspector’s compact, operational style rather than adding a large modal or multi-step flow.

Add a frontend API helper, likely in `frontend/src/lib/supabase-data.ts`, that calls the new backend route and maps the returned file row into the existing `FileRecord` type.

## Data Flow

1. User opens the Inspector Tasks tab for a project channel.
2. User clicks `Export Tasks`.
3. Frontend calls `POST /api/channels/{channel_id}/tasks/export`.
4. Backend validates access and calls the existing document generation engine.
5. Backend returns the generated file row.
6. Frontend refreshes workspace files or inserts the returned file into local state.
7. User can switch to Files and download the generated Markdown checklist.

## Error Handling

Expected user-facing failures:

- No confirmed tasks exist: show a concise message such as `Confirm at least one task before exporting.`
- Export generation fails: show `Could not export tasks. Try again.`
- User lacks channel access: backend returns `403`; frontend shows the same generic export failure.

The backend should not expose internal storage or LLM errors directly in API responses.

## Testing

Backend tests should cover:

- The export route rejects unauthenticated users through existing auth dependencies.
- The export route returns `400` when there are no confirmed tasks.
- The export route returns the generated file record when confirmed tasks exist.
- The export excludes `proposed` tasks.

Frontend tests should cover:

- The Tasks tab disables export when there are no confirmed tasks.
- Clicking export calls the API helper and refreshes files on success.
- The UI shows a loading state while export is in progress.
- The UI shows an error state when export fails.

## Out of Scope

- Export options dialogs.
- Including proposed tasks in reports.
- PDF or DOCX generation.
- Cross-channel or workspace-wide task exports.
- Appending exported tasks into an existing document from the button flow.
