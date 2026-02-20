from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    settings = get_settings()
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    if settings.cors_origin:
        origins.extend(s.strip() for s in settings.cors_origin.split(",") if s.strip())
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=get_settings().port, reload=True)
