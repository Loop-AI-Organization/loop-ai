from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Iterator, List, Optional

import httpx

from loop_ai.config import Settings


OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass(frozen=True)
class OpenRouterDelta:
    content: str


class OpenRouterError(RuntimeError):
    pass


def _iter_sse_lines(byte_iter: Iterable[bytes]) -> Iterator[str]:
    buffer = ""
    for chunk in byte_iter:
        if not chunk:
            continue
        buffer += chunk.decode("utf-8", errors="ignore")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            yield line.rstrip("\r")
    if buffer:
        yield buffer.rstrip("\r")


def _extract_delta(obj: Dict[str, Any]) -> Optional[str]:
    try:
        choice0 = obj["choices"][0]
    except Exception:
        return None

    delta = choice0.get("delta") or {}
    content = delta.get("content")
    if isinstance(content, str) and content:
        return content

    # Non-stream / fallback shape
    message = choice0.get("message") or {}
    content2 = message.get("content")
    if isinstance(content2, str) and content2:
        return content2

    return None


def stream_chat_completions(
    *,
    settings: Settings,
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
) -> Iterator[OpenRouterDelta]:
    """
    Streams OpenRouter chat completion deltas.

    `messages` should be OpenAI-compatible: [{"role": "user", "content": "..."}, ...]
    """

    headers: Dict[str, str] = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }

    if settings.openrouter_app_url:
        headers["HTTP-Referer"] = settings.openrouter_app_url
    if settings.openrouter_app_title:
        headers["X-Title"] = settings.openrouter_app_title

    payload: Dict[str, Any] = {
        "model": model or settings.openrouter_model,
        "stream": True,
        "max_tokens": settings.openrouter_max_tokens,
        "temperature": settings.openrouter_temperature,
        "messages": messages,
    }

    with httpx.Client(timeout=None) as client:
        with client.stream("POST", OPENROUTER_CHAT_COMPLETIONS_URL, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                # Best-effort read of body for debugging
                body = ""
                try:
                    body = resp.read().decode("utf-8", errors="ignore")
                except Exception:
                    body = ""
                raise OpenRouterError(
                    f"OpenRouter request failed ({resp.status_code} {resp.reason_phrase})"
                    + (f": {body}" if body else "")
                )

            for line in _iter_sse_lines(resp.iter_bytes()):
                line = line.strip()
                if not line.startswith("data:"):
                    continue

                data = line.removeprefix("data:").strip()
                if not data:
                    continue
                if data == "[DONE]":
                    break

                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue

                delta = _extract_delta(obj)
                if delta:
                    yield OpenRouterDelta(content=delta)


def chat_completion(
    *,
    settings: Settings,
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    max_tokens: int = 16,
    temperature: float = 0.0,
    timeout: Optional[float] = 30.0,
) -> str:
    """
    Non-streaming chat completion. Returns the full response text.
    Useful for lightweight calls like triage (YES/NO).
    """

    headers: Dict[str, str] = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }

    if settings.openrouter_app_url:
        headers["HTTP-Referer"] = settings.openrouter_app_url
    if settings.openrouter_app_title:
        headers["X-Title"] = settings.openrouter_app_title

    payload: Dict[str, Any] = {
        "model": model or settings.openrouter_model,
        "stream": False,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": messages,
    }

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(OPENROUTER_CHAT_COMPLETIONS_URL, headers=headers, json=payload)

    if resp.status_code >= 400:
        raise OpenRouterError(
            f"OpenRouter request failed ({resp.status_code} {resp.reason_phrase})"
            + (f": {resp.text}" if resp.text else "")
        )

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""
