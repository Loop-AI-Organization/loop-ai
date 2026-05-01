#!/usr/bin/env python3
"""
Verify the API can reach Redis and enqueue an RQ job (same path as POST /api/actions).

Run inside the backend container from /app (default WORKDIR):

  docker compose -f docker-compose.prod.yml exec api python scripts/smoke_rq_enqueue.py

You should see LPUSH / RQ traffic in `redis-cli monitor` while this runs.
The worker may log a harmless completion for label __smoke_label__ (no DB row required).
"""

from __future__ import annotations

import os
import sys


def main() -> int:
    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    if "REDIS_URL" not in os.environ:
        print("REDIS_URL is not set in the environment.", file=sys.stderr)
        return 1
    print("REDIS_URL=", os.environ.get("REDIS_URL", ""))

    from app.redis_queue import enqueue_action, queue

    job = enqueue_action("__smoke_thread__", "__smoke_label__", action_id=None)
    print("enqueue OK job_id=", job.id)
    print("queue name=", queue.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
