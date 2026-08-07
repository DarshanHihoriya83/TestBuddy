import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ModalShell } from "./ModalShell";
import { normalizeProjectName, validateProjectName } from "../utils/validation";

export type ImportProjectEntry = Record<string, unknown>;

type ImportStep = 1 | 2 | 3;

const EXCEL_MAX_BYTES = 20 * 1024 * 1024;
const JSON_MAX_BYTES = 50 * 1024 * 1024;
const EMPTY_MARKERS = new Set(["", "—", "-", "–", "n/a", "na", "null", "undefined"]);

function optionalCell(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text || EMPTY_MARKERS.has(text.toLowerCase())) return undefined;
  return text;
}

function pickField(fields: Record<string, unknown>, ...labels: string[]): string | undefined {
  const entries = Object.entries(fields);
  for (const label of labels) {
    const want = label.toLowerCase();
    for (const [key, value] of entries) {
      const k = key.toLowerCase().trim();
      if (k === want || k.includes(want)) {
        const text = optionalCell(value);
        if (text) return text;
      }
    }
  }
  return undefined;
}

/** Map a TestBuddy export `fields` object (and title/id fallbacks) into an import entry. */
function entryFromExportFields(
  fields: Record<string, unknown>,
  fallbacks?: { title?: unknown; id?: unknown },
): ImportProjectEntry | null {
  const name =
    pickField(fields, "name", "project name") ||
    optionalCell(fallbacks?.title) ||
    optionalCell(fallbacks?.id);
  if (!name) return null;
  return {
    name,
    description: pickField(fields, "description", "desc"),
    jiraProjectKey: pickField(fields, "jira project key", "jira key", "jira"),
    adoOrgUrl: pickField(fields, "azure devops org url", "ado org url", "ado org"),
    adoProject: pickField(fields, "azure devops project", "ado project"),
    organizationId: pickField(fields, "organization id", "organizationid"),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Accepts:
 * - TestBuddy single export: { entity: "Project", title, fields: { Name, ... } }
 * - TestBuddy bulk export: { entity: "Projects", items: [{ title, fields }] }
 * - Legacy: { projects: [] } / { project: {} } / bare array / { name }
 */
export function readImportedProjects(raw: unknown): ImportProjectEntry[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => readImportedProjects(item));
  }
  if (!isPlainObject(raw)) return [];

  // Bulk export from exportRecords()
  if (Array.isArray(raw.items)) {
    return raw.items.flatMap((item) => readImportedProjects(item));
  }

  // Single/bulk item shaped like exportAsJson / items[] entry
  if (isPlainObject(raw.fields)) {
    const entry = entryFromExportFields(raw.fields, { title: raw.title, id: raw.id });
    return entry ? [entry] : [];
  }

  if (Array.isArray(raw.projects)) {
    return raw.projects.flatMap((item) => readImportedProjects(item));
  }
  if (isPlainObject(raw.project)) {
    return readImportedProjects(raw.project);
  }

  // Already a project-like create payload
  if (typeof raw.name === "string" && raw.name.trim()) {
    return [
      {
        name: raw.name,
        description: optionalCell(raw.description),
        jiraProjectKey: optionalCell(raw.jiraProjectKey),
        adoOrgUrl: optionalCell(raw.adoOrgUrl),
        adoProject: optionalCell(raw.adoProject),
        organizationId: optionalCell(raw.organizationId),
      },
    ];
  }

  // entity:"Project" without fields — use title/id
  if (
    typeof raw.entity === "string" &&
    /project/i.test(raw.entity) &&
    (optionalCell(raw.title) || optionalCell(raw.id))
  ) {
    return [
      {
        name: optionalCell(raw.title) || optionalCell(raw.id)!,
        description: optionalCell(raw.description),
      },
    ];
  }

  return [];
}

/** Pivot Field/Value rows (single-record Excel export) into one entry. */
function entryFromFieldValueRows(rows: { field: string; value: string }[]): ImportProjectEntry | null {
  const fields: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row.field) continue;
    fields[row.field] = row.value;
  }
  return entryFromExportFields(fields);
}

