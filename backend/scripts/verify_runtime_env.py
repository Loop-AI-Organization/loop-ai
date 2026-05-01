#!/usr/bin/env python3
"""
Verify required runtime environment inside a running container.

Run examples:
  docker compose -f docker-compose.prod.yml exec api python scripts/verify_runtime_env.py
  docker compose -f docker-compose.prod.yml exec worker python scripts/verify_runtime_env.py
"""

from __future__ import annotations

import os
import sys


REQUIRED_KEYS = (
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENROUTER_API_KEY",
    "REDIS_URL",
)


def _masked(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def main() -> int:
    print("Runtime env verification")
    missing: list[str] = []
    for key in REQUIRED_KEYS:
        value = os.getenv(key, "").strip()
        if not value:
            missing.append(key)
            print(f" - {key}: MISSING")
            continue
        if key in {"OPENROUTER_API_KEY", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"}:
            print(f" - {key}: set ({_masked(value)})")
        else:
            print(f" - {key}: {value}")

    if missing:
        print("\nMissing required env keys:", ", ".join(missing), file=sys.stderr)
        return 1

    print("\nAll required env keys are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
