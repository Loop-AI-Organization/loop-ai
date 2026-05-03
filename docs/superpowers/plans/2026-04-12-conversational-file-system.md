# Conversational File System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a conversational file system where users find and create files through @ai chat, with inline file cards and background metadata enrichment.

**Architecture:** New `files` table replaces `thread_files`. File intent detection added to the existing triage pipeline (nav intent -> file intent -> normal response). Background worker enriches file metadata (summary, tags, project context) lazily after upload. Inline `:::file{id="..."}` markers in messages render as FileCard components.

**Tech Stack:** Supabase (Postgres + Storage), FastAPI, Redis/RQ worker, React + Zustand, OpenRouter LLM API

---

### Task 0: Database Migration - `files` Table and `thread_files` Deprecation

**Goal:** Create the `files` table with all columns, indexes, and RLS policies. Drop `thread_files`.

**Files:**
- Create: `supabase/migrations/20260412000000_files_table.sql`
- Modify: `supabase/setup_tables_manual.sql` (add files table, remove thread_files references)

**Acceptance Criteria:**
- [ ] `files` table exists with all columns from spec (id, workspace_id, source, storage_path, file_name, file_size, content_type, created_by, created_at, summary, project_context, tags, metadata_status, source_channel_id)
- [ ] CHECK constraints on `source` ('upload', 'generated') and `metadata_status` ('pending', 'ready', 'failed')
- [ ] GIN index on `tags` column
- [ ] RLS policies use `get_my_workspace_ids()` function (existing)
- [ ] `thread_files` table is dropped
- [ ] Migration applies cleanly to remote DB

**Verify:** `npx supabase db push --linked` succeeds, then query `files` table via REST API to confirm schema

**Steps:**

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260412000000_files_table.sql

-- Migrate existing thread_files data into files, then drop thread_files.

-- 1. Create files table
CREATE TABLE IF NOT EXISTS public.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'generated')),
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    content_type text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    summary text,
    project_context text,
    tags text[],
    metadata_status text NOT NULL DEFAULT 'pending' CHECK (metadata_status IN ('pending', 'ready', 'failed')),
    source_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON public.files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON public.files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_source_channel_id ON public.files(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_files_tags ON public.files USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_files_metadata_status ON public.files(metadata_status);

-- 3. RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on files"
    ON public.files FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view files in their workspaces"
    ON public.files FOR SELECT
    TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Users can create files in their workspaces"
    ON public.files FOR INSERT
    TO authenticated
    WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Users can update own files"
    ON public.files FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own files"
    ON public.files FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- 4. Migrate existing thread_files data
INSERT INTO public.files (id, workspace_id, source, storage_path, file_name, file_size, content_type, created_by, created_at, metadata_status, source_channel_id)
SELECT
    tf.id,
    t.workspace_id,
    'upload',
    tf.storage_path,
    tf.file_name,
    tf.file_size,
    tf.content_type,
    tf.uploaded_by,
    tf.created_at,
    'pending',
    t.channel_id
FROM public.thread_files tf
JOIN public.threads t ON t.id = tf.thread_id
WHERE t.workspace_id IS NOT NULL;

-- 5. Drop thread_files
DROP TABLE IF EXISTS public.thread_files;
```

- [ ] **Step 2: Update setup_tables_manual.sql**

Add the `files` table definition and remove `thread_files` references from `supabase/setup_tables_manual.sql`. Replace the `thread_files` CREATE TABLE block with the `files` CREATE TABLE block from step 1. Remove indexes and RLS entries for `thread_files`.

- [ ] **Step 3: Push migration to remote**

Run:
```bash
npx supabase db push --linked
```
Expected: Migration applies successfully.

- [ ] **Step 4: Verify via REST API**

```bash
curl -s "https://bydtqwwkivlisdnnkich.supabase.co/rest/v1/files?select=id&limit=0" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: 200 OK (empty array, table exists)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260412000000_files_table.sql supabase/setup_tables_manual.sql
git commit -m "feat: add files table, migrate thread_files data, drop thread_files"
```

---

### Task 1: Frontend Types and Data Layer for Files

**Goal:** Add `FileRecord` type, Supabase query functions, and backend API helpers for the new `files` table. Remove deprecated `ThreadFile` code.

**Files:**
- Modify: `frontend/src/types/index.ts` (add FileRecord, remove ThreadFile)
- Modify: `frontend/src/lib/supabase-data.ts` (add file functions, remove thread_files functions)

**Acceptance Criteria:**
- [ ] `FileRecord` type defined with all columns from `files` table
- [ ] `fetchWorkspaceFiles(workspaceId)` queries `files` table
- [ ] `uploadFile(workspaceId, channelId, file)` creates file record and uploads to storage
- [ ] `getFileDownloadUrl(fileId)` calls backend download endpoint
- [ ] Old `ThreadFile` type, `fetchThreadFiles`, `uploadThreadFile` removed
- [ ] TypeScript compiles cleanly

**Verify:** `cd frontend && npx tsc --noEmit` passes with no errors

**Steps:**

- [ ] **Step 1: Update types/index.ts**

Replace the `ThreadFile` interface with `FileRecord`:

```typescript
// In frontend/src/types/index.ts

// Remove the ThreadFile interface and replace with:
export interface FileRecord {
  id: string;
  workspaceId: string;
  source: 'upload' | 'generated';
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string | null;
  createdBy: string | null;
  createdAt: Date;
  summary: string | null;
  projectContext: string | null;
  tags: string[] | null;
  metadataStatus: 'pending' | 'ready' | 'failed';
  sourceChannelId: string | null;
}
```

- [ ] **Step 2: Update supabase-data.ts - Remove old thread_files code**

Remove the `ThreadFileRow` interface, `toThreadFile` function, `fetchThreadFiles` function, and `uploadThreadFile` function.

- [ ] **Step 3: Add file row type and converter to supabase-data.ts**

```typescript
// --- Files ---
interface FileRow {
  id: string;
  workspace_id: string;
  source: 'upload' | 'generated';
  storage_path: string;
  file_name: string;
  file_size: number;
  content_type: string | null;
  created_by: string | null;
  created_at: string;
  summary: string | null;
  project_context: string | null;
  tags: string[] | null;
  metadata_status: 'pending' | 'ready' | 'failed';
  source_channel_id: string | null;
}

function toFileRecord(r: FileRow): FileRecord {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    source: r.source,
    storagePath: r.storage_path,
    fileName: r.file_name,
    fileSize: Number(r.file_size),
    contentType: r.content_type,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at),
    summary: r.summary,
    projectContext: r.project_context,
    tags: r.tags,
    metadataStatus: r.metadata_status,
    sourceChannelId: r.source_channel_id,
  };
}
```

- [ ] **Step 4: Add fetchWorkspaceFiles function**

```typescript
export async function fetchWorkspaceFiles(workspaceId: string): Promise<FileRecord[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as FileRow[]).map(toFileRecord);
}
```

- [ ] **Step 5: Add uploadFile function**

```typescript
export async function uploadFile(
  workspaceId: string,
  channelId: string | null,
  file: File
): Promise<FileRecord> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workspace_id: workspaceId,
      channel_id: channelId,
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
    }),
  });
  if (!res.ok) throw new Error('Failed to initiate upload');
  const payload = await res.json();
  const uploadUrl: string = payload.signed_upload_url;
  const fileId: string = payload.file_id;

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!putRes.ok) throw new Error('Upload failed');

  // Fetch the created file record
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();
  if (error) throw error;
  return toFileRecord(data as FileRow);
}
```

- [ ] **Step 6: Add getFileDownloadUrl function**

```typescript
export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/files/${fileId}/download`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) throw new Error('Failed to get download URL');
  const body = await res.json();
  return body.url as string;
}
```

