# Deploy Loop AI (Option A: managed services)

This guide gets the app live using managed platforms: frontend on Vercel/Netlify/Cloudflare, backend + worker + Redis on Railway or Render. Supabase stays as-is (auth, DB, storage).

---

## 1. Supabase (production URLs)

In [Supabase Dashboard](https://supabase.com/dashboard) → your project:

- **Authentication → URL configuration**
  - **Site URL:** your production frontend URL (e.g. `https://loop-ai.vercel.app` or `https://app.yourdomain.com`).
  - **Redirect URLs:** add the same URL (and any paths you use for auth callbacks).

---

## 2. Frontend (Vercel, Netlify, or Cloudflare Pages)

### Vercel

1. Import the repo at [vercel.com](https://vercel.com). Set **Root Directory** to `frontend`.
2. **Environment variables** (for build): add
   - `VITE_API_URL` = your production API URL (e.g. `https://loop-ai-api.onrender.com` or your custom domain).
   - `VITE_SUPABASE_URL` = your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key.
   - `VITE_BACKEND_WS_URL` = your production WebSocket URL (e.g. `wss://loop-ai-api.onrender.com/ws`).
3. Deploy. Vercel uses `frontend/vercel.json` (build + SPA rewrites).

### Netlify

1. Import the repo at [netlify.com](https://netlify.com). Set **Base directory** to `frontend`.
2. **Environment variables:** same as above (`VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_WS_URL`).
3. Deploy. Build settings are in `frontend/netlify.toml`.

### Cloudflare Pages

1. Connect the repo in Cloudflare Pages. Set **Build configuration → Root directory** to `frontend`.
2. **Build command:** `npm run build`. **Build output directory:** `dist`.
3. **Environment variables:** same as above (all `VITE_*`).
4. Add a **Redirect rule** so SPA routing works: Single Page App, or custom rule that serves `index.html` for all paths.

---

## 3. Backend + Worker + Redis (Render)

1. At [render.com](https://render.com), create a **New → Blueprint** and connect this repo.
2. Render will read `render.yaml` and create:
   - **loop-ai-api** (web)
   - **loop-ai-worker** (worker)
   - **loop-ai-redis** (Key Value / Redis)
3. For **loop-ai-api** and **loop-ai-worker**, open each service → **Environment** and set (they are `sync: false` in the blueprint so you must add them):
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `OPENROUTER_API_KEY` = your OpenRouter key
   - **loop-ai-api only:** `CORS_ORIGIN` = your frontend URL (e.g. `https://loop-ai.vercel.app`), `SITE_URL` = same
4. `REDIS_URL` is filled automatically from the Redis instance. Deploy.
5. Copy the **loop-ai-api** URL (e.g. `https://loop-ai-api.onrender.com`) and use it as `VITE_API_URL` and for `VITE_BACKEND_WS_URL` (with `wss://` and `/ws`). Update the frontend env vars and redeploy the frontend if you had used a placeholder.

---

## 4. Backend + Worker + Redis (Railway)

1. At [railway.app](https://railway.app), create a project and add **Redis** from the catalog. Copy the Redis URL (e.g. from the Redis service variables).
2. Add a **service** from this repo. Set **Root Directory** to `backend`.
   - **Build:** Railway often auto-detects Python; ensure build runs `pip install -r requirements.txt`.
   - **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (Railway sets `PORT`).
   - **Environment variables:** add all from `backend/.env.example` (Supabase, OpenRouter, `REDIS_URL` from step 1, `CORS_ORIGIN` and `SITE_URL` = your frontend URL). Do not commit secrets; set them in the Railway dashboard.
3. Add a **second service** from the same repo, same root `backend`. This is the worker.
   - **Start:** `python worker.py`.
   - **Environment variables:** same as the API (Supabase, OpenRouter, `REDIS_URL`); no need for `CORS_ORIGIN` or `SITE_URL`.
4. Expose the first service (API) to get a public URL. Use that URL for `VITE_API_URL` and `VITE_BACKEND_WS_URL` in the frontend.

---

## 5. Checklist

- [ ] Supabase Site URL and Redirect URLs set to production frontend URL.
- [ ] Frontend build env has `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_WS_URL`.
- [ ] API env has `CORS_ORIGIN` and `SITE_URL` = frontend URL, plus Supabase, OpenRouter, and Redis.
- [ ] Worker has Supabase, OpenRouter, and Redis (no CORS/SITE_URL needed).
- [ ] Frontend points to the deployed API URL (and WebSocket URL) and has been redeployed after backend is live.
