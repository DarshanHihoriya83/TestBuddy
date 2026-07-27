# TestBuddy

AI-powered bug capture & test-case generator — browser extension + platform.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full product specification.
Architecture conventions live in [`.cursor/rules/architecture.mdc`](./.cursor/rules/architecture.mdc).

## Repo layout

| Folder | Role |
|---|---|
| `extension/` | Chrome/Edge/Firefox MV3 extension (React + TypeScript) |
| `backend/` | Java Spring Boot API + JWT + JPA |
| `ai-service/` | Python FastAPI AI microservice (hello-world until Phase 3) |
| `frontend/` | React dashboard (Vite + TanStack Query + Tailwind) |

## Current status

- Manual + recorded Bug mode end-to-end (extension → API → dashboard)
- Recording: on-page toolbar with live event count, pause/resume/stop
- User registration + login (JWT), user profile page
- PostgreSQL database `testbuddy`

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
./mvnw spring-boot:run
```

Uses PostgreSQL `localhost:5432/testbuddy` (admin/admin) by default.
No Postgres available? Fall back to H2: `./mvnw spring-boot:run "-Dspring-boot.run.arguments=--spring.profiles.active=h2"`

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
