from fastapi import FastAPI
from .routes import router
from .config import get_settings

def create_app() -> FastAPI:
    app = FastAPI(title="Loop AI Backend")
    app.include_router(router)
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=get_settings().port, reload=True)