- [ ] **Step 7: Fix imports across the codebase**

Update `inspector-panel.tsx` to import `FileRecord` instead of `ThreadFile`, and `fetchWorkspaceFiles` instead of `fetchThreadFiles`. Update the `composer.tsx` to use `uploadFile` instead of `uploadThreadFile`. Fix all TypeScript compilation errors.

- [ ] **Step 8: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

```bash
git add frontend/src/types/index.ts frontend/src/lib/supabase-data.ts frontend/src/components/inspector-panel.tsx frontend/src/components/composer.tsx
git commit -m "feat: add FileRecord type and file data layer, remove thread_files"
```

---

### Task 2: Backend Upload and Download Endpoints

**Goal:** Add `POST /api/files/upload` and `GET /api/files/{file_id}/download` endpoints. Remove the old `POST /api/signed-upload` endpoint.

**Files:**
- Modify: `backend/app/routes.py` (add new endpoints, remove old signed-upload)

**Acceptance Criteria:**
- [ ] `POST /api/files/upload` creates a `files` row, returns `{ file_id, signed_upload_url }`, enqueues metadata enrichment
- [ ] `GET /api/files/{file_id}/download` verifies workspace membership and returns `{ url: "signed-download-url" }`
- [ ] Old `/api/signed-upload` endpoint removed
- [ ] Both endpoints require auth

**Verify:** `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); print('OK')"` passes

**Steps:**

- [ ] **Step 1: Add request models**

Add to `backend/app/routes.py` near the other request models:

```python
class FileUploadRequest(BaseModel):
    workspace_id: str
    channel_id: str | None = None
    file_name: str
    content_type: str = "application/octet-stream"
    file_size: int = 0
```

- [ ] **Step 2: Add upload endpoint**

