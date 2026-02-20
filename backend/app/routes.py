from typing import Annotated
import asyncio
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from .config import get_settings
from .supabase_client import supabase
from .redis_queue import enqueue_action
from .auth import get_current_user
from loop_ai.orchestrator.orchestrator import stream_assistant_reply

router = APIRouter()


class InviteMemberRequest(BaseModel):
    email: str

class SignedUploadRequest(BaseModel):
    path: str
    expires_in: int = 900

@router.get("/health")
async def health():
    return {"ok": True}

@router.post("/api/signed-upload")
async def signed_upload(
    body: SignedUploadRequest,
    _user: Annotated[dict, Depends(get_current_user)],
):
    bucket = "workspace-files"
    try:
        data = supabase.storage.from_(bucket).create_signed_upload_url(
            body.path, expires_in=body.expires_in
        )
    except Exception as e:
        raise HTTPException(
            502,
            f"Supabase storage error. Ensure bucket '{bucket}' exists in your project. Detail: {e!s}",
        )
    if not data:
        raise HTTPException(400, "Failed to create signed URL")
    return data  # {signedUrl, token}

class LogEventRequest(BaseModel):
    event_type: str = "sign_in"


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
            {"id": body.thread_id},
            on_conflict="id",
        ).execute()
    except Exception:
        pass  # may already exist
    # Insert action row
    action_res = (
        supabase.table("actions")
        .insert(
            {
                "thread_id": body.thread_id,
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
    job = enqueue_action(body.thread_id, body.label, action_id=action_id)
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
