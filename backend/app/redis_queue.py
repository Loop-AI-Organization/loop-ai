import rq
from redis import Redis
from .config import get_settings

s = get_settings()
redis_conn = Redis.from_url(s.redis_url)
queue = rq.Queue("actions", connection=redis_conn)

def enqueue_action(thread_id: str, label: str):
    return queue.enqueue("worker.handle_action", {"thread_id", thread_id, "label": label})