```python
@router.post("/api/files/upload")
async def upload_file(
    body: FileUploadRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Create a files row and return a signed upload URL."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Verify workspace membership
    ws = supabase.table("workspaces").select("id").eq("id", body.workspace_id).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    import uuid as _uuid
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in body.file_name)
    storage_path = f"{body.workspace_id}/uploads/{_uuid.uuid4()}-{safe_name}"

    # Insert files row
    row = {
        "workspace_id": body.workspace_id,
        "source": "upload",
        "storage_path": storage_path,
        "file_name": body.file_name,
        "file_size": body.file_size,
        "content_type": body.content_type,
        "created_by": uid,
        "metadata_status": "pending",
        "source_channel_id": body.channel_id,
    }
    result = supabase.table("files").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create file record")
    file_id = result.data[0]["id"]

    # Get signed upload URL
    bucket = "workspace-files"
    try:
        data = supabase.storage.from_(bucket).create_signed_upload_url(
            storage_path, expires_in=900
        )
    except Exception as e:
        raise HTTPException(502, f"Storage error: {e!s}")

    signed_url = data.get("signedUrl") or data.get("signed_url") or data.get("url")
    if not signed_url:
        raise HTTPException(500, "Failed to create signed URL")

    # Enqueue metadata enrichment
    try:
        enqueue_action(file_id, "enrich_file_metadata", action_id=None)
    except Exception:
        pass  # Non-fatal; file is usable without metadata

    return {"file_id": file_id, "signed_upload_url": signed_url}
```

- [ ] **Step 3: Add download endpoint**

```python
@router.get("/api/files/{file_id}/download")
async def download_file(
    file_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Return a signed download URL for a file."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Fetch file record
    file_res = supabase.table("files").select("id, workspace_id, storage_path").eq("id", file_id).execute()
    if not file_res.data:
        raise HTTPException(status_code=404, detail="File not found")
    file_row = file_res.data[0]

    # Verify workspace membership (owner or member)
    workspace_id = file_row["workspace_id"]
    ws = supabase.table("workspaces").select("id, user_id").eq("id", workspace_id).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.data[0]["user_id"] != uid:
        members = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", uid)
            .execute()
        )
        if not members.data:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    bucket = "workspace-files"
    try:
        data = supabase.storage.from_(bucket).create_signed_url(
            file_row["storage_path"], expires_in=300
        )
    except Exception as e:
        raise HTTPException(502, f"Storage error: {e!s}")

    url = data.get("signedURL") or data.get("signed_url") or data.get("signedUrl")
    if not url:
        raise HTTPException(500, "Failed to create download URL")

    return {"url": url}
```

- [ ] **Step 4: Remove old signed-upload endpoint**

Delete the `SignedUploadRequest` class and the `signed_upload` endpoint function from `routes.py`.

- [ ] **Step 5: Verify and commit**

Run: `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); print('OK')"`
Expected: `OK`

```bash
git add backend/app/routes.py
git commit -m "feat: add file upload/download endpoints, remove old signed-upload"
```

---

### Task 3: Orchestrator - File Intent Detection and Search

**Goal:** Add `detect_file_intent()` and `search_files()` to the orchestrator, and integrate file intent detection into the triage endpoint.

**Files:**
- Modify: `backend/loop_ai/orchestrator/orchestrator.py` (add detect_file_intent, search_files)
- Modify: `backend/app/routes.py` (add file intent step to triage endpoint)

**Acceptance Criteria:**
- [ ] `detect_file_intent(messages)` returns `{"is_file_intent": bool, "intent_type": str, "query": str, ...}`
- [ ] `search_files(workspace_id, query)` queries `files` table with ILIKE + tag matching, returns list of file dicts
- [ ] Triage endpoint calls file intent detection after navigation, before normal response
- [ ] File search results returned with `:::file{id="..."}` markers in content and `files` array

**Verify:** `python3 -c "import ast; ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('OK')"` passes

**Steps:**

- [ ] **Step 1: Add file intent detection prompt and function to orchestrator.py**

```python
_FILE_INTENT_DETECT_PROMPT = """\
You are a file intent detector. Decide if the user wants to find files or create a document from conversation history.

Reply ONLY with valid JSON:
{
  "is_file_intent": true/false,
  "intent_type": "find_file" | "create_document" | "none",
  "query": "<search query or null>",
  "doc_title": "<document title or null>",
  "time_range_days": <number or null>,
  "instructions": "<what to extract or null>"
}

Examples of file intents:
- "find my invoices" -> find_file, query="invoices"
- "where's the design doc?" -> find_file, query="design doc"
- "find photos from last week" -> find_file, query="photos"
- "export action items from last 2 days" -> create_document, doc_title="Action Items", time_range_days=2, instructions="extract action items"
- "summarize key notes from this week" -> create_document, doc_title="Key Notes", time_range_days=7, instructions="summarize key discussion notes"

If not a file intent, return {"is_file_intent": false, "intent_type": "none", "query": null, "doc_title": null, "time_range_days": null, "instructions": null}.\
"""


def detect_file_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """Detect if the user wants to find files or create a document."""
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _FILE_INTENT_DETECT_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {
            "is_file_intent": bool(result.get("is_file_intent")),
            "intent_type": result.get("intent_type", "none"),
            "query": result.get("query"),
            "doc_title": result.get("doc_title"),
            "time_range_days": result.get("time_range_days"),
            "instructions": result.get("instructions"),
        }
    except Exception:
        return {"is_file_intent": False, "intent_type": "none", "query": None,
                "doc_title": None, "time_range_days": None, "instructions": None}
```

