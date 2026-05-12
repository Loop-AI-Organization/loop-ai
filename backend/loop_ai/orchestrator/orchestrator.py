from __future__ import annotations

import json
import logging
from typing import Dict, Iterator, List, Optional

from loop_ai.config import load_settings

logger = logging.getLogger(__name__)
from loop_ai.llm.openrouter_client import stream_chat_completions, chat_completion, OpenRouterDelta


TRIAGE_SYSTEM_PROMPT = (
    "You are a triage bot inside a group chat. Your ONLY job is to decide "
    "whether the AI assistant should respond to the latest message.\n\n"
    "Reply ONLY with the single word YES or NO.\n\n"
    "Say YES if the message:\n"
    "- Asks a question or requests help/information\n"
    "- Mentions the AI, bot, or assistant\n"
    "- Asks for code, debugging, explanations, or advice\n"
    "- Is clearly directed at the AI\n\n"
    "Say NO if the message:\n"
    "- Is casual chat between humans (greetings, jokes, banter)\n"
    "- Is a reaction or acknowledgement ('ok', 'thanks', 'lol', 'brb')\n"
    "- Is not directed at the AI and doesn't need a response\n"
)


def triage_message(*, messages: List[Dict[str, str]]) -> bool:
    """
    Use a lightweight model to decide if the AI should respond.
    Returns True if the AI should respond, False otherwise.
    """
    settings = load_settings()

    triage_messages = [
        {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
        *messages,
    ]

    response = chat_completion(
        settings=settings,
        messages=triage_messages,
        model=settings.openrouter_triage_model,
        max_tokens=8,
        temperature=0.0,
    )

    answer = response.strip().upper()
    return answer.startswith("YES")


def stream_assistant_reply(*, messages: List[Dict[str, str]]) -> Iterator[str]:
    """
    Minimal orchestrator stub.

    Later this is where you'll:
    - inject system policies
    - decide when to call tools/actions
    - load thread context from Supabase
    """

    settings = load_settings()
    for delta in stream_chat_completions(settings=settings, messages=messages):
        yield delta.content


_NAVIGATION_DETECT_PROMPT = """\
You are a navigation intent detector. Decide if the user wants to navigate to a different channel or workspace.

Reply ONLY with valid JSON: {"is_navigation": true/false, "query": "<search topic or null>"}

Navigation requests look like:
- "take me to the channel about X"
- "go to where we talked about X"
- "open the chat with Sarah"
- "find the channel for the research deadline stuff"
- "navigate to the bills workspace"

Extract the CORE search topic as "query" (e.g. "research deadlines", "bills", "API design").
If not a navigation request, return {"is_navigation": false, "query": null}.\
"""

_CHANNEL_MATCH_PROMPT = """\
You are a channel navigator. Given a search query and a list of channels/workspaces with summaries, pick the BEST match.

Reply ONLY with valid JSON:
{{"channel_id": "<id or null>", "workspace_id": "<id or null>", "channel_name": "<name or null>", "workspace_name": "<name or null>", "confidence": "high|medium|low", "reason": "<one sentence>"}}

Return null for all fields if nothing is a reasonable match.

Available channels:
{channels_json}\
"""


def detect_navigation_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """
    Use a fast model to decide if the user wants to navigate to a different channel.
    Returns {"is_navigation": bool, "query": str | None}.
    """
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _NAVIGATION_DETECT_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=64,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {"is_navigation": bool(result.get("is_navigation")), "query": result.get("query")}
    except Exception:
        return {"is_navigation": False, "query": None}


def find_best_channel(*, query: str, channels: List[Dict]) -> Dict:
    """
    Given a navigation query and a list of channel dicts
    (each with id, workspace_id, name, workspace_name, summary),
    return the best matching channel using LLM ranking.

    Returns {"channel_id", "workspace_id", "channel_name", "workspace_name", "confidence", "reason"}.
    """
    settings = load_settings()
    channels_json = json.dumps(channels, indent=2)
    prompt = _CHANNEL_MATCH_PROMPT.format(channels_json=channels_json)
    msgs = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Navigate to: {query}"},
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.0,
    )
    try:
        return json.loads(raw.strip())
    except Exception:
        return {
            "channel_id": None,
            "workspace_id": None,
            "channel_name": None,
            "workspace_name": None,
            "confidence": "low",
            "reason": "Could not parse navigation result",
        }


