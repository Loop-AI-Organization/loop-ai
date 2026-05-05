from typing import Annotated, Dict, Optional, List
import asyncio
import json
import logging
import random
import string
import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from .config import get_settings
from .supabase_client import supabase
from .redis_queue import enqueue_action
from .auth import get_current_user
from loop_ai.orchestrator.orchestrator import (
    stream_assistant_reply,
    triage_message,
    generate_full_response,
    detect_navigation_intent,
    find_best_channel,
    generate_channel_summary,
    detect_file_intent,
    search_files,
    generate_document,
    detect_task_intent,
    extract_tasks_from_messages,
    find_matching_task,
    classify_task_novelty,
    classify_tasks_batch,
    export_tasks_as_document,
    append_to_document_file,
    detect_doc_or_task_ambiguity,
)
from loop_ai.tasks.assignee_resolver import resolve_assignees

router = APIRouter()
logger = logging.getLogger(__name__)


class InviteMemberRequest(BaseModel):
    email: str


class WorkspaceShareCodeResponse(BaseModel):
    workspace_id: str
    share_code: str


class JoinByCodeRequest(BaseModel):
    code: str


class WorkspaceMemberProfile(BaseModel):
    id: str
    user_id: str
    role: str
    email: str
    display_name: str


class RemoveMemberRequest(BaseModel):
    member_id: str


class FileUploadRequest(BaseModel):
    workspace_id: str
    channel_id: Optional[str] = None
    file_name: str
    content_type: str = "application/octet-stream"
    file_size: int = 0


class CreateDmRequest(BaseModel):
    other_user_id: str


class ChannelSettingsRequest(BaseModel):
    is_llm_restricted: Optional[bool] = None
    llm_participation_enabled: Optional[bool] = None


@router.get("/health")
async def health():
    return {"ok": True}


