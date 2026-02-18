from contextlib import asynccontextmanager
from fastapi import FastAPI
from .routes import router
from .config import get_settings
from .supabase_client import supabase

BUCKET_ID = "workspace-files"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify Supabase and bucket exist
    try:
        supabase.storage.get_bucket(BUCKET_ID)
    except Exception as e:
        raise RuntimeError(
            f"Supabase unreachable or bucket '{BUCKET_ID}' missing. "
            "Run scripts/create_supabase_bucket.py or create the bucket in Dashboard → Storage."
        ) from e
    yield
    # Shutdown: nothing to do
    pass


def create_app() -> FastAPI:
    app = FastAPI(title="Loop AI Backend", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=get_settings().port, reload=True)