def generate_channel_summary(*, channel_name: str, recent_messages: List[Dict[str, str]]) -> str:
    """
    Generate a short summary of a channel from its recent messages.
    Used by the background worker to keep channel summaries fresh.
    """
    settings = load_settings()
    system = (
        "You are a channel summarizer. Given recent messages from a chat channel, "
        "write a 1-2 sentence summary of the channel's main topics and purpose. "
        "Be specific — include key topics, projects, names, or concepts discussed. "
        "Write in present tense. No preamble."
    )
    context = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in recent_messages[-30:]
    )
    msgs = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Channel: #{channel_name}\n\nRecent messages:\n{context}"},
    ]
    return chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.3,
    ).strip()


def generate_full_response(*, messages: List[Dict[str, str]]) -> str:
    """
    Generate a full (non-streaming) response using the high-quality response model (GPT-4o).
    Used for group chat auto-responses after triage passes.
    """
    settings = load_settings()

    system_msg = {
        "role": "system",
        "content": (
            "You are a helpful AI assistant in a group chat. "
            "Be concise, friendly, and helpful. "
            "Answer questions and provide assistance when asked."
        ),
    }

    response = chat_completion(
        settings=settings,
        messages=[system_msg, *messages],
        model=settings.openrouter_response_model,
        max_tokens=settings.openrouter_max_tokens,
        temperature=settings.openrouter_temperature,
        timeout=180.0,
    )

    return response


_FILE_INTENT_DETECT_PROMPT = """\
You are a file intent detector. Decide if the user wants to find files, create a document, export tasks, append content to an existing document, or create a new file from scratch.

IMPORTANT: Do NOT classify as a file intent if the user wants to extract action items or tasks as trackable to-do items (that is a task intent, not a file intent). Only classify as "create_document" when the user explicitly wants a written document, summary, or report — not when they want to track tasks.

Reply ONLY with valid JSON:
{
  "is_file_intent": true/false,
  "intent_type": "find_file" | "create_document" | "export_tasks" | "append_to_document" | "create_file" | "none",
  "query": "<search query for find_file, or null>",
  "doc_title": "<new document title or appended section title, or null>",
  "time_range_days": <number or null>,
  "instructions": "<what to extract or summarize, or null>",
  "target_file_query": "<name/description of the existing file to append to, or null>",
  "file_content": "<actual file content to store (for create_file only), or null>",
  "file_name": "<desired file name with extension (for create_file only), or null>"
}

Examples:
- "find my invoices" -> find_file, query="invoices"
- "where's the design doc?" -> find_file, query="design doc"
- "write up a summary of this week's discussions" -> create_document, doc_title="Weekly Summary", time_range_days=7
- "create a meeting notes document" -> create_document, doc_title="Meeting Notes"
- "export the open tasks to a doc" -> export_tasks, doc_title="Task List"
- "save the current tasks as a document" -> export_tasks, doc_title="Tasks"
- "add this week's action items to the project notes doc" -> append_to_document, target_file_query="project notes", doc_title="Action Items", time_range_days=7, instructions="extract action items"
- "append a task summary to the sprint doc" -> append_to_document, target_file_query="sprint", doc_title="Task Summary"
- "extract action items from last 2 days" -> NOT a file intent (is_file_intent=false) — this is a task intent
- "pull out the tasks from this week" -> NOT a file intent (is_file_intent=false) — this is a task intent
- "create a new file called test.py with def hello: pass" -> create_file, file_name="test.py", file_content="def hello:\\n    pass"
- "create a file README.md with the text Hello World" -> create_file, file_name="README.md", file_content="Hello World"
- "make a new file config.json" -> create_file, file_name="config.json"

If not a file intent, return {"is_file_intent": false, "intent_type": "none", "query": null, "doc_title": null, "time_range_days": null, "instructions": null, "target_file_query": null, "file_content": null, "file_name": null}.\
"""


def detect_file_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """Detect if the user wants to find files, create a document, export tasks, or append to a doc."""
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _FILE_INTENT_DETECT_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=150,
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
            "target_file_query": result.get("target_file_query"),
            "file_content": result.get("file_content"),
            "file_name": result.get("file_name"),
        }
    except Exception:
        return {
            "is_file_intent": False,
            "intent_type": "none",
            "query": None,
            "doc_title": None,
            "time_range_days": None,
            "instructions": None,
            "target_file_query": None,
            "file_content": None,
            "file_name": None,
        }


