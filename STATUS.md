# TestBuddy — Implementation status

Last updated: 2026-08-05

What is **built and in use** in the repo today. Product vision and remaining phases stay in [`PROJECT_SPEC.md`](./PROJECT_SPEC.md). Run steps: [`Setup.txt`](./Setup.txt).

---

## Phase map (vs `PROJECT_SPEC.md` §12)

| Phase | Spec goal | Status |
|---|---|---|
| 0 | Scaffold extension / backend / AI / frontend | Done |
| 1 | Manual bug CRUD + dashboard list/detail | Done |
| 2 | Recording, screenshots, annotation | Done (core) |
| 3 | AI humanize / polish | Done (service + backend wire-up) |
| 4 | Test Case mode (AI multi-case + verify) | Partial — dashboard CRUD/list for test cases; AI generation / verify flow not complete |
| 5 | Excel / JSON / Jira / ADO | Partial — Excel/JSON/PDF exports + project JSON import; Jira/ADO push UI not finished |
| 6 | Hardening / store review | Not started |

---

## Backend (`backend/`)

- Auth: JWT login / register / me
- Users, organizations, org members, project members
- Projects (create quota for Manager), modules, cycles
- Bugs CRUD, comments, status updates, screenshots storage hooks
- Test cases CRUD (module-scoped)
- Health + extension zip download endpoints
- Seed: Demo Organization, Demo Project, General module, demo users

## AI service (`ai-service/`)

- FastAPI on `:8001`
- Bug title/steps polish + step humanize (Groq / OpenAI / Anthropic via env)
- Called **server-to-server** only (`AI_SERVICE_URL` on backend)

## Extension (`extension/`)

- MV3 + React; **Tester-only** login
- Bug mode: form → record → screenshots → submit
- Pack / load unpacked; zip also served from frontend home / API

## Frontend dashboard (`frontend/`)

### Shell & navigation
- Sidebar + `Shell` layout
- Breadcrumb: hidden on **Projects list**; under a project root crumb is **Projects** → `/projects` (not Home)
- Shared **CommandHeader** (icon, title, subtitle, meta chips, optional pulse, actions)

### Projects page (`/projects`)
- Command header: title + “N projects” chip; Create + **Import Project** (JSON)
- No portfolio context line, no four stat cards, no Bug Health pulse
- Search, list / grid, row selection, bulk bar (**Export selected**)
- Grid: **Select all on this page** + “N shown”
- Kebab: View / Export / Edit / Delete (by role)
- Single-item export → format popup; multi-select → bulk JSON

### Project detail (`/projects/:id`)
- Command header + Bug Health pulse (project-scoped)
- Modules panel: list / grid, select all (list + grid), create module from header
- Single module export popup with **Module Contents** (test cases / bugs / steps)

### Module page (`/projects/:id/modules/:moduleId`)
- Tabs: Bugs | Test Cases
- Command header (module name only — no “Project · Module workspace” context)
- **Customize** view: column visibility, default sort, density, row size (persisted); no Theme Preview
- List / grid; select all on this page (both views)
- Compact **ModuleStatLine** status pills (clickable filters) + filter chips
- Test case / bug assignee: initials avatar + name
- Table columns use proportional widths (no huge empty gap after Title)
- Create / edit / delete test cases (role-gated); bulk + kebab export

### Single-record export modal (`SingleExportModal`)
Shown when exporting **one** project, module, or test case (kebab or exactly one checkbox selected).

| Control | Behavior |
|---|---|
| Formats | Excel (`.xlsx`), JSON (`.json`), PDF (`.pdf`) |
| Contents block | Live counts (project: modules, test cases, bugs, cycles, members, integrations; module: test cases, bugs, steps; test case: steps, expected results, etc.) |
| Details checkbox | Extra fields / steps in the file when checked |
| Multi-select | Still bulk JSON — modal does **not** open |

Shared helper: `frontend/src/utils/recordExport.ts`. Bug PDF/Excel remains `bugExport.ts`.

### Other dashboard pages
- Home (extension download), Login / Register, Organizations, Users, Bugs list/detail, Profile, Settings (as previously shipped)

---

## Notable UI decisions (recent)

1. Projects list is a clean portfolio header — crumbs and secondary metrics removed there only.
2. In-project breadcrumbs start at **Projects** so “up one level” returns to the list.
3. Grid selection matches list: persistent **Select all on this page** header.
4. Export UX matches a format picker with contents summary for single records; bulk stays JSON.

---

## How to verify locally

```text
Backend :8080 · Frontend :5173 · AI :8001 (optional for polish)
Login   : carol@testbuddy.local / password  (Manager)
```

Useful Playwright smoke scripts under `scripts/` (examples):

- `ui-check-breadcrumb.mjs`
- `ui-check-single-export.mjs`
- `ui-check-grid-select-all.mjs`
- `ui-check-table-columns.mjs`
- `ui-check-assignee-avatar.mjs`
- `regression.mjs` (API-focused; backend must be up)

Artifacts land in `.ui-test-artifacts/` (gitignored / local).

---

## Not done yet (do not invent in UI)

- Full Test Case mode AI generation + one-by-one verify queue (Phase 4 remainder)
- Jira / Azure DevOps push from dashboard (Phase 5 remainder)
- Store-review hardening, Edge/Firefox parity checklist (Phase 6)
- Automatic visual bug detection (explicitly out of scope forever — AI only *writes*)
