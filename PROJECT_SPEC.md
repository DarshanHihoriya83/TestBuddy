# ReproScribe — Build Specification & Cursor Agent Prompt

**AI-powered bug capture & test-case generator — browser extension + platform**

> Working name: **ReproScribe**. Checked in search — came back clean, no direct product collisions found. Verify domain/trademark yourself before committing; find-and-replace it everywhere in this doc if you pick a different name.

---

## 0. How to use this document

1. Drop this whole file into your repo root as `PROJECT_SPEC.md`.
2. Cursor (2026) reads project context best from `.cursor/rules/*.mdc` files rather than one giant pasted prompt — once the repo exists, split Sections 2–4 (stack, architecture, data models) into a rule file (e.g. `.cursor/rules/architecture.mdc`) so every future Cursor session in this repo already knows your conventions. The legacy single `.cursorrules` file still works if you'd rather keep it simple.
3. **Don't hand Cursor this whole spec and say "build it."** A 4-service product (extension + backend + AI service + frontend) with two external integrations is a multi-week build even with AI help. Work through Section 12 (Build Phases) one phase at a time — give Cursor the phase, let it finish and get tested, then move on. Section 13 has a ready-to-paste opening message for Phase 0/1.

---

## 1. What we're building

A browser extension (Chrome, Edge, Firefox) that records what a tester does on a webpage — clicks, typed input, navigation — and turns the recording into either:

- **Bug mode:** a bug report with plain-English reproduction steps, an AI-written expected result, an annotated screenshot, and a screen-recording video.
- **Test Case mode:** a formalized test case for the recorded flow, plus several additional AI-generated positive and negative test case variations, reviewed one-by-one before upload.

Either way, the finished item can be exported (Excel/JSON) or pushed straight into Jira / Azure DevOps.

**Scope note for the AI layer:** its job is *writing*, not *seeing*. It turns a structured log of recorded actions into readable sentences, writes a plausible expected result, and drafts extra test case variations from a text description. It does **not** do automatic visual bug detection — a human always identifies and highlights the actual defect on the screenshot.

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Browser extension | TypeScript + React, Manifest V3 | Extensions can only run JS/TS — a browser platform rule, not a stack choice. Use `webextension-polyfill` so the same code runs on Chrome, Edge, and Firefox (Firefox has supported MV3 since Firefox 109, alongside continued MV2 support). |
| Backend API | Node.js, Express, PostgreSQL (`pg`), JWT, bcrypt | |
| AI microservice | Python 3.11+, FastAPI, an LLM API (Claude or OpenAI both work) | Internal-only service, called by the backend — never exposed to the browser directly. |
| Frontend dashboard | React + TypeScript, Vite, TanStack Query, Tailwind CSS | This is the "our application" the spec references — where users/projects/cycles are managed and bugs/test cases get reviewed. |
| File storage | S3-compatible object storage (AWS S3 / Azure Blob / MinIO locally) | Videos and screenshots — don't store large binaries in Postgres. |
| Integrations | Jira REST API v3, Azure DevOps REST API, Apache POI (Excel) | |

---

## 3. Architecture

```
Browser Extension (TS/React, content script + popup)
        │  REST/HTTPS (JWT)
        ▼
Node Backend API (Express) ───────► PostgreSQL
        │  internal REST                  ▲
        ▼                                  │
Python AI Service (FastAPI)                │
        │  calls LLM API                   │
        ▼                                  │
   returns humanized steps,                │
   expected results,                       │
   generated test cases  ──────────────────┘

Node Backend API
        ├──► Object Storage (video/screenshots)
        ├──► Jira REST API
        └──► Azure DevOps REST API

React Frontend Dashboard ──► same Node Backend API
   (bugs, test cases, users, projects, cycles, integration settings)
```

---

## 4. Data model

Implement as JPA `@Entity` classes in the backend; mirror as TypeScript interfaces in the frontend and extension so the shapes match end-to-end.