def search_files(
    *, workspace_id: str, query: str, content_type_filter: Optional[str] = None
) -> List[Dict]:
    """Search files by metadata (name, summary, tags, project_context)."""
    from app.supabase_client import supabase

    q = supabase.table("files").select("*").eq("workspace_id", workspace_id)

    if content_type_filter:
        q = q.ilike("content_type", f"%{content_type_filter}%")

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


_TASK_INTENT_DETECT_PROMPT = """\
You are a task intent detector. Decide if the user wants to create, update, list, or extract tasks.

IMPORTANT: "Extract tasks" means pulling action items out of conversation history and saving them as trackable to-do items — NOT creating a document. If the user says "export action items", "extract tasks", "pull out action items", "find the tasks from last week", etc., that is extract_tasks, not a document.

Reply ONLY with valid JSON:
{
  "is_task_intent": true/false,
  "intent_type": "create_task" | "update_task" | "list_tasks" | "extract_tasks" | "none",
  "title": "<task title or null>",
  "description": "<details or null>",
  "assignees": ["<name>", ...],
  "due_date": "<ISO date string or null>",
  "task_reference": "<partial task title to match for update, or null>",
  "updates": {"status": "<new status or null>", "assignees": ["<name>", ...]},
  "time_range_days": <number or null>
}

Valid statuses: proposed, open, in_progress, done, blocked

Examples:
- "add a task: design the landing page, assign to Sarah" -> create_task, title="Design the landing page", assignees=["Sarah"]
- "track this for Bob and Alice" -> create_task, assignees=["Bob", "Alice"]
- "mark the auth task as done" -> update_task, task_reference="auth", updates={"status": "done"}
- "assign the API work to Carlos" -> update_task, task_reference="API", updates={"assignees": ["Carlos"]}
- "what tasks are open?" -> list_tasks
- "show me all tasks" -> list_tasks
- "extract action items from the last 3 days" -> extract_tasks, time_range_days=3
- "pull out all tasks from this week" -> extract_tasks, time_range_days=7
- "export action items from last 2 days" -> extract_tasks, time_range_days=2
- "find the action items from yesterday" -> extract_tasks, time_range_days=1

If not a task intent, return {"is_task_intent": false, "intent_type": "none", ...all other fields null}.\
"""


_DOC_OR_TASK_AMBIGUITY_PROMPT = """\
You are an intent classifier. Given the user's latest message, decide if their intent is:
- "task": they clearly want to extract/create/track action items or tasks as to-do items
- "doc": they clearly want to create a written document, summary, or report
- "ambiguous": it could reasonably be either tasks OR a document (e.g. "save the action items", "capture the things we need to do")
- "other": neither tasks nor document

Reply ONLY with valid JSON: {"intent": "task" | "doc" | "ambiguous" | "other", "reason": "<one sentence>"}

Examples:
- "extract action items from last 2 days" -> task (clearly tracking tasks)
- "find what we need to do this sprint" -> task
- "create a meeting summary doc" -> doc (clearly a document)
- "write up what we discussed" -> doc
- "export the open tasks to a doc" -> doc (exporting existing tasks as a file)
- "save the action items somewhere" -> ambiguous
- "capture everything we need to do" -> ambiguous
- "what did we talk about today?" -> other\
"""


