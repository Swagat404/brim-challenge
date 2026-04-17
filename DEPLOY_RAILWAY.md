# Deploying Sift to Railway

Two services in one Railway project — backend (FastAPI) and frontend (Next.js).
Both build from the same GitHub repo with different root directories.

---

## Prerequisites

- Railway CLI installed: `npm i -g @railway/cli` (already done)
- A Railway account with a project created (project ID required)
- Anthropic API key

## One-time setup

### 1. Authenticate

```bash
railway login
```

Opens a browser for OAuth. After login, `railway whoami` should print your email.

### 2. Link the local repo to your Railway project

```bash
cd "/Users/swagatbhowmik/CS projects/BRIM challenge"
railway link
```

Pick the project (or paste a project ID when prompted). If you have a project
share code (e.g. `694399`), use:

```bash
railway link --project <project-id>
```

> Note: Railway project IDs are usually UUIDs. If `694399` is a join/share
> code, accept the project invite from the link Railway sent you, then run
> `railway link` and pick the project from the menu.

---

## Create the two services

In the Railway dashboard for your project:

1. Click **+ New** → **Empty Service** → name it `backend`. Settings:
   - **Source repo**: connect to GitHub → pick `Swagat404/brim-challenge`
   - **Root directory**: `backend`
   - **Watch paths**: `backend/**` (so frontend changes don't redeploy backend)
2. Click **+ New** → **Empty Service** → name it `frontend`. Same source repo.
   - **Root directory**: `frontend`
   - **Watch paths**: `frontend/**`

Both services will pick up their `railway.json` (already committed) for build
and start commands.

---

## Environment variables

### `backend` service

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` (your real key) |
| `CORS_ORIGINS` | the frontend public URL, e.g. `https://frontend-production-xxxx.up.railway.app` |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` (optional override) |
| `DB_PATH` | leave empty — the DB lookup auto-falls-back to `backend/brim_expenses.db` |

Set these in the dashboard under **Variables** or via CLI:

```bash
railway variables --service backend \
  --set ANTHROPIC_API_KEY=sk-ant-... \
  --set CORS_ORIGINS=https://frontend-production-xxxx.up.railway.app
```

### `frontend` service

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the backend public URL, e.g. `https://backend-production-yyyy.up.railway.app` |
| `NEXT_PUBLIC_STREAM_API_URL` | same as `NEXT_PUBLIC_API_URL` (used by SSE chat streaming) |

```bash
railway variables --service frontend \
  --set NEXT_PUBLIC_API_URL=https://backend-production-yyyy.up.railway.app \
  --set NEXT_PUBLIC_STREAM_API_URL=https://backend-production-yyyy.up.railway.app
```

> The chicken-and-egg: you need to deploy each service once to get its
> public URL, then set the cross-references and redeploy. See "Deploy
> order" below.

---

## Deploy order (first-time)

```bash
# 1. Push the latest code (already done)
git push origin main

# 2. Deploy backend first (no env deps on frontend yet)
railway up --service backend
# → wait for the build, copy the public URL Railway assigns

# 3. Set NEXT_PUBLIC_API_URL on the frontend, then deploy
railway variables --service frontend \
  --set NEXT_PUBLIC_API_URL=https://<backend-url> \
  --set NEXT_PUBLIC_STREAM_API_URL=https://<backend-url>
railway up --service frontend
# → wait for the build, copy the frontend public URL

# 4. Add the frontend URL to backend's CORS_ORIGINS, redeploy backend
railway variables --service backend \
  --set CORS_ORIGINS=https://<frontend-url>
railway up --service backend
```

After the second backend deploy, both services know about each other and
the app is live at the frontend URL.

---

## Subsequent deploys

GitHub-connected services auto-deploy on push to `main`. To deploy manually:

```bash
railway up --service backend    # backend only
railway up --service frontend   # frontend only
```

To tail logs:

```bash
railway logs --service backend
railway logs --service frontend
```

---

## What ships in the deploy

- **Backend**: code + `requirements.txt` + the seeded `brim_expenses.db`
  (1.8MB, committed) + the seeded `uploads/receipts/` PNGs (7.5MB,
  committed).
- **Frontend**: Next.js app + the docs screenshots + the welcome-page
  cube shader + the Ask Sift demo video (`ask-sift-demo.mp4`, 22MB).

Receipt uploads at runtime will land in the container's filesystem and
**will not survive a redeploy** — Railway containers are ephemeral. For
the demo this is fine because the seeded receipts always come back. For
persistence, attach a Railway Volume mounted at `/app/uploads`.

---

## Health check

The backend exposes `GET /health` which returns transaction count + last
date. Railway is configured to hit it after each deploy
(`healthcheckPath` in `backend/railway.json`).

---

## Rollback

```bash
railway down --service <name>      # take a service offline
railway redeploy --service <name>  # redeploy the previous successful image
```

Or use the Railway dashboard's "Deployments" tab → click any green
deployment → "Redeploy".