async function readProjectsFromExcel(file: File): Promise<ImportProjectEntry[]> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);
  const sheet: any =
    wb.worksheets.find((ws: { name: string }) => /project/i.test(ws.name)) ?? wb.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow((row: { values: unknown[] }) => {
    const values = ((row.values as unknown[]) || [])
      .slice(1)
      .map((v) => (v == null ? "" : String(v).trim()));
    if (values.some(Boolean)) matrix.push(values);
  });
  if (matrix.length < 2) return [];

  const header = matrix[0]!.map((h) => h.toLowerCase());
  const fieldIdx = header.findIndex((h) => h === "field" || h === "label");
  const valueIdx = header.findIndex((h) => h === "value");
  const nameCol = header.findIndex((h) => h === "name" || h === "project name" || h === "title");

  // Single export: Field | Value
  if (fieldIdx >= 0 && valueIdx >= 0 && nameCol < 0) {
    const pairs = matrix.slice(1).map((row) => ({
      field: row[fieldIdx] ?? "",
      value: row[valueIdx] ?? "",
    }));
    const entry = entryFromFieldValueRows(pairs);
    return entry ? [entry] : [];
  }

  // Bulk export: ID | Title | Context | Field | Value
  const titleIdx = header.findIndex((h) => h === "title");
  const idIdx = header.findIndex((h) => h === "id");
  if (fieldIdx >= 0 && valueIdx >= 0 && (titleIdx >= 0 || idIdx >= 0)) {
    const byKey = new Map<string, { title: string; id: string; fields: Record<string, unknown> }>();
    for (const row of matrix.slice(1)) {
      const id = row[idIdx >= 0 ? idIdx : titleIdx] ?? "";
      const title = row[titleIdx >= 0 ? titleIdx : idIdx] ?? id;
      const key = `${id}::${title}`;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = { title, id, fields: {} };
        byKey.set(key, bucket);
      }
      const field = row[fieldIdx] ?? "";
      const value = row[valueIdx] ?? "";
      if (field) bucket.fields[field] = value;
    }
    return [...byKey.values()]
      .map((b) => entryFromExportFields(b.fields, { title: b.title, id: b.id }))
      .filter((e): e is ImportProjectEntry => !!e);
  }

  // Flat table: Name | Description | ...
  const rows: ImportProjectEntry[] = [];
  for (const values of matrix.slice(1)) {
    const get = (...keys: string[]) => {
      for (const key of keys) {
        const idx = header.findIndex((h) => h === key || h.includes(key));
        if (idx >= 0) return optionalCell(values[idx]);
      }
      return undefined;
    };
    const name = get("name", "project name", "title");
    if (!name) continue;
    rows.push({
      name,
      description: get("description", "desc"),
      organizationId: get("organizationid", "organization id", "org id"),
      jiraProjectKey: get("jiraprojectkey", "jira", "jira key"),
      adoOrgUrl: get("adoorgurl", "ado org", "ado url"),
      adoProject: get("adoproject", "ado project"),
    });
  }
  return rows;
}

async function parseImportFile(file: File): Promise<ImportProjectEntry[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".json") || file.type.includes("json")) {
    if (file.size > JSON_MAX_BYTES) {
      throw new Error("JSON file exceeds the 50 MB limit");
    }
    return readImportedProjects(JSON.parse(await file.text()));
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    if (file.size > EXCEL_MAX_BYTES) {
      throw new Error("Excel file exceeds the 20 MB limit");
    }
    return readProjectsFromExcel(file);
  }
  throw new Error("Unsupported file type. Use .json or .xlsx");
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function entryDisplayName(entry: ImportProjectEntry) {
  const raw = typeof entry.name === "string" ? entry.name : "";
  return normalizeProjectName(raw) || raw || "Unnamed project";
}

function nameKey(name: string) {
  return normalizeProjectName(name).toLowerCase();
}