- [ ] **Step 2: Add search_files function to orchestrator.py**

```python
def search_files(*, workspace_id: str, query: str, content_type_filter: Optional[str] = None) -> List[Dict]:
    """Search files by metadata (name, summary, tags, project_context)."""
    from app.supabase_client import supabase

    # Build query - search across multiple text fields
    q = supabase.table("files").select("*").eq("workspace_id", workspace_id)

    if content_type_filter:
        q = q.ilike("content_type", f"%{content_type_filter}%")

    # Execute and filter in Python for flexible multi-field matching
    result = q.order("created_at", desc=True).limit(50).execute()
    files = result.data or []

    if not query:
        return files[:10]

    query_lower = query.lower()
    query_words = query_lower.split()

    def score_file(f: Dict) -> int:
        s = 0
        name = (f.get("file_name") or "").lower()
        summary = (f.get("summary") or "").lower()
        context = (f.get("project_context") or "").lower()
        tags = [t.lower() for t in (f.get("tags") or [])]

        for word in query_words:
            if word in name:
                s += 10
            if any(word in tag for tag in tags):
                s += 7
            if word in summary:
                s += 5
            if word in context:
                s += 3
        return s

    scored = [(score_file(f), f) for f in files]
    scored = [(s, f) for s, f in scored if s > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored[:10]]
```

- [ ] **Step 3: Add file intent import to routes.py**

Update the import at the top of `backend/app/routes.py`:

```python
from loop_ai.orchestrator.orchestrator import (
    stream_assistant_reply,
    triage_message,
    generate_full_response,
    detect_navigation_intent,
    find_best_channel,
    generate_channel_summary,
    detect_file_intent,
    search_files,
)
```

- [ ] **Step 4: Add file intent step to triage endpoint**

In the `respond_to_ai_mention` function in `routes.py`, add Step 2 (file intent) between the navigation intent check and the normal AI response. Insert after the navigation block (after line ~719) and before the `# --- Step 2: Normal AI response ---` comment:

```python
    # --- Step 2: Detect file intent ---
    file_intent = await loop.run_in_executor(
        None, lambda: detect_file_intent(messages=msgs)
    )

    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "find_file":
        query = file_intent.get("query", "")
        # Get workspace_id from channel
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            found_files = await loop.run_in_executor(
                None, lambda: search_files(workspace_id=workspace_id, query=query)
            )
            if found_files:
                file_markers = "\n".join(f':::file{{id="{f["id"]}"}}' for f in found_files)
                content = f"I found {len(found_files)} file(s) matching \"{query}\":\n\n{file_markers}"
                # Save assistant message
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": body.thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                    "files": found_files,
                }
            else:
                content = f"I couldn't find any files matching \"{query}\"."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": body.thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

    # Rename existing "Step 2" comment to "Step 3"
    # --- Step 3: Normal AI response ---
```

- [ ] **Step 5: Verify and commit**

Run: `python3 -c "import ast; ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('OK')"`
Run: `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); print('OK')"`
Expected: Both print `OK`

```bash
git add backend/loop_ai/orchestrator/orchestrator.py backend/app/routes.py
git commit -m "feat: add file intent detection and search to triage pipeline"
```

---

### Task 4: Orchestrator - Document Generation

**Goal:** Add `generate_document()` to the orchestrator that reads channel messages, generates markdown, uploads to storage, and creates a `files` row. Wire it into the triage endpoint for `create_document` intents.

**Files:**
- Modify: `backend/loop_ai/orchestrator/orchestrator.py` (add generate_document)
- Modify: `backend/app/routes.py` (add create_document handling to triage)

**Acceptance Criteria:**
- [ ] `generate_document()` fetches messages from channel within time range, generates markdown via LLM, uploads to storage, inserts `files` row with `source='generated'` and `metadata_status='ready'`
- [ ] Triage endpoint handles `create_document` intent by calling `generate_document` and returning file markers
- [ ] Generated doc is downloadable via the download endpoint

**Verify:** `python3 -c "import ast; ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('OK')"` passes

**Steps:**

- [ ] **Step 1: Add generate_document function to orchestrator.py**

