export type ModuleViewTab = "bugs" | "testcases";

export type ModuleDensity = "comfortable" | "compact" | "spacious";
export type ModuleRowSize = "small" | "medium" | "large";
export type ModuleSortDir = "asc" | "desc";
export type ModuleViewMode = "list" | "grid";

export type BugColumnKey = "id" | "title" | "status" | "priority" | "assignee" | "updatedAt";
export type TcColumnKey =
  | "id"
  | "title"
  | "type"
  | "priority"
  | "status"
  | "assignee"
  | "updatedAt";

export interface ModuleViewPrefs {
  columns: Record<string, boolean>;
  sortBy: string;
  sortDir: ModuleSortDir;
  density: ModuleDensity;
  rowSize: ModuleRowSize;
  viewMode: ModuleViewMode;
}

export const BUG_COLUMNS: { key: BugColumnKey; label: string }[] = [
  { key: "id", label: "Bug ID" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "updatedAt", label: "Updated On" },
];

export const TC_COLUMNS: { key: TcColumnKey; label: string }[] = [
  { key: "id", label: "TC ID" },
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
  { key: "updatedAt", label: "Updated On" },
];

export const BUG_SORT_OPTIONS = [
  { value: "updatedAt", label: "Updated Date" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
] as const;

export const TC_SORT_OPTIONS = [
  { value: "updatedAt", label: "Updated Date" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "type", label: "Type" },
] as const;

function allTrue(keys: string[]): Record<string, boolean> {
  return Object.fromEntries(keys.map((k) => [k, true]));
}

export function defaultBugPrefs(): ModuleViewPrefs {
  return {
    columns: allTrue(BUG_COLUMNS.map((c) => c.key)),
    sortBy: "updatedAt",
    sortDir: "desc",
    density: "comfortable",
    rowSize: "medium",
    viewMode: "list",
  };
}

export function defaultTcPrefs(): ModuleViewPrefs {
  return {
    columns: allTrue(TC_COLUMNS.map((c) => c.key)),
    sortBy: "updatedAt",
    sortDir: "desc",
    density: "comfortable",
    rowSize: "medium",
    viewMode: "list",
  };
}

const STORAGE_KEY = "testbuddy_module_view_prefs_v1";

type Stored = Partial<Record<ModuleViewTab, ModuleViewPrefs>>;

function readStore(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Stored;
  } catch {
    return {};
  }
}

function writeStore(next: Stored) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function loadModuleViewPrefs(tab: ModuleViewTab): ModuleViewPrefs {
  const stored = readStore()[tab];
  const base = tab === "bugs" ? defaultBugPrefs() : defaultTcPrefs();
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    columns: { ...base.columns, ...stored.columns },
  };
}

export function saveModuleViewPrefs(tab: ModuleViewTab, prefs: ModuleViewPrefs) {
  const store = readStore();
  store[tab] = prefs;
  writeStore(store);
}

export function tableDensityClass(prefs: ModuleViewPrefs): string {
  return `tb-view-density-${prefs.density} tb-view-row-${prefs.rowSize}`;
}