def detect_doc_or_task_ambiguity(*, messages: List[Dict[str, str]]) -> Dict:
    """
    Quick pre-check for doc-vs-task ambiguity.
    Returns {"intent": "task"|"doc"|"ambiguous"|"other", "reason": str}.
    Only called when the message looks like it's about content extraction/creation.
    """
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _DOC_OR_TASK_AMBIGUITY_PROMPT},
        *messages[-2:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=64,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {
            "intent": result.get("intent", "other"),
            "reason": result.get("reason", ""),
        }
    except Exception:
        return {"intent": "other", "reason": ""}


def detect_task_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """Detect if the user wants to create, update, list, or extract tasks."""
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _TASK_INTENT_DETECT_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=200,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {
            "is_task_intent": bool(result.get("is_task_intent")),
            "intent_type": result.get("intent_type", "none"),
            "title": result.get("title"),
            "description": result.get("description"),
            "assignees": result.get("assignees") or [],
            "due_date": result.get("due_date"),
            "task_reference": result.get("task_reference"),
            "updates": result.get("updates") or {},
            "time_range_days": result.get("time_range_days"),
        }
    except Exception:
        return {
            "is_task_intent": False,
            "intent_type": "none",
            "title": None,
            "description": None,
            "assignees": [],
            "due_date": None,
            "task_reference": None,
            "updates": {},
            "time_range_days": None,
        }


_TASK_EXTRACT_PROMPT = """\
You are a task extractor. Given recent chat messages, identify ALL action items, tasks, and commitments.

For each task found, output a JSON object. Reply ONLY with a JSON array:
[
  {
    "title": "<concise task title>",
    "description": "<context from the conversation or null>",
    "assignees": ["<name>", ...],
    "due_date": "<ISO date string or null>"
  },
  ...
]

Rules:
- Only include real tasks/commitments, not casual remarks
- Infer assignees from who volunteered ("I'll do X" → speaker) or was asked ("Bob, can you...?" → Bob)
- Keep titles short and action-oriented (verb + object)
- If no tasks found, return an empty array []\
"""


def extract_tasks_from_messages(
    *,
    channel_id: str,
    time_range_days: int = 7,
) -> List[Dict]:
    """
    Extract task candidates from recent channel messages.
    Returns a list of dicts with title, description, assignees, due_date.
    """
    from app.supabase_client import supabase
    from datetime import datetime, timezone, timedelta

    settings = load_settings()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=time_range_days)).isoformat()

    threads_res = supabase.table("threads").select("id").eq("channel_id", channel_id).execute()
    thread_ids = [t["id"] for t in (threads_res.data or [])]
    if not thread_ids:
        return []

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
        return []

    context_lines = []
    for m in messages:
        author = m.get("user_display_name") or m.get("role", "user")
        context_lines.append(f"[{author}]: {m.get('content', '')}")
    context = "\n".join(context_lines)

    raw = chat_completion(
        settings=settings,
        messages=[
            {"role": "system", "content": _TASK_EXTRACT_PROMPT},
            {"role": "user", "content": f"Channel messages:\n\n{context}"},
        ],
        model=settings.openrouter_response_model,
        max_tokens=1024,
        temperature=0.2,
    )
    try:
        return json.loads(raw.strip()) or []
    except Exception:
        return []


_TASK_NOVELTY_PROMPT = """\
You are a task deduplication classifier. Given a candidate task and a list of existing tasks, decide whether the candidate is new, a duplicate, or an update to an existing task.

Reply ONLY with valid JSON:
{{
  "kind": "new" | "duplicate" | "update",
  "task_id": "<id of matching existing task, or null>",
  "suggested_status": "<new status for matched task, or null>",
  "reason": "<one sentence>"
}}

Rules:
- "duplicate": candidate is essentially the same work as an existing task (same intent, same scope)
- "update": candidate describes progress on or a change to an existing task (e.g. "finished X", "X is blocked", "assign X to Y")
- "new": candidate is genuinely new work not covered by any existing task

Existing tasks:
{existing_json}

Candidate:
Title: {title}
Description: {description}\
"""


def classify_task_novelty(
    *,
    title: str,
    description: Optional[str],
    existing_tasks: List[Dict],
) -> Dict:
    """
    Classify a single candidate task as new / duplicate / update against existing tasks.
    Returns {kind, task_id, suggested_status, reason}.
    """
    if not existing_tasks:
        return {"kind": "new", "task_id": None, "suggested_status": None, "reason": "No existing tasks"}

    settings = load_settings()
    existing_json = json.dumps(
        [{"id": t["id"], "title": t["title"], "status": t.get("status", "open")} for t in existing_tasks],
        indent=2,
    )
    prompt = _TASK_NOVELTY_PROMPT.format(
        existing_json=existing_json,
        title=title,
        description=description or "(none)",
    )
    raw = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {
            "kind": result.get("kind", "new"),
            "task_id": result.get("task_id"),
            "suggested_status": result.get("suggested_status"),
            "reason": result.get("reason", ""),
        }
    except Exception:
        return {"kind": "new", "task_id": None, "suggested_status": None, "reason": ""}