```python
_DOCUMENT_GEN_PROMPT = """\
You are a document generator. Given recent chat messages from a channel, create a well-structured markdown document.

Title: {title}
Instructions: {instructions}

Write a clean markdown document. Use headers, bullet points, and formatting as appropriate.
Do NOT include preamble like "Here is the document" — just write the document content directly.\
"""


def generate_document(
    *,
    channel_id: str,
    workspace_id: str,
    title: str,
    time_range_days: int = 7,
    instructions: str = "summarize the key discussion points",
    created_by: str,
) -> Optional[Dict]:
    """
    Generate a markdown document from recent channel messages.
    Uploads to storage and inserts a files row.
    Returns the file record dict or None on failure.
    """
    from app.supabase_client import supabase
    from datetime import datetime, timezone, timedelta
    import uuid as _uuid

    settings = load_settings()

    # Fetch messages from channel within time range
    cutoff = (datetime.now(timezone.utc) - timedelta(days=time_range_days)).isoformat()
    threads_res = supabase.table("threads").select("id").eq("channel_id", channel_id).execute()
    thread_ids = [t["id"] for t in (threads_res.data or [])]
    if not thread_ids:
        return None

    msgs_res = (
        supabase.table("messages")
        .select("role, content, created_at, user_display_name")
        .in_("thread_id", thread_ids)
        .gte("created_at", cutoff)
        .order("created_at", desc=False)
        .limit(200)
        .execute()
    )
    messages = msgs_res.data or []
    if not messages:
        return None

    # Format messages for LLM
    context_lines = []
    for m in messages:
        author = m.get("user_display_name") or m.get("role", "user")
        context_lines.append(f"[{author}]: {m.get('content', '')}")
    context = "\n".join(context_lines)

    prompt = _DOCUMENT_GEN_PROMPT.format(title=title, instructions=instructions)
    llm_msgs = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Channel messages:\n\n{context}"},
    ]

    doc_content = chat_completion(
        settings=settings,
        messages=llm_msgs,
        model=settings.openrouter_response_model,
        max_tokens=2048,
        temperature=0.3,
    ).strip()

    if not doc_content:
        return None

    # Generate summary and tags inline (since we have the content)
    meta_prompt = (
        "Given this document, return JSON with: "
        '{"summary": "one-line description", "tags": ["tag1", "tag2", "tag3"]}\n\n'
        f"Document title: {title}\n\n{doc_content[:1000]}"
    )
    meta_raw = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": meta_prompt}],
        model=settings.openrouter_triage_model,
        max_tokens=64,
        temperature=0.0,
    )
    try:
        meta = json.loads(meta_raw.strip())
    except Exception:
        meta = {"summary": title, "tags": []}

    # Upload markdown to storage
    safe_title = "".join(c if c.isalnum() or c in "._- " else "_" for c in title).strip().replace(" ", "-")
    file_name = f"{safe_title}.md"
    storage_path = f"{workspace_id}/docs/{_uuid.uuid4()}-{file_name}"
    bucket = "workspace-files"

    try:
        supabase.storage.from_(bucket).upload(
            storage_path,
            doc_content.encode("utf-8"),
            {"content-type": "text/markdown"},
        )
    except Exception:
        return None

    # Insert files row
    row = {
        "workspace_id": workspace_id,
        "source": "generated",
        "storage_path": storage_path,
        "file_name": file_name,
        "file_size": len(doc_content.encode("utf-8")),
        "content_type": "text/markdown",
        "created_by": created_by,
        "metadata_status": "ready",
        "summary": meta.get("summary", title),
        "tags": meta.get("tags", []),
        "project_context": f"Generated from channel messages (last {time_range_days} days)",
        "source_channel_id": channel_id,
    }
    result = supabase.table("files").insert(row).execute()
    if not result.data:
        return None
    return result.data[0]
```

- [ ] **Step 2: Add create_document handling to triage endpoint in routes.py**

In the file intent block in `respond_to_ai_mention`, after the `find_file` handling, add:

```python
    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "create_document":
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            doc_title = file_intent.get("doc_title") or "Document"
            time_range = file_intent.get("time_range_days") or 7
            instructions = file_intent.get("instructions") or "summarize the key points"

            generated = await loop.run_in_executor(
                None,
                lambda: generate_document(
                    channel_id=channel_id,
                    workspace_id=workspace_id,
                    title=doc_title,
                    time_range_days=time_range,
                    instructions=instructions,
                    created_by=uid,
                ),
            )
            if generated:
                file_marker = f':::file{{id="{generated["id"]}"}}'
                content = f"I created \"{doc_title}\":\n\n{file_marker}"
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": body.thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                    "files": [generated],
                }
            else:
                content = "I couldn't generate the document — there may not be enough messages in the specified time range."
                return {"should_respond": True, "content": content}
```

Also update the import at the top of routes.py to include `generate_document`:

```python
from loop_ai.orchestrator.orchestrator import (
    stream_assistant_reply,
    triage_message,
    generate_full_response,
    detect_navigation_intent,
    find_best_channel,
    generate_channel_summary,
    detect_file_intent,
    search_files,
    generate_document,
)
```

- [ ] **Step 3: Verify and commit**

Run: `python3 -c "import ast; ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('OK')"`
Run: `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); print('OK')"`
Expected: Both print `OK`

```bash
git add backend/loop_ai/orchestrator/orchestrator.py backend/app/routes.py
git commit -m "feat: add document generation from channel messages"
```

---

### Task 5: Background Metadata Enrichment Worker

**Goal:** Add `_enrich_file_metadata()` to the worker that fetches a file, downloads content (for text types), generates summary/tags/project_context via LLM, and updates the file record.

**Files:**
- Modify: `backend/worker.py` (add enrich_file_metadata handler)

**Acceptance Criteria:**
- [ ] Worker handles `label="enrich_file_metadata"` where `thread_id` holds the `file_id`
- [ ] Downloads text/markdown/code files and extracts first 2000 chars for LLM
- [ ] Generates summary, project_context, tags via single LLM call
- [ ] Updates `files` row with metadata and `metadata_status='ready'`
- [ ] Sets `metadata_status='failed'` on error without crashing worker