@router.post("/api/files/upload")
async def upload_file(
    body: FileUploadRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Create a files row and return a signed upload URL."""
    import uuid as _uuid

    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    ws = (
        supabase.table("workspaces")
        .select("id, user_id")
        .eq("id", body.workspace_id)
        .execute()
    )
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")
    owner_id = ws.data[0].get("user_id")
    if owner_id != uid:
        members = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", body.workspace_id)
            .eq("user_id", uid)
            .execute()
        )
        if not members.data:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in body.file_name)
    storage_path = f"{body.workspace_id}/uploads/{_uuid.uuid4()}-{safe_name}"

    row = {
        "workspace_id": body.workspace_id,
        "source": "upload",
        "storage_path": storage_path,
        "file_name": body.file_name,
        "file_size": body.file_size,
        "content_type": body.content_type,
        "created_by": uid,
        "metadata_status": "pending",
        "source_channel_id": body.channel_id,
    }
    result = supabase.table("files").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create file record")
    file_id = result.data[0]["id"]

    bucket = "workspace-files"
    try:
        data = supabase.storage.from_(bucket).create_signed_upload_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage error: {e!s}")

    signed_url = data.get("signed_url") or data.get("signedUrl") or data.get("url")
    if not signed_url:
        raise HTTPException(status_code=500, detail="Failed to create signed URL")

    try:
        enqueue_action(str(file_id), "enrich_file_metadata", action_id=None)
    except Exception:
        pass

    return {"file_id": file_id, "signed_upload_url": signed_url}


@router.get("/api/files/{file_id}/download")
async def download_file(
    file_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Return a signed download URL for a file."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    file_res = (
        supabase.table("files")
        .select("id, workspace_id, storage_path")
        .eq("id", file_id)
        .execute()
    )
    if not file_res.data:
        raise HTTPException(status_code=404, detail="File not found")
    file_row = file_res.data[0]

    workspace_id = file_row["workspace_id"]
    ws = supabase.table("workspaces").select("id, user_id").eq("id", workspace_id).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.data[0]["user_id"] != uid:
        members = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", uid)
            .execute()
        )
        if not members.data:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    bucket = "workspace-files"
    try:
        data = supabase.storage.from_(bucket).create_signed_url(
            file_row["storage_path"], expires_in=300
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Storage error: {e!s}")

    url = data.get("signedURL") or data.get("signed_url") or data.get("signedUrl")
    if not url:
        raise HTTPException(status_code=500, detail="Failed to create download URL")

    return {"url": url}


class LogEventRequest(BaseModel):
    event_type: str = "sign_in"


def _generate_share_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def _create_unique_share_code() -> str:
    # Try a few times to avoid extremely unlikely collisions
    for _ in range(10):
        code = _generate_share_code()
        res = supabase.table("workspaces").select("id").eq("share_code", code).execute()
        if not res.data:
            return code
    raise HTTPException(status_code=500, detail="Failed to generate unique workspace share code")


def _user_can_access_workspace(workspace_id: str, user_id: str) -> bool:
    ws = (
        supabase.table("workspaces")
        .select("id, user_id")
        .eq("id", workspace_id)
        .limit(1)
        .execute()
    )
    if ws.data and ws.data[0].get("user_id") == user_id:
        return True
    member = (
        supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(member.data)


def _dm_pair_key(user_a: str, user_b: str) -> str:
    return ":".join(sorted([user_a, user_b]))


def _select_channel_by_id(channel_id: str) -> Optional[dict]:
    res = (
        supabase.table("channels")
        .select(
            "id, workspace_id, name, type, created_at, summary, summary_updated_at, "
            "is_llm_restricted, llm_participation_enabled, dm_pair_key"
        )
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("/api/workspaces/{workspace_id}/members/invite")
async def invite_workspace_member_by_email(
    workspace_id: str,
    body: InviteMemberRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Add a workspace member by email. If user exists, add to workspace. If not, send invite email."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    # Check caller is in workspace (owner or member)
    ws = supabase.table("workspaces").select("id, user_id, name").eq("id", workspace_id).execute()
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace_row = ws.data[0]
    owner_id = workspace_row.get("user_id")
    workspace_name = (workspace_row.get("name") or "the workspace").strip()
    if owner_id != uid:
        members = supabase.table("workspace_members").select("user_id").eq("workspace_id", workspace_id).eq("user_id", uid).execute()
        if not members.data or len(members.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")
    # Resolve user by email via Auth Admin API
    settings = get_settings()
    base = str(settings.supabase_url).rstrip("/")
    auth_url = f"{base}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(auth_url, headers=headers, params={"per_page": 1000})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Auth admin request failed")
    data = r.json()
    users = data.get("users") or []
    target = next((u for u in users if (u.get("email") or "").strip().lower() == email), None)
    if target:
        # Existing user: add to workspace_members
        target_id = target.get("id")
        if not target_id:
            raise HTTPException(status_code=502, detail="Invalid user object")
        if target_id == uid:
            raise HTTPException(status_code=400, detail="You are already a member")
        try:
            supabase.table("workspace_members").insert({
                "workspace_id": workspace_id,
                "user_id": target_id,
                "role": "member",
            }).execute()
        except Exception as e:
            err = str(e)
            if "duplicate" in err.lower() or "unique" in err.lower():
                raise HTTPException(status_code=409, detail="User is already a member")
            raise HTTPException(status_code=400, detail=err)
        return {"ok": True, "user_id": target_id, "invited": False}
    # User does not exist: send invite email via Auth Admin invite
    inviter_email = (user.get("email") or "A team member").strip()
    site_url = (settings.site_url or "http://localhost:5173").rstrip("/")
    redirect_to = f"{site_url}/app?workspace_id={workspace_id}&invited=1"
    invite_body = {
        "email": email,
        "data": {
            "workspace_id": workspace_id,
            "workspace_name": workspace_name,
            "inviter_email": inviter_email,
        },
        "redirect_to": redirect_to,
    }
    invite_url = f"{base}/auth/v1/invite"
    async with httpx.AsyncClient() as client:
        inv_res = await client.post(invite_url, headers=headers, json=invite_body)
    if inv_res.status_code not in (200, 201):
        err_detail = inv_res.text
        try:
            err_json = inv_res.json()
            err_detail = err_json.get("msg") or err_json.get("error_description") or err_detail
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=err_detail or "Failed to send invite email")
    return {"ok": True, "invited": True, "message": "Invite email sent."}


class AcceptInviteRequest(BaseModel):
    workspace_id: str


@router.post("/api/workspaces/accept-invite")
async def accept_workspace_invite(
    body: AcceptInviteRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Add the current user to a workspace (e.g. after signing up via invite link). Idempotent."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    workspace_id = (body.workspace_id or "").strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id required")
    try:
        supabase.table("workspace_members").insert({
            "workspace_id": workspace_id,
            "user_id": uid,
            "role": "member",
        }).execute()
    except Exception as e:
        err = str(e)
        if "duplicate" in err.lower() or "unique" in err.lower():
            return {"ok": True, "already_member": True}
        raise HTTPException(status_code=400, detail=err)
    return {"ok": True, "already_member": False}


@router.post("/api/workspaces/{workspace_id}/share-code", response_model=WorkspaceShareCodeResponse)
async def get_or_create_workspace_share_code(
    workspace_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Get the existing share code for a workspace or create one if missing."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Check caller is in workspace (owner or member)
    ws = supabase.table("workspaces").select("id, user_id, name, share_code").eq("id", workspace_id).execute()
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace_row = ws.data[0]
    owner_id = workspace_row.get("user_id")
    if owner_id != uid:
        members = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", uid)
            .execute()
        )
        if not members.data or len(members.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    code = (workspace_row.get("share_code") or "").strip()
    if not code:
        code = _create_unique_share_code()
        supabase.table("workspaces").update({"share_code": code}).eq("id", workspace_id).execute()

    return WorkspaceShareCodeResponse(workspace_id=workspace_id, share_code=code)


@router.post("/api/workspaces/{workspace_id}/share-code/rotate", response_model=WorkspaceShareCodeResponse)
async def rotate_workspace_share_code(
    workspace_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Rotate a workspace's share code. Only the owner may rotate."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    ws = supabase.table("workspaces").select("id, user_id, share_code").eq("id", workspace_id).execute()
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace_row = ws.data[0]
    owner_id = workspace_row.get("user_id")
    if owner_id != uid:
        raise HTTPException(status_code=403, detail="Only the workspace owner can rotate the share code")

    code = _create_unique_share_code()
    supabase.table("workspaces").update({"share_code": code}).eq("id", workspace_id).execute()
    return WorkspaceShareCodeResponse(workspace_id=workspace_id, share_code=code)


@router.post("/api/workspaces/join-by-code")
async def join_workspace_by_code(
    body: JoinByCodeRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Join a workspace using its share code."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    code = (body.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    ws = (
        supabase.table("workspaces")
        .select("id, name, icon, user_id")
        .eq("share_code", code)
        .execute()
    )
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found for this code")
    workspace_row = ws.data[0] or {}
    workspace_id = workspace_row.get("id")
    if not workspace_id:
        raise HTTPException(status_code=500, detail="Workspace data is invalid")

    try:
        supabase.table("workspace_members").insert(
            {"workspace_id": workspace_id, "user_id": uid, "role": "member"}
        ).execute()
        already_member = False
    except Exception as e:
        err = str(e)
        # Handle unique constraint on (workspace_id, user_id) gracefully
        if (
            "duplicate" in err.lower()
            or "unique" in err.lower()
            or "workspace_members_workspace_id_user_id_key" in err
        ):
            already_member = True
        else:
            raise HTTPException(status_code=400, detail=err)

    return {
        "ok": True,
        "workspace_id": workspace_id,
        "workspace_name": workspace_row.get("name"),
        "workspace_icon": workspace_row.get("icon"),
        "workspace_owner_id": workspace_row.get("user_id"),
        "already_member": already_member,
    }


@router.get("/api/workspaces/{workspace_id}/members", response_model=list[WorkspaceMemberProfile])
async def get_workspace_members_with_profiles(
    workspace_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Return workspace members with email + display name."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    # Ensure caller is owner or member
    ws = supabase.table("workspaces").select("id, user_id").eq("id", workspace_id).execute()
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace_row = ws.data[0]
    owner_id = workspace_row.get("user_id")
    if owner_id != uid:
        members = (
            supabase.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", uid)
            .execute()
        )
        if not members.data or len(members.data) == 0:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    wm_res = (
        supabase.table("workspace_members")
        .select("id, workspace_id, user_id, role, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=False)
        .execute()
    )
    members_rows = wm_res.data or []
    if not members_rows:
        return []

    user_ids = sorted({m.get("user_id") for m in members_rows if m.get("user_id")})

    # Fetch auth users via admin API
    settings = get_settings()
    base = str(settings.supabase_url).rstrip("/")
    auth_url = f"{base}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(auth_url, headers=headers, params={"per_page": 1000})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Auth admin request failed")
    users_data = r.json()
    users = users_data.get("users") or []
    users_by_id = {u.get("id"): u for u in users if u.get("id") in user_ids}

    profiles: list[WorkspaceMemberProfile] = []
    for m in members_rows:
        mid = m.get("id")
        member_user_id = m.get("user_id")
        role = m.get("role") or "member"
        u = users_by_id.get(member_user_id) or {}
        raw_email = (u.get("email") or "").strip()
        user_meta = u.get("user_metadata") or {}
        full_name = (user_meta.get("full_name") or "").strip()
        if full_name:
            display_name = full_name
        elif raw_email:
            display_name = raw_email.split("@")[0]
        else:
            display_name = "User"
        email = raw_email or ""
        profiles.append(
            WorkspaceMemberProfile(
                id=str(mid),
                user_id=str(member_user_id),
                role=str(role),
                email=email,
                display_name=display_name,
            )
        )
    return profiles


@router.post("/api/workspaces/{workspace_id}/dms")
async def create_or_get_dm(
    workspace_id: str,
    body: CreateDmRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    other_user_id = (body.other_user_id or "").strip()
    if not other_user_id:
        raise HTTPException(status_code=400, detail="other_user_id required")
    if other_user_id == uid:
        raise HTTPException(status_code=400, detail="Cannot create a DM with yourself")

    if not _user_can_access_workspace(workspace_id, uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    if not _user_can_access_workspace(workspace_id, other_user_id):
        raise HTTPException(status_code=403, detail="Recipient is not a member of this workspace")

    pair_key = _dm_pair_key(uid, other_user_id)
    existing = (
        supabase.table("channels")
        .select(
            "id, workspace_id, name, type, created_at, summary, summary_updated_at, "
            "is_llm_restricted, llm_participation_enabled, dm_pair_key"
        )
        .eq("workspace_id", workspace_id)
        .eq("type", "dm")
        .eq("dm_pair_key", pair_key)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    try:
        created = (
            supabase.table("channels")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "name": "DM",
                    "type": "dm",
                    "dm_pair_key": pair_key,
                    "is_llm_restricted": False,
                    "llm_participation_enabled": True,
                }
            )
            .select(
                "id, workspace_id, name, type, created_at, summary, summary_updated_at, "
                "is_llm_restricted, llm_participation_enabled, dm_pair_key"
            )
            .single()
            .execute()
        )
        if not created.data:
            raise HTTPException(status_code=500, detail="Failed to create DM")
        channel = created.data
        supabase.table("channel_members").insert(
            [
                {"channel_id": channel["id"], "user_id": uid},
                {"channel_id": channel["id"], "user_id": other_user_id},
            ]
        ).execute()
        return channel
    except HTTPException:
        raise
    except Exception:
        retry = (
            supabase.table("channels")
            .select(
                "id, workspace_id, name, type, created_at, summary, summary_updated_at, "
                "is_llm_restricted, llm_participation_enabled, dm_pair_key"
            )
            .eq("workspace_id", workspace_id)
            .eq("type", "dm")
            .eq("dm_pair_key", pair_key)
            .limit(1)
            .execute()
        )
        if retry.data:
            return retry.data[0]
        raise HTTPException(status_code=500, detail="Failed to create DM")


@router.post("/api/workspaces/{workspace_id}/members/remove")
async def remove_workspace_member(
    workspace_id: str,
    body: RemoveMemberRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Remove a member from a workspace. Only the workspace owner can remove others."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    ws = supabase.table("workspaces").select("id, user_id").eq("id", workspace_id).execute()
    if not ws.data or len(ws.data) == 0:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace_row = ws.data[0]
    owner_id = workspace_row.get("user_id")
    if owner_id != uid:
        raise HTTPException(status_code=403, detail="Only the workspace owner can remove members")

    # Do not allow owner to remove themselves via this endpoint
    member_row_res = (
        supabase.table("workspace_members")
        .select("id, user_id, role")
        .eq("id", body.member_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if not member_row_res.data:
        raise HTTPException(status_code=404, detail="Member not found")
    member_row = member_row_res.data[0]
    if member_row.get("user_id") == owner_id:
        raise HTTPException(status_code=400, detail="Owner cannot be removed from the workspace")

    try:
        supabase.table("workspace_members").delete().eq("id", body.member_id).execute()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"ok": True}


@router.post("/api/auth/log-event")
async def log_auth_event(
    body: LogEventRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """Record auth event (e.g. sign_in) for the current user. Requires auth."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    try:
        supabase.table("auth_events").insert(
            {"user_id": user_id, "event_type": body.event_type}
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log event: {e}")
    return {"ok": True}


class TaskUpdateRequest(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    assignees: Optional[List[str]] = None


@router.get("/api/channels/{channel_id}/tasks")
async def list_channel_tasks(
    channel_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    res = (
        supabase.table("tasks")
        .select("*, task_assignees(display_name, user_id)")
        .eq("channel_id", channel_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"tasks": res.data or []}


@router.post("/api/tasks/{task_id}/confirm")
async def confirm_task(
    task_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    res = supabase.table("tasks").update({"status": "open"}).eq("id", task_id).eq("status", "proposed").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Task not found or not in proposed state")
    supabase.table("task_events").insert({
        "task_id": task_id,
        "kind": "confirmed",
        "actor_user_id": uid,
        "payload": {},
    }).execute()
    return {"task": res.data[0]}


@router.delete("/api/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    task_res = supabase.table("tasks").select("id, status").eq("id", task_id).execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    was_proposed = task_res.data[0].get("status") == "proposed"
    if was_proposed:
        supabase.table("task_events").insert({
            "task_id": task_id,
            "kind": "rejected",
            "actor_user_id": uid,
            "payload": {},
        }).execute()
    supabase.table("tasks").delete().eq("id", task_id).execute()
    return {"ok": True}


@router.patch("/api/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdateRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    valid_statuses = {"proposed", "open", "in_progress", "done", "blocked"}
    updates: dict = {}
    if body.status is not None:
        if body.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")
        updates["status"] = body.status
    if body.title is not None:
        updates["title"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    if body.due_date is not None:
        updates["due_date"] = body.due_date

    event_payload: dict = {}
    if updates:
        res = supabase.table("tasks").update(updates).eq("id", task_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Task not found")
        event_payload.update(updates)

    if body.assignees is not None:
        supabase.table("task_assignees").delete().eq("task_id", task_id).execute()
        if body.assignees:
            supabase.table("task_assignees").insert([
                {"task_id": task_id, "display_name": name, "added_by": uid}
                for name in body.assignees
            ]).execute()
        event_payload["assignees"] = body.assignees

    if event_payload:
        kind = "status_changed" if "status" in event_payload else "edited"
        supabase.table("task_events").insert({
            "task_id": task_id,
            "kind": kind,
            "actor_user_id": uid,
            "payload": event_payload,
        }).execute()

    task_res = supabase.table("tasks").select("*, task_assignees(display_name, user_id)").eq("id", task_id).execute()
    return {"task": task_res.data[0] if task_res.data else None}


class ActionRequest(BaseModel):
    thread_id: str
    label: str


@router.post("/api/actions")
async def queue_action(
    body: ActionRequest,
    _user: Annotated[dict, Depends(get_current_user)],
):
    # Ensure thread exists (upsert by id)
    try:
        supabase.table("threads").upsert(
            {"id": thread_id},
            on_conflict="id",
        ).execute()
    except Exception:
        pass  # may already exist
    # Insert action row
    action_res = (
        supabase.table("actions")
        .insert(
            {
                "thread_id": thread_id,
                "label": body.label,
                "status": "pending",
            }
        )
        .execute()
    )
    if not action_res.data or len(action_res.data) == 0:
        raise HTTPException(500, "Failed to create action")
    action_id = action_res.data[0]["id"]
    # Enqueue job (worker will update action status)
    job = enqueue_action(thread_id, body.label, action_id=action_id)
    return {"queued": True, "job_id": job.id, "action_id": action_id}


# --- WebSocket chat ---

def _coerce_messages(payload: dict) -> list[dict[str, str]]:
    """Accept {messages: [{role, content}]} or {content: "..."} (single user message fallback)."""
    messages = payload.get("messages")
    if isinstance(messages, list):
        out = [
            {"role": item["role"], "content": item["content"]}
            for item in messages
            if isinstance(item, dict)
            and isinstance(item.get("role"), str)
            and isinstance(item.get("content"), str)
            and item["role"]
            and item["content"]
        ]
        if out:
            return out
    content = payload.get("content")
    if isinstance(content, str) and content.strip():
        return [{"role": "user", "content": content.strip()}]
    return []


@router.websocket("/ws")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    while True:
        try:
            raw = await websocket.receive_text()
        except WebSocketDisconnect:
            break

        try:
            payload = json.loads(raw)
        except Exception:
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
            continue

        if not isinstance(payload, dict):
            await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
            continue

        msg_type = payload.get("type")
        thread_id = payload.get("threadId") if isinstance(payload.get("threadId"), str) else "unknown"

        if msg_type != "user_message":
            await websocket.send_text(
                json.dumps({"type": "error", "threadId": thread_id, "message": f"Unknown type: {msg_type}"})
            )
            continue

        msgs = _coerce_messages(payload)
        if not msgs:
            await websocket.send_text(
                json.dumps({"type": "error", "threadId": thread_id, "message": "Missing messages/content"})
            )
            continue

        try:
            # Bridge the synchronous streaming generator to async via a thread + queue
            queue: asyncio.Queue = asyncio.Queue()
            loop = asyncio.get_running_loop()

            def _run_gen() -> None:
                try:
                    for delta in stream_assistant_reply(messages=msgs):
                        asyncio.run_coroutine_threadsafe(queue.put(("token", delta)), loop)
                    asyncio.run_coroutine_threadsafe(queue.put(("done", None)), loop)
                except Exception as exc:
                    asyncio.run_coroutine_threadsafe(queue.put(("error", str(exc))), loop)

            executor_task = loop.run_in_executor(None, _run_gen)

            while True:
                kind, value = await queue.get()
                if kind == "token":
                    await websocket.send_text(
                        json.dumps({"type": "token", "threadId": thread_id, "delta": value})
                    )
                elif kind == "done":
                    await websocket.send_text(json.dumps({"type": "done", "threadId": thread_id}))
                    break
                elif kind == "error":
                    await websocket.send_text(
                        json.dumps({"type": "error", "threadId": thread_id, "message": value})
                    )
                    break

            await executor_task
        except WebSocketDisconnect:
            break
        except Exception as exc:
            try:
                await websocket.send_text(
                    json.dumps({"type": "error", "threadId": thread_id, "message": str(exc)})
                )
            except Exception:
                pass


# --- AI Auto-Response for Group Chat (@ai mention) ---

class TriageRequest(BaseModel):
    channel_id: str
    messages: List[dict]  # [{role, content}]
    thread_id: Optional[str] = None  # legacy compat; resolved server-side if absent


def _get_user_channels(uid: str) -> list[dict]:
    """
    Fetch all channels (with workspace info and summary) visible to the user.
    Used for AI navigation matching.
    """
    # Workspaces the user owns or is a member of
    owned = supabase.table("workspaces").select("id, name, summary").eq("user_id", uid).execute()
    memberships = (
        supabase.table("workspace_members")
        .select("workspace_id")
        .eq("user_id", uid)
        .execute()
    )
    member_ids = [r["workspace_id"] for r in (memberships.data or [])]
    workspace_map: dict[str, dict] = {w["id"]: w for w in (owned.data or [])}
    if member_ids:
        member_ws = (
            supabase.table("workspaces")
            .select("id, name, summary")
            .in_("id", member_ids)
            .execute()
        )
        for w in (member_ws.data or []):
            workspace_map.setdefault(w["id"], w)

    if not workspace_map:
        return []

    channels_res = (
        supabase.table("channels")
        .select(
            "id, workspace_id, name, type, summary, "
            "is_llm_restricted, llm_participation_enabled"
        )
        .in_("workspace_id", list(workspace_map.keys()))
        .execute()
    )
    result = []
    for ch in (channels_res.data or []):
        ws = workspace_map.get(ch["workspace_id"], {})
        result.append({
            "id": ch["id"],
            "workspace_id": ch["workspace_id"],
            "name": ch["name"],
            "type": ch.get("type", "project"),
            "is_llm_restricted": ch.get("is_llm_restricted", False),
            "llm_participation_enabled": ch.get("llm_participation_enabled", True),
            "workspace_name": ws.get("name", ""),
            "summary": ch.get("summary") or f"Channel #{ch['name']} in workspace {ws.get('name', '')}",
        })
    return result


def _get_or_create_channel_thread(channel_id: str) -> str:
    """
    Compatibility helper while messages are still persisted against thread_id.
    Resolve the most recently updated thread in a channel or create one.
    """
    existing = (
        supabase.table("threads")
        .select("id, workspace_id, channel_id, updated_at")
        .eq("channel_id", channel_id)
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data and len(existing.data) > 0:
        return existing.data[0]["id"]

    ch = (
        supabase.table("channels")
        .select("id, workspace_id")
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    if not ch.data or len(ch.data) == 0:
        raise HTTPException(status_code=404, detail="Channel not found")
    workspace_id = ch.data[0].get("workspace_id")

    created = (
        supabase.table("threads")
        .insert(
            {
                "workspace_id": workspace_id,
                "channel_id": channel_id,
                "title": "Channel conversation",
            }
        )
        .select("id")
        .single()
        .execute()
    )
    if not created.data or not created.data.get("id"):
        raise HTTPException(status_code=500, detail="Failed to initialize channel conversation")
    return created.data["id"]


@router.patch("/api/channels/{channel_id}/settings")
async def update_channel_settings(
    channel_id: str,
    body: ChannelSettingsRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    channel = _select_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not _user_can_access_workspace(channel["workspace_id"], uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    updates: dict[str, bool] = {}
    if body.is_llm_restricted is not None:
        updates["is_llm_restricted"] = body.is_llm_restricted
    if body.llm_participation_enabled is not None:
        updates["llm_participation_enabled"] = body.llm_participation_enabled

    if not updates:
        return channel

    result = (
        supabase.table("channels")
        .update(updates)
        .eq("id", channel_id)
        .select(
            "id, workspace_id, name, type, created_at, summary, summary_updated_at, "
            "is_llm_restricted, llm_participation_enabled, dm_pair_key"
        )
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update channel settings")
    return result.data


@router.post("/api/channels/{channel_id}/summary/refresh")
async def enqueue_channel_summary_refresh(
    channel_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    channel = _select_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not _user_can_access_workspace(channel["workspace_id"], uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    try:
        enqueue_action(channel_id, "generate_summary", action_id=None)
    except Exception as exc:
        logger.warning("summary enqueue failed channel_id=%s error=%s", channel_id, exc)
        return {"ok": False, "queued": False}

    return {"ok": True, "queued": True}


@router.post("/api/channels/{channel_id}/triage")
async def respond_to_ai_mention(
    channel_id: str,
    body: TriageRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    """
    Handle an @ai mention in a channel. First checks if it's a navigation request
    (e.g. "take me to the channel about bills"). If so, returns a navigation result.
    Otherwise generates a normal AI response.

    Note: This handler runs LLM + Supabase work in a thread pool; it does not enqueue
    the main response to Redis/RQ. Jobs are only enqueued after a successful reply
    (e.g. channel summary). For queue verification use POST /api/actions or monitor
    after the request completes.
    """
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    if body.channel_id != channel_id:
        raise HTTPException(status_code=400, detail="channel_id mismatch")

    # Resolve thread_id once — use what the client sent or look it up
    thread_id = body.thread_id or _get_or_create_channel_thread(channel_id)

    channel = _select_channel_by_id(channel_id)
    if not channel:
        return {"should_respond": False, "reason": "channel settings unavailable"}
    if channel.get("is_llm_restricted") is True:
        return {"should_respond": False, "reason": "channel is restricted-llm"}
    if channel.get("llm_participation_enabled") is False:
        return {"should_respond": False, "reason": "llm participation disabled"}

    logger.info(
        "triage start channel_id=%s thread_id=%s uid=%s message_count=%s",
        channel_id,
        thread_id,
        uid,
        len(body.messages) if isinstance(body.messages, list) else 0,
    )

    msgs = [
        {"role": m.get("role", "user"), "content": m.get("content", "")}
        for m in body.messages
        if isinstance(m, dict)
        and isinstance(m.get("content"), str)
        and m["content"].strip()
    ]

    if not msgs:
        return {"should_respond": False, "reason": "No valid messages"}

    loop = asyncio.get_running_loop()

    # --- Step 1: Detect navigation intent ---
    logger.info("triage phase=navigation_intent channel_id=%s", channel_id)
    nav_intent = await loop.run_in_executor(
        None, lambda: detect_navigation_intent(messages=msgs)
    )
    logger.info("triage phase=navigation_intent_done is_navigation=%s", nav_intent.get("is_navigation"))

    if nav_intent.get("is_navigation") and nav_intent.get("query"):
        query = nav_intent["query"]
        logger.info("triage phase=navigation_match query=%s", query[:200] if query else "")
        channels = await loop.run_in_executor(None, lambda: _get_user_channels(uid))
        if not channels:
            return {
                "should_respond": True,
                "content": "I couldn't find any channels to navigate to.",
            }
        match = await loop.run_in_executor(
            None, lambda: find_best_channel(query=query, channels=channels)
        )
        logger.info("triage phase=navigation_match_done channel_id_match=%s", match.get("channel_id"))
        if match.get("channel_id"):
            return {
                "should_respond": False,
                "navigation": {
                    "channel_id": match["channel_id"],
                    "workspace_id": match["workspace_id"],
                    "channel_name": match.get("channel_name"),
                    "workspace_name": match.get("workspace_name"),
                    "confidence": match.get("confidence", "medium"),
                    "reason": match.get("reason", ""),
                },
            }
        # No match found — fall through to normal response
        return {
            "should_respond": True,
            "content": f"I couldn't find a channel matching \"{query}\". Try being more specific.",
        }

    # --- Step 1.5: Ambiguity pre-check (doc vs tasks) ---
    # Run a fast classifier before the full file/task detectors to catch ambiguous phrasing
    # and ask the user to clarify rather than silently picking the wrong intent.
    ambiguity = await loop.run_in_executor(
        None, lambda: detect_doc_or_task_ambiguity(messages=msgs)
    )
    if ambiguity.get("intent") == "ambiguous":
        # Build a clarify message that the frontend will render as two buttons
        last_user_msg = next(
            (m["content"] for m in reversed(msgs) if m["role"] == "user"), ""
        )
        # Strip @ai mention for the follow-up messages
        import re as _re
        clean = _re.sub(r"@ai\b", "", last_user_msg, flags=_re.IGNORECASE).strip(" ,")
        a_query = f"extract action items from {clean} as tasks"
        b_query = f"create a document from {clean}"
        clarify_marker = (
            f':::clarify{{a_label="Save as tasks" a_query="{a_query}" '
            f'b_label="Create a doc" b_query="{b_query}"}}'
        )
        content = f"Did you want to track those as tasks or create a document?\n\n{clarify_marker}"
        try:
            result = supabase.table("messages").insert({
                "thread_id": thread_id,
                "role": "assistant",
                "content": content,
            }).execute()
            saved = result.data[0] if result.data else None
        except Exception:
            saved = None
        return {
            "should_respond": True,
            "message_id": saved["id"] if saved else None,
            "content": content,
        }

    # --- Step 2: Detect file intent ---
    logger.info("triage phase=file_intent channel_id=%s", channel_id)
    file_intent = await loop.run_in_executor(
        None, lambda: detect_file_intent(messages=msgs)
    )
    logger.info(
        "triage phase=file_intent_done is_file_intent=%s intent_type=%s",
        file_intent.get("is_file_intent"),
        file_intent.get("intent_type"),
    )

    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "find_file":
        query = file_intent.get("query") or ""
        ch_res = (
            supabase.table("channels")
            .select("workspace_id")
            .eq("id", channel_id)
            .execute()
        )
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            ws_id = workspace_id
            q = query
            found_files = await loop.run_in_executor(
                None,
                lambda w=ws_id, qv=q: search_files(workspace_id=w, query=qv),
            )
            if found_files:
                file_markers = "\n".join(f':::file{{id="{f["id"]}"}}' for f in found_files)
                content = (
                    f'I found {len(found_files)} file(s) matching "{query}":\n\n{file_markers}'
                )
                try:
                    result = (
                        supabase.table("messages")
                        .insert(
                            {
                                "thread_id": thread_id,
                                "role": "assistant",
                                "content": content,
                            }
                        )
                        .execute()
                    )
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                    "files": found_files,
                }
            else:
                content = f"I couldn't find any files matching \"{query}\"."
                try:
                    result = (
                        supabase.table("messages")
                        .insert(
                            {
                                "thread_id": thread_id,
                                "role": "assistant",
                                "content": content,
                            }
                        )
                        .execute()
                    )
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "create_document":
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            doc_title = file_intent.get("doc_title") or "Document"
            time_range = file_intent.get("time_range_days") or 7
            instructions = file_intent.get("instructions") or "summarize the key points"

            generated = await loop.run_in_executor(
                None,
                lambda cid=channel_id,
                wid=workspace_id,
                dt=doc_title,
                tr=int(time_range),
                inst=instructions,
                cb=uid: generate_document(
                    channel_id=cid,
                    workspace_id=wid,
                    title=dt,
                    time_range_days=tr,
                    instructions=inst,
                    created_by=cb,
                ),
            )
            if generated:
                file_marker = f':::file{{id="{generated["id"]}"}}'
                content = f"I created \"{doc_title}\":\n\n{file_marker}"
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                    "files": [generated],
                }
            else:
                content = "I couldn't generate the document — there may not be enough messages in the specified time range."
                return {"should_respond": True, "content": content}

    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "export_tasks":
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            doc_title = file_intent.get("doc_title") or "Task List"
            generated = await loop.run_in_executor(
                None,
                lambda cid=channel_id, wid=workspace_id, dt=doc_title, cb=uid: export_tasks_as_document(
                    channel_id=cid,
                    workspace_id=wid,
                    title=dt,
                    created_by=cb,
                ),
            )
            if generated:
                file_marker = f':::file{{id="{generated["id"]}"}}'
                content = f"Here's the task export:\n\n{file_marker}"
            else:
                content = "There are no confirmed tasks in this channel to export yet."
            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
                **({"files": [generated]} if generated else {}),
            }

    if file_intent.get("is_file_intent") and file_intent.get("intent_type") == "append_to_document":
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None
        if workspace_id:
            target_query = file_intent.get("target_file_query") or ""
            section_title = file_intent.get("doc_title") or "Appended Section"
            time_range = int(file_intent.get("time_range_days") or 7)
            instructions = file_intent.get("instructions") or "summarize the key points"

            # Find the target file
            ws_id = workspace_id
            tq = target_query
            target_files = await loop.run_in_executor(
                None, lambda w=ws_id, q=tq: search_files(workspace_id=w, query=q)
            )
            if not target_files:
                content = f"I couldn't find a file matching \"{target_query}\"."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

            target_file = target_files[0]
            target_file_id = target_file["id"]

            # Generate the section content from messages
            cid = channel_id
            wid = workspace_id
            st = section_title
            tr = time_range
            inst = instructions
            cb = uid
            section_doc = await loop.run_in_executor(
                None,
                lambda: generate_document(
                    channel_id=cid,
                    workspace_id=wid,
                    title=st,
                    time_range_days=tr,
                    instructions=inst,
                    created_by=cb,
                ),
            )

            if not section_doc:
                content = "I couldn't generate the section — there may not be enough messages in the specified time range."
                return {"should_respond": True, "content": content}

            # Download the section content from storage and use it as the appended text
            try:
                section_bytes = supabase.storage.from_("workspace-files").download(section_doc["storage_path"])
                section_text = section_bytes.decode("utf-8")
            except Exception:
                section_text = f"*(Could not retrieve generated section content)*"

            # Clean up the temporary section file
            try:
                supabase.storage.from_("workspace-files").remove([section_doc["storage_path"]])
                supabase.table("files").delete().eq("id", section_doc["id"]).execute()
            except Exception:
                pass

            fid = target_file_id
            wid2 = workspace_id
            st2 = section_title
            sc = section_text
            updated_file = await loop.run_in_executor(
                None,
                lambda: append_to_document_file(
                    file_id=fid,
                    workspace_id=wid2,
                    section_title=st2,
                    section_content=sc,
                ),
            )

            if updated_file:
                file_marker = f':::file{{id="{updated_file["id"]}"}}'
                content = f"I appended \"{section_title}\" to **{target_file['file_name']}**:\n\n{file_marker}"
            else:
                content = f"I couldn't append to \"{target_file['file_name']}\"."

            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
                **({"files": [updated_file]} if updated_file else {}),
            }

    # --- Step 2.5: Detect task intent ---
    logger.info("triage phase=task_intent channel_id=%s", channel_id)
    task_intent = await loop.run_in_executor(
        None, lambda: detect_task_intent(messages=msgs)
    )
    logger.info(
        "triage phase=task_intent_done is_task_intent=%s intent_type=%s",
        task_intent.get("is_task_intent"),
        task_intent.get("intent_type"),
    )

    if task_intent.get("is_task_intent"):
        ch_res = supabase.table("channels").select("workspace_id").eq("id", channel_id).execute()
        workspace_id = ch_res.data[0]["workspace_id"] if ch_res.data else None

        if not workspace_id:
            return {"should_respond": True, "content": "I couldn't determine your workspace."}

        intent_type = task_intent.get("intent_type")

        # --- list_tasks ---
        if intent_type == "list_tasks":
            tasks_res = (
                supabase.table("tasks")
                .select("id, title, status, task_assignees(display_name)")
                .eq("channel_id", channel_id)
                .neq("status", "proposed")
                .order("created_at", desc=False)
                .execute()
            )
            tasks = tasks_res.data or []
            if not tasks:
                content = "There are no tasks in this channel yet."
            else:
                markers = "\n".join(f':::task{{id="{t["id"]}"}}' for t in tasks)
                content = f"Here are the tasks in this channel:\n\n{markers}"
            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
                "tasks": tasks,
            }

        # --- create_task ---
        if intent_type == "create_task":
            title = task_intent.get("title") or "Untitled task"
            description = task_intent.get("description")
            assignees = task_intent.get("assignees") or []
            due_date_str = task_intent.get("due_date")

            # Phase 4: classify against existing tasks before creating
            existing_res = (
                supabase.table("tasks")
                .select("id, title, status")
                .eq("channel_id", channel_id)
                .neq("status", "proposed")
                .execute()
            )
            existing_tasks = existing_res.data or []
            t_title = title
            t_desc = description
            ex = existing_tasks
            classification = await loop.run_in_executor(
                None,
                lambda tt=t_title, td=t_desc, e=ex: classify_task_novelty(
                    title=tt, description=td, existing_tasks=e
                ),
            )

            if classification["kind"] == "duplicate":
                matched_id = classification.get("task_id")
                reason = classification.get("reason", "")
                if matched_id:
                    content = f"This looks like it already exists ({reason}):\n\n:::task{{id=\"{matched_id}\"}}"
                else:
                    content = f"This looks like a duplicate of an existing task ({reason})."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

            if classification["kind"] == "update":
                matched_id = classification.get("task_id")
                suggested_status = classification.get("suggested_status")
                reason = classification.get("reason", "")
                if matched_id and suggested_status:
                    supabase.table("tasks").update({"status": suggested_status}).eq("id", matched_id).execute()
                    supabase.table("task_events").insert({
                        "task_id": matched_id,
                        "kind": "status_changed",
                        "actor_user_id": uid,
                        "payload": {"status": suggested_status, "reason": reason, "inferred_from_message": True},
                    }).execute()
                    content = f"Updated the existing task ({reason}):\n\n:::task{{id=\"{matched_id}\"}}"
                elif matched_id:
                    content = f"This looks like an update to an existing task ({reason}):\n\n:::task{{id=\"{matched_id}\"}}"
                else:
                    content = f"This looks like an update to existing work ({reason}). Let me know which task to update."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

            # kind == "new" — create as proposed
            task_row = {
                "workspace_id": workspace_id,
                "channel_id": channel_id,
                "title": title,
                "description": description,
                "status": "proposed",
                "created_by": uid,
            }
            if due_date_str:
                task_row["due_date"] = due_date_str

            task_res = supabase.table("tasks").insert(task_row).execute()
            if not task_res.data:
                return {"should_respond": True, "content": "I couldn't create the task right now."}
            task = task_res.data[0]
            task_id = task["id"]

            if assignees:
                settings = get_settings()
                raw_names = assignees
                ws_id = workspace_id
                resolved = await loop.run_in_executor(
                    None,
                    lambda n=raw_names, w=ws_id: resolve_assignees(
                        workspace_id=w,
                        names=n,
                        supabase_url=str(settings.supabase_url),
                        service_role_key=settings.supabase_service_role_key,
                    ),
                )
                supabase.table("task_assignees").insert([
                    {"task_id": task_id, "display_name": r["display_name"], "user_id": r["user_id"], "added_by": uid}
                    for r in resolved
                ]).execute()
                assignees = [r["display_name"] for r in resolved]

            supabase.table("task_events").insert({
                "task_id": task_id,
                "kind": "created",
                "actor_user_id": uid,
                "payload": {"title": title, "assignees": assignees},
            }).execute()

            content = f"I've added a task for review:\n\n:::task{{id=\"{task_id}\"}}"
            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
                "tasks": [task],
            }

        # --- update_task ---
        if intent_type == "update_task":
            reference = task_intent.get("task_reference") or ""
            updates = task_intent.get("updates") or {}

            existing_res = (
                supabase.table("tasks")
                .select("id, title, status")
                .eq("channel_id", channel_id)
                .execute()
            )
            existing = existing_res.data or []
            ws_ref = reference
            ex_tasks = existing
            task_id = await loop.run_in_executor(
                None, lambda r=ws_ref, t=ex_tasks: find_matching_task(reference=r, tasks=t)
            )

            if not task_id:
                content = f"I couldn't find a task matching \"{reference}\"."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

            task_updates: dict = {}
            if updates.get("status"):
                task_updates["status"] = updates["status"]

            event_payload: dict = {}
            if task_updates:
                supabase.table("tasks").update(task_updates).eq("id", task_id).execute()
                event_payload.update(task_updates)

            if updates.get("assignees"):
                new_assignees = updates["assignees"]
                supabase.table("task_assignees").delete().eq("task_id", task_id).execute()
                supabase.table("task_assignees").insert([
                    {"task_id": task_id, "display_name": name, "added_by": uid}
                    for name in new_assignees
                ]).execute()
                event_payload["assignees"] = new_assignees

            if event_payload:
                supabase.table("task_events").insert({
                    "task_id": task_id,
                    "kind": "status_changed" if "status" in event_payload else "assignee_added",
                    "actor_user_id": uid,
                    "payload": event_payload,
                }).execute()

            content = f"Done — task updated:\n\n:::task{{id=\"{task_id}\"}}"
            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
            }

        # --- extract_tasks ---
        if intent_type == "extract_tasks":
            time_range = int(task_intent.get("time_range_days") or 7)
            cid = channel_id
            extracted = await loop.run_in_executor(
                None,
                lambda c=cid, tr=time_range: extract_tasks_from_messages(
                    channel_id=c, time_range_days=tr
                ),
            )
            if not extracted:
                content = "I didn't find any action items in the specified time range."
                try:
                    result = supabase.table("messages").insert({
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": content,
                    }).execute()
                    saved = result.data[0] if result.data else None
                except Exception:
                    saved = None
                return {
                    "should_respond": True,
                    "message_id": saved["id"] if saved else None,
                    "content": content,
                }

            # Phase 4: batch-classify all candidates against existing tasks
            existing_res = (
                supabase.table("tasks")
                .select("id, title, status")
                .eq("channel_id", channel_id)
                .neq("status", "proposed")
                .execute()
            )
            existing_tasks = existing_res.data or []
            ext_copy = extracted
            ex_copy = existing_tasks
            classifications = await loop.run_in_executor(
                None,
                lambda c=ext_copy, e=ex_copy: classify_tasks_batch(candidates=c, existing_tasks=e),
            )

            # Apply updates for "update" classified items
            for item, cls in zip(extracted, classifications):
                if cls["kind"] == "update" and cls.get("task_id") and cls.get("suggested_status"):
                    supabase.table("tasks").update({"status": cls["suggested_status"]}).eq("id", cls["task_id"]).execute()
                    supabase.table("task_events").insert({
                        "task_id": cls["task_id"],
                        "kind": "status_changed",
                        "actor_user_id": uid,
                        "payload": {
                            "status": cls["suggested_status"],
                            "reason": cls.get("reason", ""),
                            "inferred_from_message": True,
                        },
                    }).execute()

            # Only create rows for genuinely new items
            new_items = [
                (item, cls)
                for item, cls in zip(extracted, classifications)
                if cls["kind"] == "new"
            ]

            # Batch-resolve all unique assignee names for new items only
            all_names = list({n for item, _ in new_items for n in (item.get("assignees") or [])})
            resolved_map: Dict[str, Dict] = {}
            if all_names:
                settings = get_settings()
                ws_id = workspace_id
                resolved_list = await loop.run_in_executor(
                    None,
                    lambda n=all_names, w=ws_id: resolve_assignees(
                        workspace_id=w,
                        names=n,
                        supabase_url=str(settings.supabase_url),
                        service_role_key=settings.supabase_service_role_key,
                    ),
                )
                for orig, res in zip(all_names, resolved_list):
                    resolved_map[orig] = res

            created_tasks = []
            for item, _ in new_items:
                task_row = {
                    "workspace_id": workspace_id,
                    "channel_id": channel_id,
                    "title": item.get("title", "Untitled"),
                    "description": item.get("description"),
                    "status": "proposed",
                    "created_by": uid,
                }
                if item.get("due_date"):
                    task_row["due_date"] = item["due_date"]
                task_res = supabase.table("tasks").insert(task_row).execute()
                if not task_res.data:
                    continue
                task = task_res.data[0]
                task_id = task["id"]
                raw_assignees = item.get("assignees") or []
                resolved_assignees = [resolved_map.get(n, {"display_name": n, "user_id": None}) for n in raw_assignees]
                if resolved_assignees:
                    supabase.table("task_assignees").insert([
                        {"task_id": task_id, "display_name": r["display_name"], "user_id": r["user_id"], "added_by": uid}
                        for r in resolved_assignees
                    ]).execute()
                supabase.table("task_events").insert({
                    "task_id": task_id,
                    "kind": "created",
                    "actor_user_id": uid,
                    "payload": {
                        "title": task["title"],
                        "assignees": [r["display_name"] for r in resolved_assignees],
                        "source": "extracted",
                    },
                }).execute()
                created_tasks.append(task)

            # Count skipped items for the summary message
            n_dupes = sum(1 for _, cls in zip(extracted, classifications) if cls["kind"] == "duplicate")
            n_updates = sum(1 for _, cls in zip(extracted, classifications) if cls["kind"] == "update")

            if not created_tasks and (n_dupes > 0 or n_updates > 0):
                parts = []
                if n_updates:
                    parts.append(f"applied {n_updates} update(s) to existing tasks")
                if n_dupes:
                    parts.append(f"skipped {n_dupes} duplicate(s)")
                content = f"No new tasks found — {', '.join(parts)}."
            else:
                markers = "\n".join(f':::task{{id="{t["id"]}"}}' for t in created_tasks)
                content = f"I found {len(created_tasks)} new action item(s) for review"
                if n_updates:
                    content += f" (also applied {n_updates} update(s) to existing tasks)"
                if n_dupes:
                    content += f" (skipped {n_dupes} duplicate(s))"
                content += f":\n\n{markers}"
            try:
                result = supabase.table("messages").insert({
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": content,
                }).execute()
                saved = result.data[0] if result.data else None
            except Exception:
                saved = None
            return {
                "should_respond": True,
                "message_id": saved["id"] if saved else None,
                "content": content,
                "tasks": created_tasks,
            }

    # --- Step 3: Normal AI response ---
    logger.info("triage phase=generate_full_response channel_id=%s", channel_id)
    response_content = await loop.run_in_executor(
        None, lambda: generate_full_response(messages=msgs)
    )
    logger.info(
        "triage phase=generate_full_response_done chars=%s",
        len(response_content) if response_content else 0,
    )

    if not response_content or not response_content.strip():
        return {"should_respond": True, "response": None, "reason": "Empty response from model"}

    # Save assistant message to Supabase (thread compatibility path)
    try:
        result = (
            supabase.table("messages")
            .insert({
                "thread_id": thread_id,
                "role": "assistant",
                "content": response_content.strip(),
            })
            .execute()
        )
        saved_message = result.data[0] if result.data else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save AI response: {e}")

    # Trigger async summary regeneration for this channel (fire-and-forget)
    loop.run_in_executor(
        None,
        lambda: _maybe_enqueue_summary(channel_id),
    )

    logger.info("triage complete channel_id=%s message_id=%s", channel_id, saved_message["id"] if saved_message else None)

    return {
        "should_respond": True,
        "message_id": saved_message["id"] if saved_message else None,
        "content": response_content.strip(),
    }


def _maybe_enqueue_summary(channel_id: str) -> None:
    """Enqueue a summary generation job for the channel (best-effort, won't crash triage)."""
    try:
        from .redis_queue import enqueue_action
        enqueue_action(channel_id, "generate_summary", action_id=None)
    except Exception:
        pass
