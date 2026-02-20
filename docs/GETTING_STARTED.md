# Get Loop AI running

Follow these steps in order. When done, you’ll have the app running with real Supabase data and auth.

---

## 1. Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and create a project (or use an existing one).
2. **Auth**: **Authentication → Providers** → enable **Email**.
3. **URLs**: **Authentication → URL Configuration**  
   - **Site URL**: `http://localhost:8080` (this app’s frontend port by default; see step 7).  
   - **Redirect URLs**: add the same (e.g. `http://localhost:8080`).
4. **API keys**: **Settings → API** — you’ll need:
   - Project URL  
   - `anon` (public) key  
   - `service_role` key (keep secret)

---

## 2. Database tables

**Option A – SQL Editor (simplest)**  
1. In your project: **SQL Editor**.  
2. Open `supabase/setup_tables_manual.sql` in this repo.  
3. Copy its full contents into the editor and **Run**.  
   (Creates `workspaces`, `channels`, `threads`, `messages`, `actions`, `auth_events` and RLS.)

**Option B – Supabase CLI**  
From repo root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

(Use your project ref from the dashboard URL.)

---

## 3. Storage bucket

**Option A – Dashboard**  
**Storage → New bucket** → name: **`workspace-files`** (private is fine).

**Option B – Script** (with backend env set):

```powershell
cd c:\Users\adith\dev\loop-ai
pip install -r backend/requirements.txt
python scripts/create_supabase_bucket.py
```

---

## 4. Environment variables

There are **two** env files: repo root `.env` (backend) and `frontend/.env` (frontend). Vite only reads from `frontend/` and only exposes variables prefixed with `VITE_`, so the frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`. To avoid maintaining both, use the sync script so you only edit the root `.env`.

**Single source of truth (recommended):**

1. Create and edit the **root** `.env`:

```powershell
cd c:\Users\adith\dev\loop-ai
copy .env.example .env
```

Edit `.env` and set:

- `SUPABASE_URL` = Project URL from **Settings → API**
- `SUPABASE_ANON_KEY` = anon key
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key
- `REDIS_URL` = `redis://localhost:6379` (or your Redis URL)

2. Sync to the frontend (writes `frontend/.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from root `.env`):

```powershell
node scripts/sync-env.js
```

Restart the frontend dev server after syncing. From now on, only update the root `.env` and re-run `node scripts/sync-env.js` when you change Supabase URL or anon key.

**Manual frontend env (alternative):**  
If you prefer not to use the script, create `frontend/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same values as `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the root `.env`. Optional: `VITE_API_URL` = `http://localhost:4000`.

---

## 5. Install dependencies

**Backend:**

```powershell
cd c:\Users\adith\dev\loop-ai\backend
pip install -r requirements.txt
```

**Frontend:**

```powershell
cd c:\Users\adith\dev\loop-ai\frontend
npm install
```

---

## 6. Run Redis (if local)

The backend and worker expect Redis. If you use a local Redis:

- **Windows**: install Redis (e.g. [Redis for Windows](https://github.com/microsoftarchive/redis/releases) or WSL) and start it, or use a cloud Redis and set `REDIS_URL` in `.env`.

---

## 7. Run the app

Use **three** terminals.

**Terminal 1 – Backend API**

```powershell
cd c:\Users\adith\dev\loop-ai\backend
uvicorn app.main:app --reload --port 4000
```

Wait until you see something like `Uvicorn running on http://0.0.0.0:4000`.  
If it fails with “bucket … missing”, create the `workspace-files` bucket (step 3).

**Terminal 2 – Worker** (optional for actions; needed for background jobs)

```powershell
cd c:\Users\adith\dev\loop-ai\backend
python worker.py
```

**Terminal 3 – Frontend**

```powershell
cd c:\Users\adith\dev\loop-ai\frontend
npm run dev
```

Note the URL (this project uses **port 8080** by default in `vite.config.ts`, so it’s often `http://localhost:8080`). In Supabase **Authentication → URL Configuration**, set **Site URL** and **Redirect URLs** to that URL (e.g. `http://localhost:8080`). If you prefer port 3000, set `server: { port: 3000 }` in `frontend/vite.config.ts` and use `http://localhost:3000` in Supabase.

---

## 8. Verify everything works

1. **Backend health**  
   Open: [http://localhost:4000/health](http://localhost:4000/health)  
   You should see something like `{"status":"ok"}`.

2. **Frontend**  
   Open the dev server URL (default: `http://localhost:8080`).  
   You should be redirected to `/login`.

3. **Sign up**  
   - Go to **Sign up**, enter email and password (min 6 chars).  
   - Submit.  
   - If email confirmation is off: you’re redirected to `/app` and see “My Workspace” and “general”.  
   - If confirmation is on: you see a “Check your email” message; confirm, then go to **Sign in**.

4. **Sign in**  
   Use the same email/password. You should land on `/app` with your workspace and channel.

5. **Real data**  
   - Click **New thread** (or type in the composer and send).  
   - Send a message.  
   - Refresh the page: you should still see your workspace, thread, and message (stored in Supabase).

6. **Second user (optional)**  
   Sign out, sign up with another email, sign in. You should see a new workspace with no threads from the first user (RLS is working).

---

## Troubleshooting

| Issue | What to do |
|--------|------------|
| Backend fails: “bucket … missing” | Create bucket `workspace-files` in Supabase **Storage** (step 3). |
| Backend fails: Supabase / env | Check `.env` in repo root: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. |
| Frontend: “Missing VITE_SUPABASE_URL” or white screen | Run `node scripts/sync-env.js` from repo root (after setting root `.env`), or set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env`. Restart the frontend dev server. |
| Login redirects in a loop or wrong URL | Set **Site URL** and **Redirect URLs** in Supabase **Authentication → URL Configuration** to your frontend URL (e.g. `http://localhost:8080`). |
| After login, “Loading your workspaces…” forever or error | 1) Run the DB setup (step 2). 2) In Supabase **SQL Editor**, confirm tables `workspaces`, `channels`, `threads`, `messages` exist. |
| Worker fails: Redis connection | Start Redis or set `REDIS_URL` to a running Redis instance. |
| 401 on API calls from frontend | Backend uses Supabase JWKS; no JWT secret needed. Ensure the frontend sends the Supabase session (it does if you’re logged in). |

---

## Quick reference

| What | Where |
|------|--------|
| Backend env | Repo root `.env` |
| Frontend env | `frontend/.env` (or run `node scripts/sync-env.js` from root after editing root `.env`) |
| Tables / RLS | `supabase/setup_tables_manual.sql` or `supabase/migrations/` + `db push` |
| Bucket name | `workspace-files` |
| API port | 4000 |
| Frontend dev | `npm run dev` (default port 8080 in `frontend/vite.config.ts`) |
