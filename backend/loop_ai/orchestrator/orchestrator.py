from __future__ import annotations

from typing import Dict, Iterator, List

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
