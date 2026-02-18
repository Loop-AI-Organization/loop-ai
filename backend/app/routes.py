from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .supabase_client import supabase
from .redis_queue import enqueue_action

router = APIRouter()

class SignedUploadRequest(BaseModel):
    path: str
    expires_in: int = 900

@router.get("/health")
async def health():
    return {"ok": True}

@router.post("/api/signed-upload")
async def signed_upload(body: SignedUploadRequest):
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

class ActionRequest(BaseModel):
    thread_id: str
    label: str


@router.post("/api/actions")
async def queue_action(body: ActionRequest):
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
