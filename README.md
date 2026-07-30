# TestBuddy

AI-powered bug capture & test-case generator — browser extension + platform.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full product specification.
Architecture conventions live in [`.cursor/rules/architecture.mdc`](./.cursor/rules/architecture.mdc).

## Repo layout

| Folder | Role |
|---|---|
| `extension/` | Chrome/Edge/Firefox MV3 extension (React + TypeScript) |
| `backend/` | Node.js Express API + JWT + PostgreSQL |
| `ai-service/` | Python FastAPI AI microservice (hello-world until Phase 3) |
| `frontend/` | React dashboard (Vite + TanStack Query + Tailwind) |

## Current status

- Manual + recorded Bug mode end-to-end (extension → API → dashboard)
- Recording: on-page toolbar with live event count, pause/resume/stop
- Screenshot capture with drag-to-highlight rectangle on the page
- Bug overview text can auto-generate a recorded step
- User registration + login (JWT), user profile page
- Light-themed React dashboard (teal accent, no third-party branding)
- PostgreSQL database `testbuddy`
- Node.js Express backend (replaced earlier Java/Spring Boot prototype)

## Recent updates (30 Jul 2026)

### Backend — Node.js rewrite
- Replaced Java/Spring Boot with **Express + `pg` + JWT + bcrypt** under `backend/`
- Same REST API surface (~20 endpoints): auth, projects, cycles, bugs CRUD, extension download
- Seed data on first start; config via `backend/.env` (see `.env.example`)

### Extension — recording fixes (v0.3.0)
- Fixed duplicate on-page toolbar (UI only in top frame; iframes still capture events)
- Broader click/input capture (custom buttons, ARIA roles, `tabindex`, etc.)
- Serialized step writes so rapid actions are not dropped
- **Screenshot** button → visible-tab capture → red highlight overlay → step saved
- **Bug overview** field can build a step from your description
- `npm run pack` outputs zip to `frontend/public/` and `backend/public/downloads/`

### Frontend — UI refresh
- Switched from dark/red theme to a **clean light dashboard** (slate + teal `#0d9488`)
- Removed all third-party YouTube/branding references
- Updated home, auth (login/register), sidebar shell, bugs/projects/profile pages
- Shared utility classes in `frontend/src/index.css` (`.tb-card`, `.tb-btn-primary`, etc.)

### Regression / smoke scripts
From repo root (backend must be running on `:8080`):

```bash
node scripts/regression.mjs          # API + extension artifact checks
node scripts/smoke-recording-api.mjs # quick recording-related API smoke test
```

## Quick start

### Database (PostgreSQL)

Local PostgreSQL with role `admin` / password `admin` and database `testbuddy`
(created automatically by the setup below if missing):

```sql
CREATE ROLE admin LOGIN PASSWORD 'admin';
CREATE DATABASE testbuddy OWNER admin;
```

### Backend (port 8080)

```bash
cd backend
npm install
npm run dev
```

Uses PostgreSQL `localhost:5432/testbuddy` (admin/admin) by default.
Copy `.env.example` to `.env` to override.

Seeded users (password for all: `password`):

- `admin@testbuddy.local` (ADMIN)
- `alice@testbuddy.local` (TESTER)
- `bob@testbuddy.local` (DEVELOPER)
- `carol@testbuddy.local` (MANAGER)

New users can also self-register at `/register` (or `POST /api/auth/register`).

### Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to the backend.

### Extension

```bash
cd extension
npm install
npm run pack   # builds dist/ and writes TestBuddy-extension.zip to frontend/public + backend static
```

Or load `extension/dist` directly as unpacked.

**Home page download:** open http://localhost:5173/ → **Download extension (.zip)** → unzip → Chrome Load unpacked → select the `TestBuddy` folder inside the zip.

Also available without the Vite app: http://localhost:8080/api/extension/download

### AI service (hello-world only)

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
