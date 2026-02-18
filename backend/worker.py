import rq
from redis import Redis
from app.config import get_settings
from app.supabase_client import supabase

s = get_settings()
redis_conn = Redis.from_url(s.redis_url)
queue = rq.Queue("actions", connection=redis_conn)


def handle_action(payload: dict):
    thread_id = payload.get("thread_id")
    label = payload.get("label")
    action_id = payload.get("action_id")

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
