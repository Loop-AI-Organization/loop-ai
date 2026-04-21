# Conversational File System - Design Spec

**Date:** 2026-04-12
**Status:** Approved

## Overview

A conversational file system for Loop AI where users interact with files entirely through chat. The AI can find existing files and create new documents from conversation history. Both uploaded files and AI-generated documents live in a unified system with rich identity metadata. Results appear as inline file cards in chat messages.

## Design Decisions

- **Interaction model:** Conversational only (no dedicated file browser UI)
- **File types:** Uploaded files and AI-generated markdown documents are peers in one system
- **Search approach:** File identity metadata (name, summary, tags, project context) - no vector embeddings yet, but schema designed to accommodate them later
- **Document format:** Markdown files stored in Supabase storage
- **Scope for document generation:** Current channel only
- **Metadata enrichment:** Lazy - background worker processes files after upload
- **`thread_files` table:** Deprecated. The new `files` table replaces it entirely.

## Data Model

### New `files` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `workspace_id` | uuid FK -> workspaces ON DELETE CASCADE | Scoped to workspace |
| `source` | text NOT NULL | `'upload'` or `'generated'`, CHECK constraint |
| `storage_path` | text NOT NULL | Path in `workspace-files` Supabase storage bucket |
| `file_name` | text NOT NULL | Original name or AI-suggested name |
| `file_size` | bigint NOT NULL DEFAULT 0 | |
| `content_type` | text | MIME type |
| `created_by` | uuid FK -> auth.users ON DELETE SET NULL | Who uploaded or triggered creation |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `summary` | text, nullable | AI-generated one-liner, populated by worker |
| `project_context` | text, nullable | Inferred from workspace/channel context |
| `tags` | text[], nullable | AI-inferred tags (e.g. `['invoice', 'design']`) |
| `metadata_status` | text NOT NULL DEFAULT 'pending' | `'pending'` / `'ready'` / `'failed'`, CHECK constraint |
| `source_channel_id` | uuid FK -> channels ON DELETE SET NULL, nullable | Channel where file originated |

### Indexes

- `idx_files_workspace_id` on `workspace_id`
- `idx_files_created_by` on `created_by`
- `idx_files_source_channel_id` on `source_channel_id`
- `idx_files_tags` GIN index on `tags` for array containment queries
- `idx_files_metadata_status` on `metadata_status` (for worker to find pending files)

### RLS

- Workspace-scoped access: authenticated users can access files in workspaces they own or are members of (same pattern as channels, threads)
- Service role gets full access

### Deprecation

The `thread_files` table is deprecated. The migration drops it. Existing data should be migrated to the `files` table before dropping.

## Intent Detection & File Operations

### Triage Flow Extension

The existing triage endpoint (`POST /api/channels/{channel_id}/triage`) gains a file intent detection step:

```
User sends @ai message
  -> Step 1: Detect navigation intent (existing)
  -> Step 2: Detect file intent (NEW)
  -> Step 3: Normal AI response (existing fallback)
```

### File Intent Types

| Intent | Example Prompts | Action |
|--------|----------------|--------|
| `find_file` | "find my invoices", "where's the design doc?" | Search `files` table by metadata |
| `create_document` | "export action items from last 2 days" | Read messages, generate markdown, upload, insert `files` row |
| `none` | "what's the weather?" | Pass through to normal response |

### `detect_file_intent()` - Orchestrator LLM Call

Input: user messages array

Output:
```json
{
  "is_file_intent": true,
  "intent_type": "find_file" | "create_document",
  "query": "invoices from March",
  "doc_title": "Action Items - Apr 10-12",
  "time_range_days": 2,
  "instructions": "focus on action items"
}
```

### `search_files()` - Find Operation

Queries the `files` table using metadata matching:

1. Text search against `file_name`, `summary`, `project_context` using Postgres `ILIKE`
2. Array containment on `tags` using `@>`
3. Filter by `workspace_id` (always), `content_type` (if user specifies type), `source_channel_id` (if user specifies channel)
4. Results ranked by relevance: name match > tag match > summary match

This is the insertion point for vector search later - swap ILIKE for cosine similarity on a future `embedding` column.

### `generate_document()` - Create Operation

1. Fetch recent messages from current channel within the specified time range
2. Pass messages to LLM with instructions (e.g. "extract action items", "summarize key notes")
3. Generate markdown content
4. Upload markdown file to Supabase storage at `{workspace_id}/docs/{uuid}-{title}.md`
5. Insert row into `files` with `source = 'generated'`, `metadata_status = 'ready'` (summary and tags generated inline since we already have the content)
6. Return file record for inline display

## Inline File Cards

### Message Content Format

AI responses embed file references using a marker syntax:

```
Here are the 3 invoices I found:

:::file{id="abc-123"}
:::file{id="def-456"}
:::file{id="ghi-789"}

The most recent one is from last week.
```