**Verify:** `python3 -c "import ast; ast.parse(open('backend/worker.py').read()); print('OK')"` passes

**Steps:**

- [ ] **Step 1: Add enrich function to worker.py**

```python
def _enrich_file_metadata(file_id: str) -> None:
    """
    Fetch a file record, download content preview, generate metadata via LLM,
    and update the files row.
    """
    from loop_ai.orchestrator.orchestrator import chat_completion
    from loop_ai.config import load_settings
    import json

    settings = load_settings()

    # Fetch file record
    file_res = supabase.table("files").select("*").eq("id", file_id).single().execute()
    if not file_res.data:
        return
    f = file_res.data
    if f.get("metadata_status") == "ready":
        return  # Already enriched (e.g. generated docs)

    # Get workspace and channel names for context
    ws_res = supabase.table("workspaces").select("name").eq("id", f["workspace_id"]).single().execute()
    workspace_name = ws_res.data.get("name", "Unknown") if ws_res.data else "Unknown"

    channel_name = "Unknown"
    if f.get("source_channel_id"):
        ch_res = supabase.table("channels").select("name").eq("id", f["source_channel_id"]).single().execute()
        channel_name = ch_res.data.get("name", "Unknown") if ch_res.data else "Unknown"

    # Download content preview for text-based files
    content_preview = ""
    ct = (f.get("content_type") or "").lower()
    text_types = ["text/", "application/json", "application/xml", "application/javascript", "text/markdown"]
    is_text = any(ct.startswith(t) or ct == t for t in text_types)

    if is_text:
        try:
            bucket = "workspace-files"
            data = supabase.storage.from_(bucket).download(f["storage_path"])
            if data:
                content_preview = data.decode("utf-8", errors="ignore")[:2000]
        except Exception:
            pass

    # Single LLM call for all metadata
    prompt = f"""Given this file:
- Name: {f.get("file_name", "unknown")}
- Type: {f.get("content_type", "unknown")}
- Workspace: {workspace_name}
- Channel: {channel_name}
- Content (first 2000 chars): {content_preview or "(binary/no content available)"}

Return JSON:
{{"summary": "one-line description of the file", "project_context": "what this file is about in context of the project", "tags": ["tag1", "tag2", "tag3"]}}"""

    raw = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.0,
    )

    try:
        meta = json.loads(raw.strip())
    except Exception:
        meta = {
            "summary": f.get("file_name", "File"),
            "project_context": f"File in {workspace_name} / #{channel_name}",
            "tags": [],
        }

    supabase.table("files").update({
        "summary": meta.get("summary"),
        "project_context": meta.get("project_context"),
        "tags": meta.get("tags", []),
        "metadata_status": "ready",
    }).eq("id", file_id).execute()
```

- [ ] **Step 2: Add routing in handle_action**

In the `handle_action` function, add a case for `enrich_file_metadata` right after the `generate_summary` case:

```python
    if label == "enrich_file_metadata":
        try:
            _enrich_file_metadata(thread_id)  # thread_id holds file_id here
        except Exception:
            # Mark as failed but don't crash worker
            try:
                supabase.table("files").update({"metadata_status": "failed"}).eq("id", thread_id).execute()
            except Exception:
                pass
        return {"ok": True, "label": "enrich_file_metadata"}
```

- [ ] **Step 3: Verify and commit**

Run: `python3 -c "import ast; ast.parse(open('backend/worker.py').read()); print('OK')"`
Expected: `OK`

```bash
git add backend/worker.py
git commit -m "feat: add background metadata enrichment for uploaded files"
```

---

### Task 6: Inline FileCard Component

**Goal:** Create a `FileCard` component for inline display in chat messages and update the `MessageContent` renderer to parse `:::file{id="..."}` markers.

**Files:**
- Create: `frontend/src/components/file-card.tsx`
- Modify: `frontend/src/components/message-bubble.tsx` (parse file markers in MessageContent)

**Acceptance Criteria:**
- [ ] `FileCard` shows file icon, name, source badge, summary, size, date, and download button
- [ ] Download button fetches signed URL and opens in new tab
- [ ] Pending metadata shows "Processing..." with a spinner
- [ ] `MessageContent` splits on `:::file{id="..."}` and renders FileCard for each
- [ ] Regular text around file markers renders normally
- [ ] TypeScript compiles cleanly

**Verify:** `cd frontend && npx tsc --noEmit` passes

**Steps:**

- [ ] **Step 1: Create file-card.tsx**

