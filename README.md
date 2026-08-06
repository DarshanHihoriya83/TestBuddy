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

Built through early Phase 5 (dashboard + exports). Recording / AI / Jira·ADO push remain per `PROJECT_SPEC.md` phases.

### Platform & access
- Organizations → projects → modules → bugs / test cases
- Dashboard RBAC: SuperAdmin, Manager, Developer, Tester
- Org membership + project membership; Manager project create quotas
- Users page: role assign / transfer; SuperAdmin hard-delete after deactivate
- Extension Bug mode end-to-end (Tester-only sign-in)
- Recording toolbar, screenshots, AI polish / step humanize (when AI service is up)

### Frontend dashboard (Projects → Module workspace)
- Shared **CommandHeader** on Projects, Project detail, and Module pages
- Projects list page: no top breadcrumb; header shows title + project count only (no portfolio subtitle, no stat cards, no Bug Health ring)
- Breadcrumbs under a project: root is **Projects** (links to `/projects`), not Home — e.g. `Projects › Demo Project100 › General`
- Project detail + Module: list / grid views; **Select all on this page** on both list and grid
- **Import Project** (JSON) under Create Project
- Module page: Bugs + Test Cases tabs, Customize view (columns / sort / density / row size), compact **ModuleStatLine** filters
- Assignee column: initials avatar + name (bugs + test cases, list + grid)

### Export
- **Single export popup** (Excel / JSON / PDF) from row kebab, or when exactly one checkbox is selected then Export selected
- Popup shows entity preview + **Contents** counts (e.g. modules / bugs / test cases) + optional details checkbox
- Multi-select export stays bulk JSON (projects / modules / test cases)
- Bug export: PDF + Excel (with screenshots) via existing bug export flow

### Docs & run
- Spec: [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) · conventions: [`.cursor/rules/architecture.mdc`](./.cursor/rules/architecture.mdc)
- Local setup: [`Setup.txt`](./Setup.txt) · progress detail: [`STATUS.md`](./STATUS.md)

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
