# Loop AI

Monorepo for the Loop AI project. Frontend lives in `frontend/`, backend in `backend/`.

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Radix UI, Zustand, React Router, TanStack Query, Supabase (auth).
- **Backend:** FastAPI, Uvicorn, Supabase (Postgres + Auth), Redis, RQ (background jobs).
- **LLM:** OpenRouter (streaming chat completions).

## Backend (FastAPI + Supabase + Redis)

- **Supabase setup:** See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for full setup (CLI, migrations, bucket, env).
- **Run API** (from `backend/`): `uvicorn app.main:app --reload --port 4000`
- **Run worker** (from `backend/`): `python worker.py`
- Requires **Redis** running and a **root `.env`** (copy from `backend/.env.example` or root `.env.example`). The root `.env` must include:
  - Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `REDIS_URL` (e.g. `redis://localhost:6379`)
  - **OpenRouter:** `OPENROUTER_API_KEY` (get one at [openrouter.ai/keys](https://openrouter.ai/keys)) so the LLM works. Optional: `OPENROUTER_MODEL`, `OPENROUTER_MAX_TOKENS`, `OPENROUTER_TEMPERATURE` (see `backend/.env.example`).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:8080**.

Set up `frontend/.env` from `frontend/.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL=http://localhost:4000` (and `VITE_BACKEND_WS_URL=ws://localhost:4000/ws` if using streaming). You can sync from the root `.env` with `node scripts/sync-env.js` (see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)).

Other scripts (from `frontend/`): `npm run build`, `npm run preview`, `npm run lint`, `npm run test`.
