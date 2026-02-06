from __future__ import annotations

import os
from dataclasses import dataclass


def _getenv(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if value is None:
        return None
    value = value.strip()
    return value if value else None


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str
    openrouter_model: str
    openrouter_max_tokens: int
    openrouter_temperature: float
    openrouter_app_url: str | None
    openrouter_app_title: str | None


def load_settings() -> Settings:
    api_key = _getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY")

    model = _getenv("OPENROUTER_MODEL") or "openai/gpt-4o-mini"

    max_tokens_raw = _getenv("OPENROUTER_MAX_TOKENS") or "1024"
    temperature_raw = _getenv("OPENROUTER_TEMPERATURE") or "0.7"

    try:
        max_tokens = int(max_tokens_raw)
    except ValueError as exc:
        raise RuntimeError("OPENROUTER_MAX_TOKENS must be an integer") from exc

    try:
        temperature = float(temperature_raw)
    except ValueError as exc:
        raise RuntimeError("OPENROUTER_TEMPERATURE must be a float") from exc

    return Settings(
        openrouter_api_key=api_key,
        openrouter_model=model,
        openrouter_max_tokens=max_tokens,
        openrouter_temperature=temperature,
        openrouter_app_url=_getenv("OPENROUTER_APP_URL"),
        openrouter_app_title=_getenv("OPENROUTER_APP_TITLE"),
    )