```typescript
interface User {
  id: string; name: string; email: string;
  role: "SUPERADMIN" | "MANAGER" | "TESTER" | "DEVELOPER";
}

interface Project {
  id: string; name: string;
  jiraProjectKey?: string; adoOrgUrl?: string; adoProject?: string;
}

interface Cycle {                  // release cycle / sprint / test cycle — dropdown defaults to Cycle 1
  id: string; projectId: string; name: string;   // "Cycle 1", "Cycle 2"…
  isDefault: boolean; startDate?: string; endDate?: string;
}

interface Step {
  order: number;
  actionType: "click" | "input" | "navigate" | "select" | "check" | "submit";
  elementLabel: string;             // "Submit button", "Email field"
  selector: string;                 // internal debugging use only
  valueEntered?: string;            // masked "••••" for password/sensitive fields — see §5.6
  pageUrl: string;
  description: string;              // AI-written plain-English sentence, editable
  expectedResult?: string;          // AI-written, editable
  screenshotId?: string;
}

interface Annotation {
  tool: "rectangle" | "ellipse" | "arrow" | "freehand" | "text" | "blur";
  x: number; y: number; width?: number; height?: number;
  color: string; text?: string;
  linkedStepOrder?: number;
}

interface Attachment {
  id: string; type: "screenshot" | "video"; url: string;
  annotations?: Annotation[];
}

interface Bug {
  id: string; title: string; description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  severity: "MINOR" | "MAJOR" | "CRITICAL" | "BLOCKER";
  assigneeId: string; reporterId: string; cycleId: string; projectId: string;
  status: "NEW" | "OPEN" | "IN_PROGRESS" | "FIXED" | "VERIFIED" | "CLOSED" | "REOPENED";
  steps: Step[]; video?: Attachment; screenshots: Attachment[];
  externalRefs?: { jiraIssueKey?: string; adoWorkItemId?: string };
  createdAt: string; updatedAt: string;
}

interface TestCase {
  id: string; title: string; flowDescription: string;   // description entered before recording
  type: "POSITIVE" | "NEGATIVE";
  preconditions?: string; steps: Step[];
  priority: "LOW" | "MEDIUM" | "HIGH";
  cycleId: string; projectId: string;
  status: "AI_DRAFT" | "VERIFIED" | "REJECTED" | "UPLOADED";
  generatedByAi: boolean; linkedBugId?: string;
  externalRefs?: { jiraIssueKey?: string; adoWorkItemId?: string };
  createdAt: string; updatedAt: string;
}
```

---

## 5. Browser extension — detailed requirements

### 5.1 Pre-recording form (popup)
Mode toggle: **Bug** / **Test Case**, then:
- Title, Description
- Priority dropdown, Severity dropdown
- Assignee dropdown — populated from `GET /api/users`
- Cycle dropdown — populated from `GET /api/cycles?projectId=`, pre-selected to the cycle where `isDefault = true` ("Cycle 1")
- "Start Recording" button

### 5.2 Recording engine
- **Steps:** a content script listens for `click`, `input`, `change`, `submit` on the page, capturing element + label + value + URL for each — this raw log gets sent to the AI service (§8.1) to become the `description` text.
- **Video:** use `chrome.tabCapture` to record just the active tab via `MediaRecorder` (webm) — this avoids the OS-level "choose what to share" picker, since capture is scoped to the current tab. Fall back to `getDisplayMedia()` (which does show that picker) only if you need to capture beyond the tab, or if Firefox parity gaps show up — verify current per-browser support when you reach this phase, extension capture APIs have had cross-browser gaps historically.
- **Screenshots:** `chrome.tabs.captureVisibleTab()`, either on-demand (hotkey/button) or auto-captured around each step.
- A small floating recording toolbar stays visible during capture: pause / stop / take-screenshot.

### 5.3 Screenshot annotation
Canvas-based overlay (e.g. `fabric.js` or `konva.js` inside the React popup/editor) with tools: **Rectangle, Ellipse/Round, Arrow, Freehand, Text label, Blur/redact**. Each annotation attaches to that screenshot's `Annotation[]`.

### 5.4 Post-recording review & actions
Stop Recording opens a review screen: editable auto-written steps list, editable expected result, screenshot thumbnails, video preview. Actions:
- Upload to platform (`POST /api/bugs` or `/api/testcases`)
- Export Excel / Export JSON (local download)
- Push to Jira / Push to Azure DevOps
- Clear (discard & reset)

