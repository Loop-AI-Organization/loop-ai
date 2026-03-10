import rq
from redis import Redis
from typing import Optional
from .config import get_settings

s = get_settings()
redis_conn = Redis.from_url(s.redis_url)
queue = rq.Queue("actions", connection=redis_conn)

def enqueue_action(thread_id: str, label: str, action_id: Optional[str] = None):
    payload = {"thread_id": thread_id, "label": label}
    if action_id is not None:
        payload["action_id"] = action_id
    return queue.enqueue("worker.handle_action", payload)
