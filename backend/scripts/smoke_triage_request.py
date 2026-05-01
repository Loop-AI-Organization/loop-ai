#!/usr/bin/env python3
"""
Smoke-test the production triage endpoint from any machine with network access.

Required environment:
  API_URL=https://api.loopai-project.me
  ACCESS_TOKEN=<Supabase JWT for a real user>
  CHANNEL_ID=<channel UUID visible to that user>

Optional:
  TRIAGE_MESSAGE="@ai say hello"
"""

from __future__ import annotations

import json
import os
import sys
from urllib import request
from urllib.error import HTTPError, URLError


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def main() -> int:
    try:
        api_url = _required("API_URL").rstrip("/")
        access_token = _required("ACCESS_TOKEN")
        channel_id = _required("CHANNEL_ID")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    message = os.getenv("TRIAGE_MESSAGE", "@ai say hello").strip() or "@ai say hello"
    payload = {
        "channel_id": channel_id,
        "messages": [{"role": "user", "content": message}],
    }
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{api_url}/api/channels/{channel_id}/triage",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            print("status=", resp.status)
            print("body=", raw)
            return 0
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {raw}", file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"Network error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
