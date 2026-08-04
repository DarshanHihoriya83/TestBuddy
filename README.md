# TestBuddy

AI-powered bug capture & test-case generator — browser extension + platform.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full product specification.
Architecture conventions live in [`.cursor/rules/architecture.mdc`](./.cursor/rules/architecture.mdc).
Local run steps: [`Setup.txt`](./Setup.txt).

## Repo layout

| Folder | Role |
|---|---|
| `extension/` | Chrome/Edge/Firefox MV3 extension (React + TypeScript) — **Tester login only** |
| `backend/` | Node.js Express API + JWT + PostgreSQL |
| `ai-service/` | Python FastAPI AI microservice (bug polish + step humanize) |
| `frontend/` | React dashboard (Vite + TanStack Query + Tailwind) |

## Current status

- Organizations → projects → modules → bugs
- Extension Bug mode end-to-end (Tester-only sign-in)
- Recording toolbar, screenshots, AI polish / step humanize
- Dashboard RBAC: SuperAdmin, Manager, Developer, Tester
- Role transfer (SuperAdmin / Manager)
- Bug comments + status updates for Developer & Tester
- PDF / Excel bug export; JSON import/export APIs

## Roles (summary)

| Action | SuperAdmin | Manager | Tester | Developer |
|---|---|---|---|---|
| Create organization | yes | — | — | — |
| Org members | yes | yes | — | — |
| Create project | yes | yes | — | — |
| Modules CRUD | yes | yes | yes | — |
| Create bug | yes | yes | yes | — |
| Full bug edit/delete | yes | yes | edit only | — |
| Bug status / comments | yes | yes | yes | yes |
| User CRUD / role assign | yes | yes* | — | — |
| Extension login | — | — | **yes** | — |

\* Manager assigns Manager / Developer / Tester  

## Quick start

### Database

```sql
CREATE ROLE admin LOGIN PASSWORD 'admin';
CREATE DATABASE testbuddy OWNER admin;
```

### Backend (`:8080`)

```bash
cd backend
npm install
npm run dev
```

Seeded users (password: `password`):

- `superadmin@testbuddy.local` — SUPERADMIN  
- `carol@testbuddy.local` — MANAGER  
- `bob@testbuddy.local` — DEVELOPER  
- `alice@testbuddy.local` — TESTER  

### Frontend (`:5173`)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` → backend.

### Extension (Tester only)

```bash
cd extension
npm install
npm run pack
```

Load `extension/dist` (or unzip `TestBuddy-extension.zip`). Sign in as **alice@testbuddy.local** / `password`.

### AI service (`:8001`)

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Set `AI_SERVICE_URL=http://127.0.0.1:8001` in `backend/.env`.

## Regression

```bash
node scripts/regression.mjs
```

Backend must be running on `:8080`.