```tsx
// frontend/src/components/file-card.tsx
import { useState } from 'react';
import {
  FileText,
  Image,
  File,
  FileCode,
  Download,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFileDownloadUrl } from '@/lib/supabase-data';
import type { FileRecord } from '@/types';
import { cn } from '@/lib/utils';

function getFileIcon(contentType: string | null) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return Image;
  if (ct === 'application/pdf' || ct === 'text/markdown') return FileText;
  if (ct.startsWith('text/') || ct.includes('json') || ct.includes('javascript'))
    return FileCode;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileCardProps {
  file: FileRecord;
}

export function FileCard({ file }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(file.contentType);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getFileDownloadUrl(file.id);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 my-1 rounded-lg border border-border bg-muted/30 max-w-md">
      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4.5 h-4.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{file.fileName}</p>
          <span
            className={cn(
              'text-2xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0',
              file.source === 'generated'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {file.source === 'generated' ? 'Generated' : 'Uploaded'}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground truncate">
          {file.metadataStatus === 'pending' ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing...
            </span>
          ) : (
            file.summary || `${formatFileSize(file.fileSize)} \u00B7 ${file.createdAt.toLocaleDateString()}`
          )}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0"
        onClick={handleDownload}
        disabled={downloading}
        title="Download"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update MessageContent in message-bubble.tsx**

Add file marker parsing to the `MessageContent` function. Before the line-by-line loop, split on file markers first. Replace the `MessageContent` function body:

At the top of message-bubble.tsx, add the import:
```tsx
import { FileCard } from '@/components/file-card';
import type { FileRecord } from '@/types';
```

Then update `MessageContent` to handle `:::file{id="..."}` markers. Before the existing line-by-line processing, add a pre-processing step:

```tsx
function MessageContent({ content, files }: { content: string; files?: FileRecord[] }) {
  // Split content on :::file{id="..."} markers
  const FILE_MARKER_RE = /:::file\{id="([^"]+)"\}/g;
  const segments: Array<{ type: 'text'; text: string } | { type: 'file'; id: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_MARKER_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'file', id: match[1] });
    lastIndex = FILE_MARKER_RE.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }

  const filesById = new Map((files || []).map(f => [f.id, f]));

  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === 'file') {
          const fileRecord = filesById.get(seg.id);
          if (fileRecord) {
            return <FileCard key={`file-${idx}`} file={fileRecord} />;
          }
          return null; // File data not available
        }
        return <TextContent key={`text-${idx}`} content={seg.text} />;
      })}
    </>
  );
}
```

Rename the existing `MessageContent` line-by-line markdown renderer to `TextContent`:

```tsx
function TextContent({ content }: { content: string }) {
  // (existing line-by-line markdown rendering code stays exactly the same)
  const lines = content.split('\n');
  // ... rest of existing code
}
```

- [ ] **Step 3: Pass files data to MessageContent**

In the `MessageBubble` component, the `MessageContent` component needs file data. For now, files from the triage response are embedded in the message store. We'll add a `files` field to the `Message` type:

In `frontend/src/types/index.ts`, add to the `Message` interface:
```typescript
  files?: FileRecord[];
```

In the `MessageBubble` component, pass files:
```tsx
<MessageContent content={message.content} files={message.files} />
```

- [ ] **Step 4: Update composer to pass files from triage response**

In `composer.tsx`, when the triage response includes files, include them in the assistant message added to the store:

```tsx
      } else if (result.shouldRespond && result.content) {
        const assistantMessage: Message = {
          id: result.messageId || `msg-ai-${Date.now()}`,
          threadId,
          role: 'assistant',
          content: result.content,
          createdAt: new Date(),
          files: result.files,  // Add this line
        };
        addMessage(assistantMessage);
      }
```

Update the `TriageResult` type in `supabase-data.ts` to include files:
```typescript
export interface TriageResult {
  shouldRespond: boolean;
  messageId?: string;
  content?: string;
  reason?: string;
  navigation?: NavigationResult;
  files?: FileRecord[];
}
```

And update the `triageAndRespond` function to map the files:
```typescript
    files: data.files?.map((f: FileRow) => toFileRecord(f)),
