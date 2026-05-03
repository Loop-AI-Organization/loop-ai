from __future__ import annotations

import re
from typing import Dict, List, Optional

import httpx


def _get_member_profiles(workspace_id: str, supabase_url: str, service_role_key: str) -> List[Dict]:
    """
    Fetch workspace member display names and user_ids.
    Returns [{"user_id": str, "display_name": str}].
    """
    from app.supabase_client import supabase

    wm_res = (
        supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    user_ids = [m["user_id"] for m in (wm_res.data or []) if m.get("user_id")]
    if not user_ids:
        return []

    base = supabase_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
    }
    try:
        r = httpx.get(
            f"{base}/auth/v1/admin/users",
            headers=headers,
            params={"per_page": 1000},
            timeout=10.0,
        )
        r.raise_for_status()
        users = r.json().get("users") or []
    except Exception:
        return []

    profiles = []
    for u in users:
        uid = u.get("id")
        if uid not in user_ids:
            continue
        meta = u.get("user_metadata") or {}
        full_name = (meta.get("full_name") or "").strip()
        email = (u.get("email") or "").strip()
        display_name = full_name or (email.split("@")[0] if email else "")
        if display_name:
            profiles.append({"user_id": uid, "display_name": display_name, "email": email})

    return profiles


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _match_score(candidate: str, profile_name: str) -> int:
    """
    Return a match confidence score (0 = no match).
    Exact > first-name > last-name > substring.
    """
    c = _normalize(candidate)
    p = _normalize(profile_name)

    if c == p:
        return 100

    p_parts = p.split()
    if c == p_parts[0]:  # first name
        return 80
    if len(p_parts) > 1 and c == p_parts[-1]:  # last name
        return 70
    if c in p or p in c:  # substring
        return 50

    # initials: "jd" matches "john doe"
    initials = "".join(part[0] for part in p_parts)
    if c == initials:
        return 60

    return 0


def resolve_assignees(
    *,
    workspace_id: str,
    names: List[str],
    supabase_url: str,
    service_role_key: str,
) -> List[Dict[str, Optional[str]]]:
    """
    Match a list of extracted assignee name strings against workspace members.
    Returns [{"display_name": str, "user_id": str | None}].
    user_id is None when no confident match is found.
    """
    if not names:
        return []

    profiles = _get_member_profiles(workspace_id, supabase_url, service_role_key)

    results = []
    for name in names:
        best_score = 0
        best_user_id: Optional[str] = None
        best_display: str = name

        for profile in profiles:
            score = _match_score(name, profile["display_name"])
            if score > best_score:
                best_score = score
                best_user_id = profile["user_id"]
                best_display = profile["display_name"]

        # Only use the resolved display name if confidence is high enough
        if best_score >= 50:
            results.append({"display_name": best_display, "user_id": best_user_id})
        else:
            results.append({"display_name": name, "user_id": None})

    return results