_TASK_BATCH_NOVELTY_PROMPT = """\
You are a task deduplication classifier. Given a list of candidate tasks and a list of existing tasks, classify each candidate.

Reply ONLY with a JSON array (one entry per candidate, in the same order):
[
  {{
    "kind": "new" | "duplicate" | "update",
    "task_id": "<id of matching existing task, or null>",
    "suggested_status": "<new status for matched task, or null>",
    "reason": "<one sentence>"
  }},
  ...
]

Rules:
- "duplicate": candidate is essentially the same work as an existing task
- "update": candidate describes progress on or a change to an existing task
- "new": genuinely new work not covered by any existing task

Existing tasks:
{existing_json}

Candidates:
{candidates_json}\
"""


def classify_tasks_batch(
    *,
    candidates: List[Dict],
    existing_tasks: List[Dict],
) -> List[Dict]:
    """
    Classify a batch of candidate tasks (each with title/description) against existing tasks.
    Returns a list of {kind, task_id, suggested_status, reason} in the same order as candidates.
    Falls back to "new" for any entry that can't be parsed.
    """
    default = {"kind": "new", "task_id": None, "suggested_status": None, "reason": ""}

    if not existing_tasks:
        return [default.copy() for _ in candidates]

    settings = load_settings()
    existing_json = json.dumps(
        [{"id": t["id"], "title": t["title"], "status": t.get("status", "open")} for t in existing_tasks],
        indent=2,
    )
    candidates_json = json.dumps(
        [{"title": c.get("title", ""), "description": c.get("description") or "(none)"} for c in candidates],
        indent=2,
    )
    prompt = _TASK_BATCH_NOVELTY_PROMPT.format(
        existing_json=existing_json,
        candidates_json=candidates_json,
    )
    raw = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        model=settings.openrouter_triage_model,
        max_tokens=512,
        temperature=0.0,
    )
    try:
        results = json.loads(raw.strip())
        if not isinstance(results, list):
            return [default.copy() for _ in candidates]
        out = []
        for i, r in enumerate(results):
            if i >= len(candidates):
                break
            out.append({
                "kind": r.get("kind", "new"),
                "task_id": r.get("task_id"),
                "suggested_status": r.get("suggested_status"),
                "reason": r.get("reason", ""),
            })
        # Pad if LLM returned fewer entries than candidates
        while len(out) < len(candidates):
            out.append(default.copy())
        return out
    except Exception:
        return [default.copy() for _ in candidates]


_TASK_MATCH_PROMPT = """\
Given a search reference and a list of open tasks, return the ID of the best matching task.
Reply ONLY with valid JSON: {{"task_id": "<id or null>"}}

Reference: {reference}

Tasks:
{tasks_json}\
"""


def find_matching_task(*, reference: str, tasks: List[Dict]) -> Optional[str]:
    """Find the task ID that best matches a text reference. Returns None if no good match."""
    if not tasks:
        return None
    settings = load_settings()
    tasks_json = json.dumps(
        [{"id": t["id"], "title": t["title"], "status": t["status"]} for t in tasks],
        indent=2,
    )
    prompt = _TASK_MATCH_PROMPT.format(reference=reference, tasks_json=tasks_json)
    raw = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        model=settings.openrouter_triage_model,
        max_tokens=64,
        temperature=0.0,
    )
    try:
        return json.loads(raw.strip()).get("task_id")
    except Exception:
        return None


_TASK_EXPORT_STATUS_ORDER = ["open", "in_progress", "blocked", "done"]
_TASK_EXPORT_STATUS_LABELS = {
    "open": "Open",
    "in_progress": "In Progress",
    "blocked": "Blocked",
    "done": "Done",
}


def _extract_file_text(bytes_data: bytes, *, content_type: Optional[str], file_name: str) -> str:
    """Extract text from supported file bytes; PDF uses pypdf when installed."""
    is_pdf = (content_type or "").lower() == "application/pdf" or file_name.lower().endswith(".pdf")
    fallback = bytes_data.decode("utf-8", errors="ignore")
    if not is_pdf:
        return fallback

    try:
        from io import BytesIO
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(BytesIO(bytes_data))
        pages = [page.extract_text() or "" for page in reader.pages]
        extracted = "\n\n".join(page for page in pages if page.strip()).strip()
        return extracted or fallback
    except Exception:
        return fallback