### 5.5 Manifest sketch
```json
{
  "manifest_version": 3,
  "name": "ReproScribe",
  "permissions": ["activeTab", "scripting", "storage", "tabCapture"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```
Add `desktopCapture` only if you implement the full-screen fallback. On the Firefox build, add `browser_specific_settings.gecko.id` and swap the service worker for an event page per the WebExtensions docs. Both Chrome Web Store and Firefox Add-ons manually review sensitive permissions like these — write the privacy-policy/permission-justification copy early, not right before submission.

### 5.6 Privacy — non-negotiable
Never record or upload the raw value of password fields or anything `type="password"` / marked autocomplete-sensitive. Store `"••••"` in the step instead, and auto-blur those screen regions in captured screenshots by default.

---

## 6. Test Case mode — additional behavior

1. Same pre-recording form; the Description field here represents the flow/feature being tested.
2. User performs the primary (happy-path) flow — recorded the same way as Bug mode.
3. On stop, user clicks **Generate Test Cases** → `POST /api/testcases/generate` → backend calls the AI service (§8.3) with the description + recorded steps.
4. AI returns: the recorded happy path formalized as one POSITIVE case, plus several more POSITIVE variations and several NEGATIVE cases (invalid input, missing fields, boundary values, unauthorized access, etc. — whichever plausibly apply).
5. **Verify one-by-one UI:** each generated case is shown individually with Accept / Edit / Reject. Only accepted cases move to `VERIFIED` status.
6. **Bulk upload:** once verified, push the set to Excel / Jira / Azure DevOps in one action.

---

## 7. Backend API

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` | Authenticate, return JWT |
| `GET /api/users` | List users — populates Assignee dropdown |
| `GET /api/projects` | List projects |
| `GET /api/cycles?projectId=` | List cycles, incl. which is default |
| `GET` / `POST /api/bugs` | List / create bug (multipart: metadata + steps JSON + screenshots + video) |
| `GET` / `PUT /api/bugs/{id}` | Read / update a bug |
| `POST /api/bugs/{id}/push/jira` | Create Jira issue from this bug |
| `POST /api/bugs/{id}/push/ado` | Create Azure DevOps work item from this bug |
| `GET /api/bugs/{id}/export/excel` \| `/export/json` | Single-item export |
| `GET /api/bugs/export/excel` | Bulk export |
| `GET` / `POST /api/testcases` | List / create test case |
| `POST /api/testcases/generate` | Calls AI service, returns AI-draft array (not yet saved) |
| `PUT /api/testcases/{id}/verify` | Mark accepted / edited / rejected |
| `POST /api/testcases/bulk-upload` | Push verified set to Jira / ADO / Excel |
| `POST /ai/steps/humanize` *(internal)* | Raw action log → readable step sentences |
| `POST /ai/bug/expected-result` *(internal)* | Title+description+steps → expected result text |
| `POST /ai/testcases/generate` *(internal)* | Description+steps → array of test case drafts |

The three `/ai/...` routes live on the Python service and are only ever called server-to-server from the Java backend — never exposed to the extension or the internet directly.

---

## 8. AI microservice responsibilities

### 8.1 Humanize steps
Input: the raw event array from §5.2. Output: one plain-English sentence per step (e.g. *"Clicked the 'Submit' button"*, *"Entered a value into the 'Email' field"* — masked, never the literal value, when sensitive).

### 8.2 Expected result (bug mode)
Input: title + description + humanized steps. Output: one short paragraph describing what *should* have happened.

### 8.3 Test case generation — example prompt shape
```
SYSTEM: You are a senior QA engineer. Given a short description of a
user flow and the exact steps recorded for its happy-path run, produce
test cases: the happy path itself as one POSITIVE case, 2–4 further
POSITIVE variations, and 3–6 NEGATIVE cases (invalid input, missing
required fields, boundary values, unauthorized access, timeout/network
handling) — only the ones that plausibly apply to this flow.

Return ONLY valid JSON:
[{ "title": string, "type": "POSITIVE"|"NEGATIVE",
   "preconditions": string,
   "steps": [{ "action": string, "expectedResult": string }],
   "priority": "LOW"|"MEDIUM"|"HIGH" }]

