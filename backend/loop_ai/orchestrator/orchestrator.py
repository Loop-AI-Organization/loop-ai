from __future__ import annotations

import json
from typing import Dict, Iterator, List, Optional

from loop_ai.config import load_settings
from loop_ai.llm.openrouter_client import stream_chat_completions, chat_completion


TRIAGE_SYSTEM_PROMPT = (
    "You are a triage bot inside a group chat. Your ONLY job is to decide "
    "whether the AI assistant should respond to the latest message.\n\n"
    "Reply ONLY with the single word YES or NO.\n\n"
    "Say YES if the message:\n"
    "- Asks a question or requests help/information\n"
    "- Mentions the AI, bot, or assistant\n"
    "- Asks for code, debugging, explanations, or advice\n"
    "- Is clearly directed at the AI\n\n"
    "Say NO if the message:\n"
    "- Is casual chat between humans (greetings, jokes, banter)\n"
    "- Is a reaction or acknowledgement ('ok', 'thanks', 'lol', 'brb')\n"
    "- Is not directed at the AI and doesn't need a response\n"
)


def triage_message(*, messages: List[Dict[str, str]]) -> bool:
    """
    Use a lightweight model to decide if the AI should respond.
    Returns True if the AI should respond, False otherwise.
    """
    settings = load_settings()

    triage_messages = [
        {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
        *messages,
    ]

    response = chat_completion(
        settings=settings,
        messages=triage_messages,
        model=settings.openrouter_triage_model,
        max_tokens=8,
        temperature=0.0,
    )

    answer = response.strip().upper()
    return answer.startswith("YES")


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


_NAVIGATION_DETECT_PROMPT = """\
You are a navigation intent detector. Decide if the user wants to navigate to a different channel or workspace.

Reply ONLY with valid JSON: {"is_navigation": true/false, "query": "<search topic or null>"}

Navigation requests look like:
- "take me to the channel about X"
- "go to where we talked about X"
- "open the chat with Sarah"
- "find the channel for the research deadline stuff"
- "navigate to the bills workspace"

Extract the CORE search topic as "query" (e.g. "research deadlines", "bills", "API design").
If not a navigation request, return {"is_navigation": false, "query": null}.\
"""

_CHANNEL_MATCH_PROMPT = """\
You are a channel navigator. Given a search query and a list of channels/workspaces with summaries, pick the BEST match.

Reply ONLY with valid JSON:
{{"channel_id": "<id or null>", "workspace_id": "<id or null>", "channel_name": "<name or null>", "workspace_name": "<name or null>", "confidence": "high|medium|low", "reason": "<one sentence>"}}

Return null for all fields if nothing is a reasonable match.

Available channels:
{channels_json}\
"""


def detect_navigation_intent(*, messages: List[Dict[str, str]]) -> Dict:
    """
    Use a fast model to decide if the user wants to navigate to a different channel.
    Returns {"is_navigation": bool, "query": str | None}.
    """
    settings = load_settings()
    msgs = [
        {"role": "system", "content": _NAVIGATION_DETECT_PROMPT},
        *messages[-3:],
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=64,
        temperature=0.0,
    )
    try:
        result = json.loads(raw.strip())
        return {"is_navigation": bool(result.get("is_navigation")), "query": result.get("query")}
    except Exception:
        return {"is_navigation": False, "query": None}


def find_best_channel(*, query: str, channels: List[Dict]) -> Dict:
    """
    Given a navigation query and a list of channel dicts
    (each with id, workspace_id, name, workspace_name, summary),
    return the best matching channel using LLM ranking.

    Returns {"channel_id", "workspace_id", "channel_name", "workspace_name", "confidence", "reason"}.
    """
    settings = load_settings()
    channels_json = json.dumps(channels, indent=2)
    prompt = _CHANNEL_MATCH_PROMPT.format(channels_json=channels_json)
    msgs = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Navigate to: {query}"},
    ]
    raw = chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.0,
    )
    try:
        return json.loads(raw.strip())
    except Exception:
        return {
            "channel_id": None,
            "workspace_id": None,
            "channel_name": None,
            "workspace_name": None,
            "confidence": "low",
            "reason": "Could not parse navigation result",
        }


def generate_channel_summary(*, channel_name: str, recent_messages: List[Dict[str, str]]) -> str:
    """
    Generate a short summary of a channel from its recent messages.
    Used by the background worker to keep channel summaries fresh.
    """
    settings = load_settings()
    system = (
        "You are a channel summarizer. Given recent messages from a chat channel, "
        "write a 1-2 sentence summary of the channel's main topics and purpose. "
        "Be specific — include key topics, projects, names, or concepts discussed. "
        "Write in present tense. No preamble."
    )
    context = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in recent_messages[-30:]
    )
    msgs = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Channel: #{channel_name}\n\nRecent messages:\n{context}"},
    ]
    return chat_completion(
        settings=settings,
        messages=msgs,
        model=settings.openrouter_triage_model,
        max_tokens=128,
        temperature=0.3,
    ).strip()


def generate_full_response(*, messages: List[Dict[str, str]]) -> str:
    """
    Generate a full (non-streaming) response using the high-quality response model (GPT-4o).
    Used for group chat auto-responses after triage passes.
    """
    settings = load_settings()

    system_msg = {
        "role": "system",
        "content": (
            "You are a helpful AI assistant in a group chat. "
            "Be concise, friendly, and helpful. "
            "Answer questions and provide assistance when asked."
        ),
    }

    response = chat_completion(
        settings=settings,
        messages=[system_msg, *messages],
        model=settings.openrouter_response_model,
        max_tokens=settings.openrouter_max_tokens,
        temperature=settings.openrouter_temperature,
    )

    return response