def query_files(
    *,
    file_ids: List[str],
    question: str,
) -> Dict:
    """
    Answer a natural language question about selected files.
    Downloads file content from Supabase storage and uses LLM to answer.

    Returns {"answer": str, "files": [{"id": str, "name": str}], "error": str or None}.
    """
    from app.supabase_client import supabase

    if not file_ids:
        return {"answer": "", "files": [], "error": "No files selected"}

    if not question.strip():
        return {"answer": "", "files": [], "error": "No question provided"}

    settings = load_settings()

    # Fetch file records
    file_res = supabase.table("files").select("id, file_name, storage_path, content_type").in_("id", file_ids).execute()
    file_rows = file_res.data or []
    if not file_rows:
        return {"answer": "", "files": [], "error": "Files not found"}

    bucket = "workspace-files"
    file_contents: List[Dict] = []

    for f in file_rows:
        storage_path = f.get("storage_path")
        if not storage_path:
            continue
        try:
            bytes_data = supabase.storage.from_(bucket).download(storage_path)
            text = _extract_file_text(
                bytes_data,
                content_type=f.get("content_type"),
                file_name=f.get("file_name", "unknown"),
            )
            # Truncate very long files to avoid token limits
            max_chars = 50000
            if len(text) > max_chars:
                text = text[:max_chars] + f"\n\n[... File truncated at {max_chars} characters ...]"
            file_contents.append({
                "id": f["id"],
                "name": f.get("file_name", "unknown"),
                "content": text,
            })
        except Exception as exc:
            logger.warning("query_files: failed to read file id=%s path=%s error=%s", f["id"], storage_path, exc)
            # If we can't read a file, skip it but continue
            file_contents.append({
                "id": f["id"],
                "name": f.get("file_name", "unknown"),
                "content": "",
            })

    if not file_contents or not any(f["content"] for f in file_contents):
        return {"answer": "", "files": [{"id": f["id"], "name": f.get("file_name", "unknown")} for f in file_rows], "error": "Could not read any file contents"}

    # Build context from file contents
    context_parts = []
    for f in file_contents:
        context_parts.append(f"--- File: {f['name']} ---\n{f['content']}")
    context = "\n\n".join(context_parts)

    prompt = (
        "You are a helpful assistant answering questions about provided documents.\n\n"
        "Answer the user's question based ONLY on the document content provided below.\n"
        "If the answer is not in the documents, say so clearly.\n"
        "Be specific and cite which file(s) contain the relevant information.\n\n"
        f"Question: {question}\n\n"
        f"Document(s):\n{context}\n\n"
        "Answer:"
    )

    answer = chat_completion(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        model=settings.openrouter_response_model,
        max_tokens=2048,
        temperature=0.3,
        timeout=120.0,
    ).strip()

    files_summary = [{"id": f["id"], "name": f.get("file_name", "unknown")} for f in file_rows]

    return {"answer": answer, "files": files_summary, "error": None}


def query_files_stream(
    *,
    file_ids: List[str],
    question: str,
) -> Iterator[OpenRouterDelta]:
    """
    Streaming version of query_files. Yields content deltas.
    """
    from app.supabase_client import supabase

    if not file_ids or not question.strip():
        return

    settings = load_settings()

    file_res = supabase.table("files").select("id, file_name, storage_path").in_("id", file_ids).execute()
    file_rows = file_res.data or []
    if not file_rows:
        return

    bucket = "workspace-files"
    file_contents: List[Dict] = []

    for f in file_rows:
        storage_path = f.get("storage_path")
        if not storage_path:
            continue
        try:
            bytes_data = supabase.storage.from_(bucket).download(storage_path)
            text = _extract_file_text(
                bytes_data,
                content_type=f.get("content_type"),
                file_name=f.get("file_name", "unknown"),
            )
            max_chars = 50000
            if len(text) > max_chars:
                text = text[:max_chars] + f"\n\n[... File truncated at {max_chars} characters ...]"
            file_contents.append({"id": f["id"], "name": f.get("file_name", "unknown"), "content": text})
        except Exception as exc:
            logger.warning("query_files_stream: failed to read file id=%s path=%s error=%s", f["id"], storage_path, exc)
            file_contents.append({"id": f["id"], "name": f.get("file_name", "unknown"), "content": ""})

    if not file_contents or not any(f["content"] for f in file_contents):
        return

    context_parts = []
    for f in file_contents:
        context_parts.append(f"--- File: {f['name']} ---\n{f['content']}")
    context = "\n\n".join(context_parts)

    prompt = (
        "You are a helpful assistant answering questions about provided documents.\n\n"
        "Answer the user's question based ONLY on the document content provided below.\n"
        "If the answer is not in the documents, say so clearly.\n"
        "Be specific and cite which file(s) contain the relevant information.\n\n"
        f"Question: {question}\n\n"
        f"Document(s):\n{context}\n\n"
        "Answer:"
    )

    for delta in stream_chat_completions(
        settings=settings,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2048,
    ):
        yield delta


