import rq
from redis import Redis
from app.config import get_settings
from app.supabase_client import supabase

s = get_settings()
redis_conn = Redis.from_url(s.redis_url)
queue = rq.Queue("actions", connection=redis_conn)


def _generate_channel_summary(channel_id: str) -> None:
    """
    Fetch the channel's recent messages, generate an AI summary, and save it back.
    Called as a background job after new messages arrive in a channel.
    """
    from loop_ai.orchestrator.orchestrator import generate_channel_summary

    # Get channel info
    ch_res = supabase.table("channels").select("id, name, workspace_id").eq("id", channel_id).single().execute()
    if not ch_res.data:
        return
    channel_name = ch_res.data.get("name", "unknown")

    # Fetch last 30 messages across threads in this channel
    threads_res = (
        supabase.table("threads")
        .select("id")
        .eq("channel_id", channel_id)
        .execute()
    )
    thread_ids = [t["id"] for t in (threads_res.data or [])]
    if not thread_ids:
        return

    msgs_res = (
        supabase.table("messages")
        .select("role, content, created_at")
        .in_("thread_id", thread_ids)
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    recent = list(reversed(msgs_res.data or []))
    if not recent:
        return

    summary = generate_channel_summary(
        channel_name=channel_name,
        recent_messages=[{"role": m["role"], "content": m["content"]} for m in recent],
    )

    from datetime import datetime, timezone
    supabase.table("channels").update({
        "summary": summary,
        "summary_updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", channel_id).execute()


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


def handle_action(payload: dict):
    thread_id = payload.get("thread_id")
    label = payload.get("label")
    action_id = payload.get("action_id")

    # Summary generation is a lightweight background task, not a tracked action
    if label == "generate_summary":
        try:
            _generate_channel_summary(thread_id)  # thread_id holds channel_id here
        except Exception:
            pass
        return {"ok": True, "label": "generate_summary"}

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

    if action_id:
        try:
            supabase.table("actions").update({"status": "running"}).eq("id", action_id).execute()
        except Exception:
            pass

    try:
        # TODO: implement real action execution
        result = {"ok": True, "payload": payload}
        if action_id:
            try:
                supabase.table("actions").update(
                    {"status": "completed", "result": result}
                ).eq("id", action_id).execute()
            except Exception:
                pass
        return result
    except Exception as e:
        if action_id:
            try:
                supabase.table("actions").update(
                    {"status": "failed", "error": str(e)}
                ).eq("id", action_id).execute()
            except Exception:
                pass
        raise


if __name__ == "__main__":
    worker = rq.Worker([queue], connection=redis_conn)
    worker.work(with_scheduler=True)