FLOW DESCRIPTION: {{description}}
RECORDED STEPS: {{steps_json}}
```
Validate the model's JSON server-side before returning it to the backend — LLMs occasionally wrap output in prose or code fences even when told not to.

---

## 9. Integrations — gotchas worth knowing before you start

**Jira (REST API v3):** auth via email + API token (Basic). `POST /rest/api/3/issue`. Jira Cloud's `description` field expects **Atlassian Document Format (ADF)** JSON, not a plain string — this is the single most common integration bug people hit. Attachments go through a separate `POST /rest/api/3/issue/{key}/attachments` call with header `X-Atlassian-Token: no-check`.

**Azure DevOps REST API:** auth via PAT (Basic, empty username). Work item creation uses **JSON Patch**, not a plain object: `POST https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Bug?api-version=7.1`, body `[{"op":"add","path":"/fields/System.Title","value":"..."}]`. Attachments are a two-step process: upload binary → get a URL → add a second patch op linking that URL as an `AttachedFile` relation.

*(Verify exact field names/API versions against current Atlassian/Microsoft docs when you implement this — both are stable APIs, but details like custom field IDs are per-tenant.)*

**Excel export:** Apache POI (`poi-ooxml`), one row per Bug/TestCase, one sheet per steps breakdown. If you also want to append into an existing shared tracker file rather than always generating a fresh one, treat that as a v2 nice-to-have, not MVP.

**JSON export:** straight serialization of the Bug/TestCase object graph, including nested steps and attachment metadata.

---

## 10. Frontend dashboard — screens
- Login
- Bugs — list (filter by priority/severity/assignee/cycle/status) + detail (video playback, annotated screenshots, steps)
- Test cases — list + detail, including the AI-draft review/verify flow
- Users, Projects, Cycles — admin screens
- Integration settings — Jira/ADO credentials & project mapping (store tokens encrypted, never render them back in full)

---

## 11. Non-functional requirements
- JWT auth, HTTPS everywhere, integration tokens encrypted at rest (e.g. Jasypt, or your cloud's secrets manager) — never log them.
- Chunk video upload (`MediaRecorder.ondataavailable` on a timeslice) instead of holding one giant blob in memory.
- Run AI calls (especially §8.3, which can take a few seconds) asynchronously — queue + poll or webhook, don't block the HTTP request.
- Respect Jira/ADO rate limits; retry with backoff.

---

## 12. Suggested build phases
| Phase | Goal |
|---|---|
| 0 | Scaffold 4 repos/folders (`extension/`, `backend/`, `ai-service/`, `frontend/`), each with a working hello-world and CI. |
| 1 | Bug mode, manual only: popup form (no recording yet) → `Bug` CRUD API → frontend list/detail. Prove the end-to-end loop works. |
| 2 | Add real recording: DOM step capture, `tabCapture` video, screenshots + annotation toolbar. |
| 3 | Wire in the Python AI service: humanize steps, generate expected result. |
| 4 | Test Case mode: AI multi-case generation + one-by-one verify UI. |
| 5 | Integrations: Excel, JSON, Jira, Azure DevOps. |
| 6 | Hardening: sensitive-field masking, Edge/Firefox parity, integration-settings UI, permission-justification copy for store review. |

---

## 13. Opening message to paste into Cursor (Phase 0 + 1 only)

```
I'm building ReproScribe — a browser extension + web platform that
records a browser session and turns it into either a bug report or a
set of test cases. Full spec, architecture, data model and API are in
PROJECT_SPEC.md in this repo. Fixed stack: TypeScript/React for the
extension and frontend, Node.js/Express for the backend,
Python/FastAPI for the AI microservice, PostgreSQL.

For now, only do Phase 0 and Phase 1 from the "Suggested build phases"
section: scaffold the four project folders with a working hello-world
in each, then build the manual, non-AI, non-recording version of Bug
mode end-to-end — popup form -> Bug entity + CRUD API -> frontend
list/detail page. Don't build recording, the AI service, or
integrations yet.

Ask me before making any architectural call this spec doesn't cover.
When Phase 1 works end-to-end, stop and tell me so I can test it
before we move to Phase 2.
```