_FILE_QUERY_PROMPT = """\
You are a file query intent detector. Decide if the user is asking a question ABOUT files they have selected.

Reply ONLY with valid JSON:
{{"is_query_intent": true/false, "query": "<the actual question they are asking, or null>"}}

Examples:
- "what's in this file?" -> is_query_intent=true, query="what's in this file?"
- "summarize these docs" -> is_query_intent=true, query="summarize these docs"
- "find the design doc" -> is_query_intent=false (that's a find intent, not a query)
- "create a summary doc" -> is_query_intent=false (that's a create intent)
- "tell me about the budget numbers" -> is_query_intent=true, query="tell me about the budget numbers"
- "what does the API spec say about auth?" -> is_query_intent=true, query="what does the API spec say about auth?"

If not asking about the content of selected files, return {{"is_query_intent": false, "query": null}}.\
"""


def detect_file_query_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """
    Detect if the user is asking a question about selected files.
    Returns {"is_query_intent": bool, "query": str | None}.
    """
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _FILE_QUERY_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=80,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {
            "is_query_intent": bool(result.get("is_query_intent")),
            "query": result.get("query"),
        }
    except Exception:
        return {"is_query_intent": False, "query": None}


def _format_task_due_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return str(value)[:10]


def _format_task_single_line(value: object) -> str:
    return " ".join(str(value or "").split())


def _format_task_assignees(task: Dict) -> List[str]:
    names: List[str] = []
    for assignee in task.get("task_assignees") or []:
        name = _format_task_single_line(assignee.get("display_name"))
        if name:
            names.append(name)
    return names


def format_task_export_markdown(*, title: str, tasks: List[Dict]) -> str:
    confirmed = [
        task for task in tasks
        if task.get("status") in _TASK_EXPORT_STATUS_ORDER
    ]
    if not confirmed:
        return ""

    lines = [f"# {title.strip() or 'Task List'}"]
    for status in _TASK_EXPORT_STATUS_ORDER:
        group = [task for task in confirmed if task.get("status") == status]
        if not group:
            continue
        lines.extend(["", f"## {_TASK_EXPORT_STATUS_LABELS[status]}", ""])
        for task in group:
            checkbox = "x" if status == "done" else " "
            metadata: List[str] = []
            assignees = _format_task_assignees(task)
            if assignees:
                metadata.append(f"Assignees: {', '.join(assignees)}")
            due_date = _format_task_due_date(task.get("due_date"))
            if due_date:
                metadata.append(f"Due: {due_date}")
            suffix = f" ({'; '.join(metadata)})" if metadata else ""
            title_text = _format_task_single_line(task.get("title")) or "Untitled task"
            lines.append(f"- [{checkbox}] {title_text}{suffix}")
            description_lines = [
                line.strip()
                for line in str(task.get("description") or "").splitlines()
                if line.strip()
            ]
            for description in description_lines:
                lines.append(f"  - {description}")

    return "\n".join(lines).strip() + "\n"


