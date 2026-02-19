# Supabase setup (Loop AI backend)

This doc covers a full Supabase setup so the backend is fully functional (tables, storage, env).

## 1. Create or use a Supabase project

- Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a project (or use an existing one).
- Note your **Project ref** (ID in the URL: `https://supabase.com/dashboard/project/<project-ref>`).
- In **Settings → Database**, note or set your **database password** (you’ll need it to link the CLI).

## 2. Auth setup (Supabase Auth)

- In **Authentication** → **Providers**: enable **Email** (email/password sign-in).
- In **Authentication** → **URL Configuration**: set **Site URL** to your app origin (e.g. `http://localhost:3000` if the frontend runs on port 3000). Add the same URL to **Redirect URLs** if you use email confirmation or OAuth.
- **JWT verification**: Supabase uses **signing keys** (not a single JWT secret). The backend verifies tokens using the public keys from `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. You do **not** need to set `SUPABASE_JWT_SECRET` in `.env`.
- Protected API routes require the header: `Authorization: Bearer <access_token>`. The frontend sends the Supabase session’s access token when calling the backend.

## 3. Install Supabase CLI

Global `npm i -g supabase` is **not supported**. Use one of these:

- **Windows (Scoop)**  
  ```powershell
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  ```
  (Install [Scoop](https://scoop.sh) first if needed.)

- **Project-only (any OS)**  
  From the repo root:
  ```bash
  npm i supabase --save-dev
  ```
  Then run the CLI via `npx supabase` (e.g. `npx supabase login`).

- **macOS/Linux**: `brew install supabase/tap/supabase`  
- More options: [Supabase CLI install](https://github.com/supabase/cli#install-the-cli)

## 4. Tables setup (choose one)

The schema includes **workspaces** (per user), **channels** (per workspace), **threads** (per channel), **messages** (per thread), plus **actions** and **auth_events**. RLS ensures each user only sees their own workspaces, channels, threads, and messages.

Create the `threads` and `actions` tables and RLS using **one** of these options.

**A. With Supabase CLI**

From the **repo root** (use `npx supabase` if you installed with `npm i supabase --save-dev`):

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF> -p <DB_PASSWORD>
supabase db push
```

If you used the project dev dependency:
```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF> -p <DB_PASSWORD>
npx supabase db push
```

**B. Without CLI (Dashboard – SQL Editor)**

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor**.
3. Paste the contents of **`supabase/setup_tables_manual.sql`** from this repo.
4. Run the query.

The script is idempotent (safe to run more than once).

**C. Without CLI (Python script)**

If you have **`DATABASE_URL`** in `.env` (from Dashboard → Settings → Database → Connection string):

```bash
# From repo root; backend deps installed (pip install -r backend/requirements.txt)
python scripts/apply_supabase_migration.py
```

This applies the same schema via a direct Postgres connection. After tables and bucket are done, the backend (and worker) are fully functional with Supabase.

## 5. Create the storage bucket

The CLI cannot create storage buckets. Use one of these:

**Option A – One-time script (recommended)**

From the repo root, with `.env` already filled (see step 5):

```bash
# From repo root; ensure backend deps are installed (e.g. pip install -r backend/requirements.txt)
python scripts/create_supabase_bucket.py
```

**Option B – Dashboard**

- In the Supabase project: **Storage → New bucket**.
- Name it exactly **`workspace-files`** (private is typical for signed uploads).

## 6. Environment variables

**Backend** (repo root):

```bash
cp .env.example .env
```

Edit `.env` and set:

- **SUPABASE_URL** – From Dashboard → **Settings → API** → Project URL (used for JWKS URL and Supabase client).
- **SUPABASE_ANON_KEY** – From **Settings → API** → anon public key.
- **SUPABASE_SERVICE_ROLE_KEY** – From **Settings → API** → service_role key (keep secret).
- **REDIS_URL** – e.g. `redis://localhost:6379` (or your Redis URL).

You do **not** need `SUPABASE_JWT_SECRET`; the backend verifies JWTs with Supabase’s signing keys (JWKS).

Optional: `DATABASE_URL` (for Tables setup option C).

**Frontend** (for login and auth):

```bash
cd frontend && cp .env.example .env
```

Edit `frontend/.env` and set:

- **VITE_SUPABASE_URL** – Same as backend SUPABASE_URL.
- **VITE_SUPABASE_ANON_KEY** – Same as backend SUPABASE_ANON_KEY.
- **VITE_API_URL** (optional) – Backend base URL (e.g. `http://localhost:4000`). Defaults to `http://localhost:4000` if unset.

## 7. Run the backend and worker

**API (from repo root or from `backend/`)**

```bash
cd backend
uvicorn app.main:app --reload --port 4000
```

The app will fail on startup if Supabase is unreachable or the `workspace-files` bucket is missing.

**Worker (separate terminal, from `backend/`)**

```bash
cd backend
python worker.py
```

The worker processes jobs from the Redis queue and updates the `actions` table in Supabase (status, result, error).

## Summary

| Step | What you do |
|------|-------------|
| 1 | Create/use project in Supabase Dashboard |
| 2 | **Auth**: Enable Email provider; set Site URL (e.g. `http://localhost:3000`); set frontend `VITE_SUPABASE_*` in `frontend/.env`; no JWT secret needed (backend uses signing keys) |
| 3 | (If using CLI) Install Supabase CLI (or skip and use Dashboard/script for tables) |
| 4 | **Tables**: Choose A (CLI: `login`, `link`, `db push`), B (Dashboard: run `supabase/setup_tables_manual.sql` in SQL Editor), or C (script: `python scripts/apply_supabase_migration.py` with `DATABASE_URL` in `.env`) |
| 5 | Run `python scripts/create_supabase_bucket.py` or create bucket in Dashboard |
| 6 | Set backend and frontend env vars (see section 6) |
| 7 | Run API (`uvicorn`) and worker (`python worker.py`) from `backend/` |

After this, Supabase is set up for auth, tables, and storage. Only logged-in users can use the app and call protected APIs.

## Quick checklist (what else to do)

- **Supabase Dashboard**: Email auth on; **Site URL** and **Redirect URLs** set to your app (e.g. `http://localhost:3000`).
- **Migrations**: Run tables (CLI `db push`, or SQL Editor with `supabase/setup_tables_manual.sql`, or `python scripts/apply_supabase_migration.py`).
- **Bucket**: Create `workspace-files` (script or Storage → New bucket).
- **Backend `.env`**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`. No JWT secret.
- **Frontend `.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_API_URL` (e.g. `http://localhost:4000`).
- **Run**: Backend (`uvicorn`), worker (`python worker.py`), frontend (e.g. `npm run dev`). Sign up and sign in to confirm auth.
