# Loop AI

Monorepo for the Loop AI project. Frontend lives in `frontend/`, backend in `backend/`.

## Backend (FastAPI + Supabase + Redis)

- **Supabase setup**: See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for full setup (CLI, migrations, bucket, env).
- **Run API** (from `backend/`): `uvicorn app.main:app --reload --port 4000`
- **Run worker** (from `backend/`): `python worker.py`
- Requires `.env` at repo root (copy from `.env.example`) and Redis running.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:8080**.

Other scripts (from `frontend/`): `npm run build`, `npm run preview`, `npm run lint`, `npm run test`.