def export_tasks_as_document(
    *,
    channel_id: str,
    workspace_id: str,
    title: str,
    created_by: str,
) -> Optional[Dict]:
    """
    Export confirmed channel tasks as a markdown document.
    Uploads to storage and inserts a files row. Returns the file record or None.
    """
    from app.supabase_client import supabase
    import uuid as _uuid

    tasks_res = (
        supabase.table("tasks")
        .select("*, task_assignees(display_name)")
        .eq("channel_id", channel_id)
        .neq("status", "proposed")
        .order("created_at", desc=False)
        .execute()
    )
    tasks = tasks_res.data or []
    if not tasks:
        return None

    doc_content = format_task_export_markdown(title=title, tasks=tasks)
    if not doc_content:
        return None

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

    row = {
        "workspace_id": workspace_id,
        "source": "generated",
        "storage_path": storage_path,
        "file_name": file_name,
        "file_size": len(doc_content.encode("utf-8")),
        "content_type": "text/markdown",
        "created_by": created_by,
        "metadata_status": "ready",
        "summary": f"Task export: {len(tasks)} task(s)",
        "tags": ["tasks", "export"],
        "project_context": f"Exported from channel tasks",
        "source_channel_id": channel_id,
    }
    result = supabase.table("files").insert(row).execute()
    return result.data[0] if result.data else None


def append_to_document_file(
    *,
    file_id: str,
    workspace_id: str,
    section_title: str,
    section_content: str,
) -> Optional[Dict]:
    """
    Download an existing markdown file from storage, append a new section, re-upload,
    and update the files row. Returns the updated file record or None on failure.
    """
    from app.supabase_client import supabase

    file_res = supabase.table("files").select("*").eq("id", file_id).single().execute()
    if not file_res.data:
        return None
    file_row = file_res.data
    storage_path = file_row["storage_path"]
    bucket = "workspace-files"

    try:
        existing_bytes = supabase.storage.from_(bucket).download(storage_path)
        existing_content = existing_bytes.decode("utf-8")
    except Exception:
        return None

    separator = "\n\n---\n\n"
    new_section = f"## {section_title}\n\n{section_content}"
    updated_content = existing_content.rstrip() + separator + new_section

    try:
        supabase.storage.from_(bucket).update(
            storage_path,
            updated_content.encode("utf-8"),
            {"content-type": "text/markdown"},
        )
    except Exception:
        return None

    updated_row = supabase.table("files").update({
        "file_size": len(updated_content.encode("utf-8")),
        "metadata_status": "ready",
    }).eq("id", file_id).execute()

    return updated_row.data[0] if updated_row.data else file_row


def _guess_content_type(file_name: str) -> str:
    """Guess content type from file extension."""
    ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""
    mapping = {
        "md": "text/markdown",
        "markdown": "text/markdown",
        "json": "application/json",
        "xml": "application/xml",
        "csv": "text/csv",
        "ts": "application/typescript",
        "js": "application/javascript",
        "jsx": "application/javascript",
        "tsx": "application/typescript",
        "py": "text/x-python",
        "css": "text/css",
        "html": "text/html",
        "yaml": "text/yaml",
        "yml": "text/yaml",
        "toml": "application/toml",
        "ini": "text/ini",
        "sh": "application/x-sh",
        "bash": "application/x-sh",
        "sql": "text/sql",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "pdf": "application/pdf",
        "zip": "application/zip",
        "tar": "application/x-tar",
        "gz": "application/gzip",
        "txt": "text/plain",
    }
    return mapping.get(ext, "text/plain")


def create_file_from_content(
    *,
    workspace_id: str,
    file_name: str,
    file_content: str,
    created_by: str,
    source_channel_id: Optional[str] = None,
) -> Optional[Dict]:
    """
    Store a raw file (text or code) directly in Supabase storage and create a files row.
    Returns the file record dict or None on failure.
    """
    from app.supabase_client import supabase
    import uuid as _uuid

    bucket = "workspace-files"
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in file_name).strip()
    storage_path = f"{workspace_id}/files/{_uuid.uuid4()}-{safe_name}"
    content_type = _guess_content_type(safe_name)

    try:
        supabase.storage.from_(bucket).upload(
            storage_path,
            file_content.encode("utf-8"),
            {"content-type": content_type},
        )
    except Exception:
        return None

    row = {
        "workspace_id": workspace_id,
        "source": "generated",
        "storage_path": storage_path,
        "file_name": safe_name,
        "file_size": len(file_content.encode("utf-8")),
        "content_type": content_type,
        "created_by": created_by,
        "metadata_status": "ready",
        "summary": f"Created file: {safe_name}",
        "tags": ["created"],
        "project_context": "Created via prompt",
        "source_channel_id": source_channel_id,
    }
    result = supabase.table("files").insert(row).execute()
    return result.data[0] if result.data else None


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

    # Generate summary and tags inline
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
