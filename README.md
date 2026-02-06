# Loop AI

Monorepo for the Loop AI project. Frontend lives in `frontend/`.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:8080**.

## Backend setup (Flask + OpenRouter)

Create `backend/.env` (see `backend/.env.example`) and add your OpenRouter key there.

Run the backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Backend runs at **http://localhost:5000** and WebSocket at `ws://localhost:5000/ws`.

## Frontend setup (connect to backend)

Create `frontend/.env` (see `frontend/.env.example`) and set:

```
VITE_BACKEND_WS_URL=ws://localhost:5000/ws
```

Other scripts (from `frontend/`): `npm run build`, `npm run preview`, `npm run lint`, `npm run test`.
