# Supabase setup (Loop AI backend)

This doc covers a full Supabase setup so the backend is fully functional (tables, storage, env).

## 1. Create or use a Supabase project

- Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a project (or use an existing one).
- Note your **Project ref** (ID in the URL: `https://supabase.com/dashboard/project/<project-ref>`).
- In **Settings → Database**, note or set your **database password** (you’ll need it to link the CLI).

## 2. Install Supabase CLI

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

## 3. Tables setup (choose one)

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

## 4. Create the storage bucket

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

## 5. Environment variables

From the repo root:

```bash
cp .env.example .env
```

Edit `.env` and set:

- **SUPABASE_URL** – From Dashboard → **Settings → API** → Project URL.
- **SUPABASE_ANON_KEY** – From **Settings → API** → anon public key.
- **SUPABASE_SERVICE_ROLE_KEY** – From **Settings → API** → service_role key (keep secret).
- **REDIS_URL** – e.g. `redis://localhost:6379` (or your Redis URL).

Optional: `DATABASE_URL` (needed for **Tables setup option C** – script), `SUPABASE_JWT_SECRET` (see `.env.example`).

## 6. Run the backend and worker

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
| 2 | (If using CLI) Install Supabase CLI (or skip and use Dashboard/script for tables) |
| 3 | **Tables**: Choose A (CLI: `login`, `link`, `db push`), B (Dashboard: run `supabase/setup_tables_manual.sql` in SQL Editor), or C (script: `python scripts/apply_supabase_migration.py` with `DATABASE_URL` in `.env`) |
| 4 | Run `python scripts/create_supabase_bucket.py` or create bucket in Dashboard |
| 5 | Copy `.env.example` to `.env` and fill Supabase + Redis vars |
| 6 | Run API (`uvicorn`) and worker (`python worker.py`) from `backend/` |

After this, Supabase is fully set up for tables and storage, and the backend uses it end-to-end.