type RowStatus =
  | { kind: "ready" }
  | { kind: "invalid"; message: string }
  | { kind: "exists"; message: string }
  | { kind: "duplicate"; message: string };

function rowStatusForEntry(
  entry: ImportProjectEntry,
  index: number,
  entries: ImportProjectEntry[],
  existingNameKeys: Set<string>,
): RowStatus {
  const raw = typeof entry.name === "string" ? entry.name : "";
  const name = normalizeProjectName(raw);
  if (!name) return { kind: "invalid", message: "Name required" };
  const nameErr = validateProjectName(name);
  if (nameErr) return { kind: "invalid", message: nameErr };
  const key = nameKey(name);
  if (existingNameKeys.has(key)) {
    return { kind: "exists", message: "A project with this name already exists" };
  }
  const firstIdx = entries.findIndex((e) => {
    const n = normalizeProjectName(typeof e.name === "string" ? e.name : "");
    return n && nameKey(n) === key;
  });
  if (firstIdx >= 0 && firstIdx !== index) {
    return { kind: "duplicate", message: "Duplicate name in this file" };
  }
  return { kind: "ready" };
}

function isImportableRow(status: RowStatus) {
  return status.kind === "ready";
}

function ImportHeroArt() {
  return (
    <div className="tb-import-art" aria-hidden>
      <div className="tb-import-art-glow" />
      <div className="tb-import-art-folder">
        <svg width="54" height="44" viewBox="0 0 54 44" fill="none">
          <path
            d="M4 12.5A4.5 4.5 0 0 1 8.5 8H20l4 4h21.5A4.5 4.5 0 0 1 50 16.5v19A4.5 4.5 0 0 1 45.5 40h-37A4.5 4.5 0 0 1 4 35.5v-23Z"
            fill="url(#tbImportFolder)"
            stroke="#94a3b8"
            strokeWidth="1.2"
          />
          <defs>
            <linearGradient id="tbImportFolder" x1="4" y1="8" x2="50" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f8fafc" />
              <stop offset="1" stopColor="#e2e8f0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className="tb-import-art-chip is-excel">XLSX</span>
      <span className="tb-import-art-chip is-json">JSON</span>
    </div>
  );
}

