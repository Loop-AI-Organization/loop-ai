from __future__ import annotations

import json
from typing import Dict, Iterator, List, Optional

from loop_ai.config import load_settings
from loop_ai.llm.openrouter_client import stream_chat_completions, chat_completion


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
        return {
            "is_file_intent": False,
            "intent_type": "none",
            "query": None,
            "doc_title": None,
            "time_range_days": None,
            "instructions": None,
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
