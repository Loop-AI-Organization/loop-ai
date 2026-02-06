from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from flask_sock import Sock

from loop_ai.orchestrator.orchestrator import stream_assistant_reply


def _safe_json_loads(raw: str) -> Optional[Dict[str, Any]]:
    try:
        obj = json.loads(raw)
    except Exception:
        return None
    return obj if isinstance(obj, dict) else None


def _coerce_messages(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Accept either:
    - { messages: [{role, content}, ...] }
    - { content: \"...\" } (fallback: single user message)
    """

    messages = payload.get("messages")
    if isinstance(messages, list):
        out: List[Dict[str, str]] = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if isinstance(role, str) and isinstance(content, str) and role and content:
                out.append({"role": role, "content": content})
        if out:
            return out

    content = payload.get("content")
    if isinstance(content, str) and content.strip():
        return [{"role": "user", "content": content.strip()}]

    return []


def register_ws(sock: Sock) -> None:
    @sock.route("/ws")
    def ws_handler(ws):
        while True:
            raw = ws.receive()
            if raw is None:
                break

            payload = _safe_json_loads(raw) if isinstance(raw, str) else None
            if not payload:
                ws.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = payload.get("type")
            thread_id = payload.get("threadId")
            if not isinstance(thread_id, str) or not thread_id:
                thread_id = "unknown"

            if msg_type != "user_message":
                ws.send(json.dumps({"type": "error", "threadId": thread_id, "message": f"Unknown type: {msg_type}"}))
                continue

            messages = _coerce_messages(payload)
            if not messages:
                ws.send(json.dumps({"type": "error", "threadId": thread_id, "message": "Missing messages/content"}))
                continue

            try:
                for delta in stream_assistant_reply(messages=messages):
                    ws.send(json.dumps({"type": "token", "threadId": thread_id, "delta": delta}))
                ws.send(json.dumps({"type": "done", "threadId": thread_id}))
            except Exception as exc:
                ws.send(json.dumps({"type": "error", "threadId": thread_id, "message": str(exc)}))
