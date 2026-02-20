from __future__ import annotations

from typing import Dict, Iterator, List

from loop_ai.config import load_settings
from loop_ai.llm.openrouter_client import stream_chat_completions


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
