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
    data = supabase.storage.from_(bucket).create_signed_upload_url(
        body.path, expires_in=body.expires_in
    )
    if not data:
        raise HTTPException(400, "Failed to create signed URL")
    return data  # {signedUrl, token}

class ActionRequest(BaseModel):
    thread_id: str
    label: str

@router.post("/api/actions")
async def queue_action(body: ActionRequest):
    job = enqueue_action(body.thread_id, body.label)
    return {"queued": True, "job_id": job.id}
