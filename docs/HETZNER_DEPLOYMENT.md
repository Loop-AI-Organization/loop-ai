## Hetzner Deployment (Backend + Worker + Redis)

This guide shows how to run the Loop AI backend on a **single Hetzner Cloud VM**
using **Docker** and **docker compose**, and then connect the existing Vercel
frontend to it.

It assumes:

- You already deployed the frontend to Vercel (e.g. `https://frontend-gamma-ten-16.vercel.app`).
- You have Supabase + keys configured (see `backend/.env.example`).

---

### 1. Create a Hetzner server

1. In the Hetzner Cloud console, create a new **Ubuntu 22.04** server (2 GB RAM is fine to start).
2. Add your **SSH key** so you can log in as `root` (or another user) without a password.
3. Make sure the server has a **public IP**.
4. (Optional, recommended) Point a DNS record such as `api.loop-ai.yourdomain.com`
   to the server's public IP.

SSH in:

```bash
ssh root@YOUR_SERVER_IP
```

---

### 2. Install Docker and docker compose

On the server:

```bash
apt update
apt install -y ca-certificates curl gnupg lsb-release

mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker
```

Verify:

```bash
docker version
docker compose version
```

---

### 3. Clone the repo on the server

Pick a directory (e.g. `/opt`):

```bash
cd /opt
git clone https://github.com/Loop-AI-Organization/loop-ai.git
cd loop-ai/backend
```

If this is a private repo, use SSH instead of HTTPS.

---

### 4. Create the repo root `.env` file

`docker-compose.prod.yml` loads **`../.env`** (the file at **`loop-ai/.env`**, one level above `backend/`). Create or edit that file based on [`backend/.env.example`](backend/.env.example) so both `api` and `worker` receive secrets without maintaining a separate `backend/.env`.

Minimum variables:

```bash
SUPABASE_URL=...                # From Supabase dashboard
SUPABASE_ANON_KEY=...           # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase service_role key

OPENROUTER_API_KEY=...          # From OpenRouter
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_MAX_TOKENS=1024
OPENROUTER_TEMPERATURE=0.7

PORT=4000
REDIS_URL=redis://redis:6379

# Frontend URL (no trailing slash)
# Use your exact production Vercel origin(s), comma-separated when needed.
CORS_ORIGIN=https://loopai-project.vercel.app,https://www.loopai-project.me
SITE_URL=https://loopai-project.vercel.app
```

> **Important:** Do **not** commit this `.env` to git. It should only live on the server.

---

### 5. Start the backend stack with docker compose

From `loop-ai/backend` on the server:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This will start:

- `api` – FastAPI backend on port **4000** (exposed on the host).
- `worker` – background worker using the same image.
- `redis` – Redis, internal only.

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api --tail=100
```

Test from the server:

```bash
curl http://localhost:4000/
```

If you have a domain pointing at the server and port 4000 exposed, you can also
test from your laptop:

```bash
curl http://YOUR_SERVER_IP:4000/
```

Later you can put Nginx/Caddy in front for HTTPS and map a domain like
`https://api.loop-ai.yourdomain.com`, but HTTP on port 4000 is enough to get
the project working.

If Nginx sits in front of the API, raise proxy timeouts for long `@ai` requests; otherwise the browser may show a pending request until Nginx closes it (check `/var/log/nginx/error.log` for `upstream timed out`). Copy directives from [`backend/deploy/nginx-api-timeouts.conf.example`](../backend/deploy/nginx-api-timeouts.conf.example) into your `location` block for the API.

---

### 6. Point Vercel frontend to the Hetzner backend

Decide which URL the frontend will use. For example, if you're just using the
server IP and port 4000 for now:

- `VITE_API_URL=http://YOUR_SERVER_IP:4000`
- `VITE_BACKEND_WS_URL=ws://YOUR_SERVER_IP:4000/ws`

If you later add HTTPS and a domain (`https://api.loop-ai.yourdomain.com`):

- `VITE_API_URL=https://api.loop-ai.yourdomain.com`
- `VITE_BACKEND_WS_URL=wss://api.loop-ai.yourdomain.com/ws`

Set these in Vercel (dashboard or CLI) and redeploy the frontend.

---

### 7. Supabase configuration

In Supabase dashboard:

- **Authentication → URL configuration**
  - **Site URL**: your Vercel frontend URL, e.g.
    `https://frontend-gamma-ten-16.vercel.app`
  - **Redirect URLs**: include the same URL (and any auth callback paths).

---

### 8. Operating the deployment

- **Restart after code changes**:

  ```bash
  cd /opt/loop-ai/backend
  git pull
  docker compose -f docker-compose.prod.yml up -d --build
  ```

- **View logs**:

  ```bash
  docker compose -f docker-compose.prod.yml logs api --tail=200
  docker compose -f docker-compose.prod.yml logs worker --tail=200
  ```

  `@ai` triage logs phases as `triage phase=...` on the `api` service so you can see whether the hang is before navigation, file intent, or full response generation.

- **Verify env and Redis queue from a container**:

  ```bash
  docker compose -f docker-compose.prod.yml exec api python scripts/verify_runtime_env.py
  docker compose -f docker-compose.prod.yml exec worker python scripts/verify_runtime_env.py
  docker compose -f docker-compose.prod.yml exec api python scripts/smoke_rq_enqueue.py
  ```

- **Verify API enqueue path from outside the container**:

  ```bash
  export API_URL=https://api.loopai-project.me
  export ACCESS_TOKEN='YOUR_SUPABASE_JWT'
  curl -i -X POST "$API_URL/api/actions" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"thread_id":"__smoke_thread__","label":"__smoke_label__"}'
  ```

- **Smoke-test triage endpoint end-to-end**:

  ```bash
  export API_URL=https://api.loopai-project.me
  export ACCESS_TOKEN='YOUR_SUPABASE_JWT'
  export CHANNEL_ID='YOUR_CHANNEL_UUID'
  export TRIAGE_MESSAGE='@ai summarize what we discussed today'
  python backend/scripts/smoke_triage_request.py
  ```

- **Stop the stack**:

  ```bash
  docker compose -f docker-compose.prod.yml down
  ```

This should give your professor full control over the Hetzner VM and billing,
while keeping the deployment reproducible and simple for the team.