```

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

```bash
git add frontend/src/components/file-card.tsx frontend/src/components/message-bubble.tsx frontend/src/types/index.ts frontend/src/components/composer.tsx frontend/src/lib/supabase-data.ts
git commit -m "feat: add inline FileCard component and file marker parsing in messages"
```

---

### Task 7: Update Composer Upload Flow and Inspector Panel

**Goal:** Update the composer's file attachment to use the new `files` table and `uploadFile` function. Update inspector panel to show workspace files from the new table.

**Files:**
- Modify: `frontend/src/components/composer.tsx` (use new upload flow, embed file marker in message)
- Modify: `frontend/src/components/inspector-panel.tsx` (query files table, use FileRecord)

**Acceptance Criteria:**
- [ ] Paperclip upload creates a `files` row via `uploadFile()`, then inserts a user message with `:::file{id="..."}` marker
- [ ] Inspector files tab shows workspace files from `files` table with working download buttons
- [ ] No references to `thread_files`, `ThreadFile`, `fetchThreadFiles`, or `uploadThreadFile` remain
- [ ] TypeScript compiles cleanly

**Verify:** `cd frontend && npx tsc --noEmit` passes, `grep -r "thread_files\|ThreadFile\|fetchThreadFiles\|uploadThreadFile" frontend/src/` returns no results

**Steps:**

- [ ] **Step 1: Update composer upload flow**

In `composer.tsx`, replace the `handleFileChange` function and update imports:

Remove `uploadThreadFile` from imports, add `uploadFile`:
```tsx
import {
  createThread as createThreadInSupabase,
  insertMessage as insertMessageInSupabase,
  uploadFile,
  triageAndRespond,
  fetchChannels,
  fetchThreads,
  fetchMessages,
} from '@/lib/supabase-data';
```

Replace `handleFileChange`:
```tsx
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentWorkspaceId) return;

    let threadId = currentThreadId;

    // Create thread if none exists
    if (!threadId && currentWorkspaceId && currentChannelId) {
      try {
        const newThread = await createThreadInSupabase(
          currentWorkspaceId,
          currentChannelId,
          file.name.slice(0, 50)
        );
        addThread(newThread);
        threadId = newThread.id;
      } catch {
        return;
      }
    }

    if (!threadId) return;

    setUploading(true);
    try {
      const uploaded = await uploadFile(currentWorkspaceId, currentChannelId, file);
      // Insert a message with the file marker so it shows inline
      const content = `:::file{id="${uploaded.id}"}`;
      const msg = await insertMessageInSupabase(threadId, 'user', content);
      addMessage({ ...msg, files: [uploaded] });
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };
```

Also update the attach button to not require `currentThreadId` (since we create one):
```tsx
  disabled={!currentWorkspaceId || uploading}
```

- [ ] **Step 2: Update inspector panel**

Replace the thread_files logic in `inspector-panel.tsx`:

Update imports:
```tsx
import { fetchWorkspaceFiles, getFileDownloadUrl } from '@/lib/supabase-data';
import type { FileRecord } from '@/types';
```

Remove `import { fetchThreadFiles } from '@/lib/supabase-data';` and `import type { ThreadFile } from '@/types';`.

Update the state and effect:
```tsx
  const [workspaceFiles, setWorkspaceFiles] = useState<FileRecord[]>([]);
  const { currentWorkspaceId } = useAppStore();

  useEffect(() => {
    if (!currentWorkspaceId) {
      setWorkspaceFiles([]);
      return;
    }
    let cancelled = false;
    fetchWorkspaceFiles(currentWorkspaceId).then((list) => {
      if (!cancelled) setWorkspaceFiles(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentWorkspaceId]);
```

Update the files tab content:
```tsx
          <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Files in this workspace.
                </p>
                {workspaceFiles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No files yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workspaceFiles.map((file) => (
                      <InspectorFileCard key={file.id} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
```

Replace the old `FileCard` component at the bottom of inspector-panel.tsx with:
```tsx
function InspectorFileCard({ file }: { file: FileRecord }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getFileDownloadUrl(file.id);
      window.open(url, '_blank');
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
        <File className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.fileName}</p>
        <p className="text-2xs text-muted-foreground">
          {file.summary || `${formatFileSize(file.fileSize)} \u00B7 ${file.createdAt.toLocaleDateString()}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleDownload}
        disabled={downloading}
      >
        <Download className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
```

Remove the old `FileCard` component and its `FileCardProps` interface.

- [ ] **Step 3: Clean up any remaining thread_files references**

Search for and remove any remaining references:
```bash
grep -r "thread_files\|ThreadFile\|fetchThreadFiles\|uploadThreadFile" frontend/src/
```

Fix any remaining hits.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

Run: `grep -r "thread_files\|ThreadFile\|fetchThreadFiles\|uploadThreadFile" frontend/src/`
Expected: No results

```bash
git add frontend/src/components/composer.tsx frontend/src/components/inspector-panel.tsx
git commit -m "feat: update composer and inspector to use files table"
```

---

### Task 8: End-to-End Verification

**Goal:** Verify the full flow works: upload a file, see it in inspector, ask @ai to find it, ask @ai to create a document.

**Files:** None (testing only)

**Acceptance Criteria:**
- [ ] File upload via paperclip creates `files` row and shows inline in chat
- [ ] Inspector files tab shows workspace files with download button
- [ ] `@ai find [filename]` returns file cards inline
- [ ] `@ai export action items from last 2 days` creates a markdown doc and shows inline
- [ ] Download button opens file in new tab
- [ ] No TypeScript errors, no Python syntax errors

**Verify:**
- `cd frontend && npx tsc --noEmit` passes
- `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); ast.parse(open('backend/worker.py').read()); ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('ALL OK')"`
- Manual testing of the flows above

**Steps:**

- [ ] **Step 1: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify Python syntax**

Run: `python3 -c "import ast; ast.parse(open('backend/app/routes.py').read()); ast.parse(open('backend/worker.py').read()); ast.parse(open('backend/loop_ai/orchestrator/orchestrator.py').read()); print('ALL OK')"`
Expected: `ALL OK`

- [ ] **Step 3: Verify no old references remain**

Run: `grep -r "thread_files\|ThreadFile\|fetchThreadFiles\|uploadThreadFile" frontend/src/ backend/`
Expected: No results (except possibly in migration file which is expected)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup for conversational file system"
```