function Stepper({ step }: { step: ImportStep }) {
  const items: { n: ImportStep; title: string; sub: string }[] = [
    { n: 1, title: "Upload File", sub: "Select your file" },
    { n: 2, title: "Preview Data", sub: "Review the content" },
    { n: 3, title: "Import", sub: "Confirm & import" },
  ];
  return (
    <ol className="tb-import-stepper">
      {items.map((item, i) => {
        const done = step > item.n;
        const active = step === item.n;
        return (
          <li key={item.n} className={`tb-import-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}>
            {i > 0 ? <span className="tb-import-step-line" aria-hidden /> : null}
            <span className="tb-import-step-num" aria-hidden>
              {done ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="m5 13 4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                item.n
              )}
            </span>
            <div className="tb-import-step-copy">
              <p className="tb-import-step-title">{item.title}</p>
              <p className="tb-import-step-sub">{item.sub}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ImportProjectModal({
  open,
  onClose,
  importing,
  existingProjectNames = [],
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  importing: boolean;
  /** Current project names — matching imports are blocked. */
  existingProjectNames?: string[];
  onImport: (entries: ImportProjectEntry[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<ImportProjectEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const existingNameKeys = useMemo(() => {
    const set = new Set<string>();
    for (const n of existingProjectNames) {
      const key = nameKey(n);
      if (key) set.add(key);
    }
    return set;
  }, [existingProjectNames]);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setFile(null);
      setEntries([]);
      setError(null);
      setDragging(false);
      setParsing(false);
    }
  }, [open]);

  async function acceptFile(next: File | null | undefined) {
    if (!next) return;
    setError(null);
    setParsing(true);
    try {
      const parsed = await parseImportFile(next);
      if (!parsed.length) {
        setFile(null);
        setEntries([]);
        setError("No projects found in this file");
        return;
      }
      setFile(next);
      setEntries(parsed);
      setStep(2);
    } catch (err) {
      setFile(null);
      setEntries([]);
      setError((err as Error).message || "Could not read this file");
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  const rowStatuses = entries.map((entry, i) =>
    rowStatusForEntry(entry, i, entries, existingNameKeys),
  );
  const importableEntries = entries.filter((_, i) => isImportableRow(rowStatuses[i]!));
  const validCount = importableEntries.length;
  const existsCount = rowStatuses.filter((s) => s.kind === "exists").length;
  const skippedCount = entries.length - validCount;

  async function onConfirmImport(e: FormEvent) {
    e.preventDefault();
    if (!importableEntries.length || importing) return;
    await onImport(importableEntries);
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="import-project-title" size="2xl" dismissible={!importing && !parsing}>
      <form className="tb-import-modal" onSubmit={onConfirmImport}>
        <header className="tb-import-header">
          <div className="tb-import-header-main">
            <span className="tb-import-header-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15V3M8 7l4-4 4 4M4 19h16"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <h2 id="import-project-title" className="tb-import-title">
                Import Project
              </h2>
              <p className="tb-import-sub">
                Upload your project file and review the data before importing
              </p>
            </div>
          </div>
          <div className="tb-import-header-side">
            <ImportHeroArt />
            <button
              type="button"
              className="tb-import-close"
              onClick={onClose}
              disabled={importing || parsing}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <Stepper step={step} />

        {error ? <p className="tb-alert-error tb-import-error">{error}</p> : null}

        {step === 1 && (
          <div className="tb-import-body">
            <div
              className={`tb-import-drop${dragging ? " is-dragging" : ""}${parsing ? " is-busy" : ""}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragging(false);
              }}
              onDrop={onDrop}
            >
              <div className="tb-import-drop-hero">
                <span className="tb-import-drop-icon" aria-hidden>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 16V6M8.5 9.5 12 6l3.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p className="tb-import-drop-title">
                  {parsing ? "Reading your file…" : "Drag & drop your file here"}
                </p>
                <p className="tb-import-drop-or">or</p>
                <button
                  type="button"
                  className="tb-btn-primary tb-import-browse"
                  disabled={parsing}
                  onClick={() => inputRef.current?.click()}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 15V3M8 7l4-4 4 4M4 19h16"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Browse Files
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = "";
                    void acceptFile(picked);
                  }}
                />
              </div>

              <div className="tb-import-drop-formats" aria-label="Supported file formats">
                <div className="tb-import-drop-format is-excel">
                  <span className="tb-import-drop-format-badge" aria-hidden>
                    X
                  </span>
                  <div className="tb-import-drop-format-copy">
                    <p className="tb-import-drop-format-name">
                      Excel <span>.xlsx</span>
                    </p>
                    <p className="tb-import-drop-format-limit">Max 20 MB</p>
                  </div>
                </div>
                <div className="tb-import-drop-format is-json">
                  <span className="tb-import-drop-format-badge" aria-hidden>
                    {"{ }"}
                  </span>
                  <div className="tb-import-drop-format-copy">
                    <p className="tb-import-drop-format-name">
                      JSON <span>.json</span>
                    </p>
                    <p className="tb-import-drop-format-limit">Max 50 MB</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="tb-import-notes">
              <div className="tb-import-notes-copy">
                <p className="tb-import-notes-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                    <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                  Important Notes
                </p>
                <ul>
                  <li>Use a TestBuddy project export — Excel Field/Value sheet or the JSON you download from Export.</li>
                  <li>Project names must pass validation (no emoji / invalid special characters).</li>
                  <li>Projects that already exist in your workspace will not be imported again.</li>
                </ul>
              </div>
              <div className="tb-import-notes-art" aria-hidden>
                <span className="tb-import-notes-shield" />
                <span className="tb-import-notes-db" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="tb-import-body">
            <div className="tb-import-filechip">
              <span className="tb-import-filechip-icon" aria-hidden>
                {file?.name.toLowerCase().endsWith(".xlsx") ? "X" : "{ }"}
              </span>
              <div className="min-w-0">
                <p className="tb-import-filechip-name">{file?.name}</p>
                <p className="tb-import-filechip-meta">
                  {file ? formatBytes(file.size) : ""} · {entries.length}{" "}
                  {entries.length === 1 ? "project" : "projects"} found
                </p>
              </div>
              <button
                type="button"
                className="tb-btn-ghost text-xs"
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setEntries([]);
                  setError(null);
                }}
              >
                Change file
              </button>
            </div>

            <div className="tb-import-preview">
              <div className="tb-import-preview-head">
                <p>Preview</p>
                <span>
                  {validCount} ready · {existsCount} already exist · {skippedCount} skipped
                </span>
              </div>
              <div className="tb-import-preview-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => {
                      const status = rowStatuses[i]!;
                      const desc =
                        typeof entry.description === "string" && entry.description.trim()
                          ? entry.description.trim()
                          : "—";
                      return (
                        <tr key={`${entryDisplayName(entry)}-${i}`}>
                          <td>{i + 1}</td>
                          <td title={entryDisplayName(entry)}>{entryDisplayName(entry)}</td>
                          <td title={desc}>{desc}</td>
                          <td>
                            {status.kind === "ready" ? (
                              <span className="tb-import-status is-ok">Ready</span>
                            ) : status.kind === "exists" ? (
                              <span className="tb-import-status is-exists" title={status.message}>
                                Exists
                              </span>
                            ) : status.kind === "duplicate" ? (
                              <span className="tb-import-status is-bad" title={status.message}>
                                Duplicate
                              </span>
                            ) : (
                              <span className="tb-import-status is-bad" title={status.message}>
                                Invalid
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="tb-import-body">
            <div className="tb-import-confirm">
              <span className="tb-import-confirm-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.75" />
                </svg>
              </span>
              <div>
                <p className="tb-import-confirm-title">Ready to import</p>
                <p className="tb-import-confirm-body">
                  You are about to create <strong>{validCount}</strong>{" "}
                  {validCount === 1 ? "project" : "projects"} from{" "}
                  <strong>{file?.name ?? "this file"}</strong>. Projects that already exist
                  (or are invalid) will be skipped.
                </p>
              </div>
            </div>
            <ul className="tb-import-confirm-list">
              <li>
                <strong>{entries.length}</strong> rows detected in file
              </li>
              <li>
                <strong>{validCount}</strong> will be imported
              </li>
              <li>
                <strong>{existsCount}</strong> already exist (skipped)
              </li>
              <li>
                <strong>{Math.max(0, skippedCount - existsCount)}</strong> other skips
                (invalid / duplicate in file)
              </li>
            </ul>
          </div>
        )}

        <footer className="tb-import-footer">
          <a
            className="tb-import-help"
            href="#import-guide"
            onClick={(e) => {
              e.preventDefault();
              setError(null);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8V14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Need help? View import guide
          </a>
          <div className="tb-import-footer-actions">
            <button type="button" className="tb-btn-ghost" onClick={onClose} disabled={importing || parsing}>
              Cancel
            </button>
            {step === 1 && (
              <button
                type="button"
                className="tb-btn-primary"
                disabled={!file || parsing}
                onClick={() => setStep(2)}
              >
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {step === 2 && (
              <>
                <button type="button" className="tb-btn-ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="tb-btn-primary"
                  disabled={validCount === 0}
                  onClick={() => setStep(3)}
                >
                  Next
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button type="button" className="tb-btn-ghost" onClick={() => setStep(2)} disabled={importing}>
                  Back
                </button>
                <button type="submit" className="tb-btn-primary" disabled={importing || validCount === 0}>
                  {importing ? "Importing…" : "Import projects"}
                </button>
              </>
            )}
          </div>
        </footer>
      </form>
    </ModalShell>
  );
}