The `:::file{id="..."}` marker is parsed by the `MessageContent` renderer and replaced with a `FileCard` component. Regular text around the markers renders normally.

### FileCard Component

Each inline card displays:
- File icon based on `content_type` (image, PDF, doc, markdown, generic)
- File name
- Source badge: "Uploaded" or "Generated"
- Summary (one-liner if metadata ready, "Processing..." if pending)
- File size + date
- Download button
- Subtle metadata spinner if `metadata_status = 'pending'`

Layout: horizontal card, roughly message-bubble width. Compact enough for 3-4 to stack.

### Download Flow

`GET /api/files/{file_id}/download`
- Auth required, verifies workspace membership
- Generates short-lived signed download URL from Supabase storage
- Returns `{ url: "https://..." }`
- Frontend opens in new tab

## Background Metadata Enrichment

### Worker Function: `enrich_file_metadata(file_id)`

Triggered on file upload via the existing Redis/RQ worker queue.

Steps:
1. Fetch file record from `files` table
2. Single LLM call with file name, content type, workspace name, channel name, and content preview (first 2000 chars for text files):

```
Given this file:
- Name: {file_name}
- Type: {content_type}
- Workspace: {workspace_name}
- Channel: {channel_name}
- Content (first 2000 chars): {content_preview}

Return JSON:
{
  "summary": "one-line description",
  "project_context": "what this file is about in context of the project",
  "tags": ["tag1", "tag2", "tag3"]
}
```

3. Content extraction by type:
   - Text/markdown/code: Download file, read content, pass to LLM
   - PDF: Download, extract text (first few pages), pass to LLM
   - Images: Skip content extraction, rely on file name + project context
   - Other binary: Skip content extraction, rely on file name + content_type + project context
4. Update `files` row: set `summary`, `project_context`, `tags`, `metadata_status = 'ready'`
5. On failure: set `metadata_status = 'failed'`, log error. File remains usable without rich metadata.

For AI-generated documents: `metadata_status` starts as `'ready'` since summary and tags are generated inline during creation. No background job needed.

## API Endpoints

### New Endpoints

**File upload:**
```
POST /api/files/upload
Body: { workspace_id, channel_id, file_name, content_type, file_size }
Auth: required
```
- Creates `files` row with `metadata_status = 'pending'`
- Returns `{ file_id, signed_upload_url }`
- Enqueues `enrich_file_metadata` worker job

**File download:**
```
GET /api/files/{file_id}/download
Auth: required, verifies workspace membership
```
- Returns `{ url: "signed-download-url" }`

### Updated Triage Endpoint

`POST /api/channels/{channel_id}/triage` gains new response shapes:

```json
{
  "should_respond": true,
  "content": "I found 3 invoices:\n\n:::file{id=\"abc\"}\n:::file{id=\"def\"}\n\nThe most recent one is from last Tuesday.",
  "files": [{ "id": "abc", "file_name": "...", "summary": "...", ... }]
}
```

The `files` array is returned alongside message content so the frontend can render file cards immediately without a separate fetch.

### Orchestrator Functions (new in `orchestrator.py`)

| Function | Purpose |
|----------|---------|
| `detect_file_intent(messages)` | LLM classifies if the user wants to find or create files |
| `search_files(workspace_id, query, filters)` | Queries `files` table by metadata |
| `generate_document(channel_id, time_range_days, instructions)` | Reads messages, generates markdown, uploads, inserts row |
| `enrich_file_metadata(file_id)` | Worker function for background metadata enrichment |

## Frontend Changes

| Component | Change |
|-----------|--------|
| `MessageContent` in `message-bubble.tsx` | Parse `:::file{id="..."}` markers, render `FileCard` |
| New `FileCard` component | Inline card with icon, name, summary, download button |
| `composer.tsx` | Upload flow writes to `files` table, embeds `:::file{...}` in message |
| `inspector-panel.tsx` | Files tab queries `files` table instead of `thread_files` |
| `supabase-data.ts` | New functions: `createFile`, `fetchWorkspaceFiles`, `getFileDownloadUrl` |
| `types/index.ts` | New `FileRecord` type, deprecate `ThreadFile` |

## Out of Scope

- File versioning/revisions
- Rich text editor (markdown only for now)
- File rename UI (AI suggests in chat)
- Drag-and-drop upload
- File permissions beyond workspace membership
- Vector embeddings (schema designed for, not implemented)
- Cross-workspace file search
- File browsing UI / dedicated files page

## Future: Vector Search Integration Point

When vector search is added later:
1. Add `embedding vector(1536)` column to `files` table
2. In `enrich_file_metadata`, generate embedding from file content alongside other metadata
3. In `search_files`, add cosine similarity search as an alternative/complement to ILIKE
4. pgvector extension is already enabled in the database
