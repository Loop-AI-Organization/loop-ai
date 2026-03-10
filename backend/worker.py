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

    supabase.table("channels").update({
        "summary": summary,
        "summary_updated_at": "now()",
    }).eq("id", channel_id).execute()


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
