import rq
from redis import Redis
from app.config import get_settings

s = get_settings()
redis_conn = Redis.from_url(s.redis_url)
queue = rq.Queue("actions", connection=redis_conn)

def handle_action(payload: dict):
    # TODO: implement real action execution
    return {"ok": True, "payload": payload}

if __name__ == "__main__":
    worker = rq.Worker([queue], connection=redis_conn)
    worker.work(with_scheduler=True)
