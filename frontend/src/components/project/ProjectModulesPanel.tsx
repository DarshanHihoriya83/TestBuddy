import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { fetchBugs, fetchTestCases } from "../../api";
import { queryKeys } from "../../queryKeys";
import type { Module } from "../../types";
import { ModuleBulkBar } from "./ModuleBulkBar";
import { SingleExportModal } from "../SingleExportModal";
import { exportRecord, type ExportRecordDoc } from "../../utils/recordExport";

type ViewMode = "list" | "grid";
type MenuPos = { top: number; left: number };

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function MenuViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function MenuEditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m13.5 6.5 3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function MenuDeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M8 11l4 4 4-4M4 19h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ModuleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = Math.max(rect.width, 132);
    const menuH = PAGE_SIZE_OPTIONS.length * 40 + 8;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({
      top: openUp ? rect.top - gap - menuH : rect.bottom + gap,
      left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Modules per page"
            style={{ top: pos.top, left: pos.left, minWidth: btnRef.current?.offsetWidth }}
            className="fixed z-[80] overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            {PAGE_SIZE_OPTIONS.map((size) => {
              const active = size === value;
              return (
                <button
                  key={size}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`block w-full px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                      : "text-[var(--ink)] hover:bg-[var(--bg0)]"
                  }`}
                  onClick={() => {
                    onChange(size);
                    setOpen(false);
                  }}
                >
                  {size} per page
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--ink)] transition hover:border-[#cbd5e1] hover:bg-[var(--bg0)]"
        onClick={() => setOpen((v) => !v)}
      >
        {value} per page
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[var(--muted)]">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menu}
    </>
  );
}

function KebabMenu({
  module,
  projectId,
  canManage,
  deleting,
  onEdit,
  onExport,
  onDelete,
}: {
  module: Module;
  projectId: string;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    const menuW = 160;
    const menuH = canManage ? 188 : 88;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({
      top: openUp ? rect.top - gap - menuH : rect.bottom + gap,
      left,
    });
  }, [open, canManage]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[80] w-40 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            <Link
              role="menuitem"
              to={`/projects/${projectId}/modules/${module.id}`}
              className="tb-menu-item"
              onClick={() => setOpen(false)}
            >
              <MenuViewIcon />
              View
            </Link>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setOpen(false);
                onExport();
              }}
            >
              <MenuExportIcon />
              Export
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="tb-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                >
                  <MenuEditIcon />
                  Edit
                </button>
                <hr className="tb-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleting}
                  className="tb-menu-item-danger"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                >
                  <MenuDeleteIcon />
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Actions for ${module.name}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`tb-kebab-btn ${open ? "is-open" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {menu}
    </>
  );
}

export function ProjectModulesPanel({
  projectId,
  modules,
  loading,
  canManage,
  moduleName,
  onModuleNameChange,
  moduleDescription,
  onModuleDescriptionChange,
  onCreate,
  creating,
  onRename,
  renaming,
  onDelete,
  deleting,
  error,
  showHeader = true,
  createOpen: createOpenProp,
  onCreateOpenChange,
}: {
  projectId: string;
  modules: Module[];
  loading?: boolean;
  canManage: boolean;
  moduleName: string;
  onModuleNameChange: (name: string) => void;
  moduleDescription: string;
  onModuleDescriptionChange: (description: string) => void;
  onCreate: () => void;
  creating?: boolean;
  onRename: (id: string, name: string, description: string) => void;
  renaming?: boolean;
  onDelete: (id: string, name: string) => void;
  deleting?: boolean;
  error?: string | null;
  showHeader?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const [createOpenLocal, setCreateOpenLocal] = useState(false);
  const createOpen = createOpenProp ?? createOpenLocal;
  const setCreateOpen = (open: boolean) => {
    setCreateOpenLocal(open);
    onCreateOpenChange?.(open);
  };
  const [editModule, setEditModule] = useState<Module | null>(null);
  const [exportModule, setExportModule] = useState<Module | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const wasCreating = useRef(false);
  const wasRenaming = useRef(false);
  const wasDeleting = useRef(false);

  useEffect(() => {
    if (wasCreating.current && !creating && !error) {
      setCreateOpen(false);
      onModuleNameChange("");
      onModuleDescriptionChange("");
    }
    wasCreating.current = !!creating;
  }, [creating, error, onModuleNameChange, onModuleDescriptionChange]);

  useEffect(() => {
    if (!createOpen) return;
    onModuleNameChange("");
    onModuleDescriptionChange("");
    // Only reset the form as the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  useEffect(() => {
    if (wasRenaming.current && !renaming && !error) {
      setEditModule(null);
    }
    wasRenaming.current = !!renaming;
  }, [renaming, error]);

  useEffect(() => {
    if (wasDeleting.current && !deleting && !error) {
      setDeleteTarget(null);
    }
    wasDeleting.current = !!deleting;
  }, [deleting, error]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [modules, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageItems = filtered.slice(startIdx, endIdx);
  const allPageSelected = pageItems.length > 0 && pageItems.every((m) => selectedIds.has(m.id));

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(modules.map((m) => m.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [modules]);

  function toggleModule(id: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage(selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const m of pageItems) {
        if (selected) next.add(m.id);
        else next.delete(m.id);
      }
      return next;
    });
  }

  const exportModuleId = exportModule?.id ?? "";
  const exportTestCasesQuery = useQuery({
    queryKey: queryKeys.testCases({ projectId, moduleId: exportModuleId }),
    queryFn: () => fetchTestCases({ projectId, moduleId: exportModuleId }),
    enabled: !!exportModuleId,
  });
  const exportBugsQuery = useQuery({
    queryKey: queryKeys.bugs({ projectId, moduleId: exportModuleId }),
    queryFn: () => fetchBugs({ projectId, moduleId: exportModuleId }),
    enabled: !!exportModuleId,
  });
  const exportContentsLoading =
    !!exportModuleId && (exportTestCasesQuery.isPending || exportBugsQuery.isPending);
  const exportTcList = exportTestCasesQuery.data ?? [];
  const moduleExportDoc: ExportRecordDoc | null = exportModule
    ? {
        entity: "Module",
        displayId: exportModule.name,
        title: exportModule.name,
        context: exportModule.description?.trim() || "Module workspace",
        contents: [
          { label: "Test Cases", value: String(exportTcList.length) },
          { label: "Bugs", value: String(exportBugsQuery.data?.length ?? 0) },
          {
            label: "Steps",
            value: String(exportTcList.reduce((sum, tc) => sum + (tc.steps?.length ?? 0), 0)),
          },
        ],
        summary: [
          { label: "Name", value: exportModule.name },
          { label: "Created On", value: formatDate(exportModule.createdAt) },
        ],
        details: [
          { label: "Description", value: exportModule.description?.trim() || "\u2014" },
          { label: "Module ID", value: exportModule.id },
          { label: "Project ID", value: exportModule.projectId },
        ],
      }
    : null;

  function requestBulkExport() {
    if (selectedIds.size === 1) {
      const only = modules.find((m) => selectedIds.has(m.id));
      if (only) {
        setExportModule(only);
        return;
      }
    }
    exportSelectedModules();
  }

  function exportSelectedModules() {
    const list = modules.filter((m) => selectedIds.has(m.id));
    if (!list.length) return;
    downloadJson(`testbuddy-modules-${list.length}.json`, {
      exportedAt: new Date().toISOString(),
      count: list.length,
      modules: list,
    });
  }

  function openCreate() {
    onModuleNameChange("");
    onModuleDescriptionChange("");
    setCreateOpen(true);
  }

  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    onModuleNameChange("");
    onModuleDescriptionChange("");
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!moduleName.trim() || creating) return;
    onCreate();
  }

  function openEdit(mod: Module) {
    setEditModule(mod);
    setEditName(mod.name);
    setEditDescription(mod.description ?? "");
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editModule || !editName.trim() || renaming) return;
    onRename(editModule.id, editName.trim(), editDescription.trim());
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {showHeader && (
        <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3 px-4 sm:px-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">Modules</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              {canManage
                ? "Create and manage modules for this project."
                : "Browse modules in this project."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              to="/projects"
              className="tb-btn-ghost inline-flex items-center gap-1.5 text-sm shadow-sm"
            >
              {"\u2190"} Back to projects
            </Link>
            {canManage && (
              <button type="button" className="tb-btn-primary shrink-0" onClick={openCreate}>
                <span aria-hidden>+</span> Add module
              </button>
            )}
          </div>
        </div>
      )}

      {error && !createOpen && !editModule && !deleteTarget ? (
        <p className="mb-3 px-4 text-sm text-[var(--danger)] sm:px-5">{error}</p>
      ) : null}

      {loading ? (
        <p className="px-4 text-sm text-[var(--muted)] sm:px-5">Loading modules…</p>
      ) : (
        <div className="tb-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="relative w-full max-w-[16rem] sm:max-w-[18rem]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search modules..."
                className="tb-search-input"
              />
            </div>
            <div className="tb-view-toggle">
              <button
                type="button"
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                className={`tb-view-toggle-btn ${viewMode === "list" ? "is-active" : "bg-white text-[var(--muted)]"}`}
                onClick={() => setViewMode("list")}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={`tb-view-toggle-btn border-l border-[var(--line)] ${
                  viewMode === "grid" ? "is-active" : "bg-white text-[var(--muted)]"
                }`}
                onClick={() => setViewMode("grid")}
              >
                <GridIcon />
              </button>
            </div>
          </div>

          <ModuleBulkBar
            visible={selectedIds.size > 0}
            selectedCount={selectedIds.size}
            pageCount={pageItems.length}
            allSelected={allPageSelected}
            exportLabel="Export selected"
            showSelectAll={false}
            onToggleAllPage={toggleAllOnPage}
            onExport={requestBulkExport}
            onClear={() => setSelectedIds(new Set())}
          />

          <SingleExportModal
            open={!!exportModule}
            doc={moduleExportDoc}
            contentsLoading={exportContentsLoading}
            detailsLabel="Module Details"
            detailsHint="Includes description and linked identifiers."
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="14" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
              </svg>
            }
            onClose={() => setExportModule(null)}
            onExport={(format, includeDetails) =>
              moduleExportDoc ? exportRecord(format, moduleExportDoc, { includeDetails }) : undefined
            }
          />

          <div className="min-h-0 flex-1 overflow-auto">
            {viewMode === "list" ? (
              <table className="tb-table">
                <colgroup>
                  <col className="tb-col-name" />
                  <col className="tb-col-ado" />
                  <col className="tb-col-date" />
                  <col className="tb-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tb-table-col tb-table-col-name">
                      <span className="tb-table-name-head">
                        <input
                          type="checkbox"
                          className="tb-name-check"
                          checked={allPageSelected}
                          onChange={(e) => toggleAllOnPage(e.target.checked)}
                          aria-label="Select all modules on this page"
                        />
                        Name
                      </span>
                    </th>
                    <th className="tb-table-col tb-table-col-ado">Description</th>
                    <th className="tb-table-col-date">Created on</th>
                    <th className="tb-table-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--muted)]">
                        No modules yet.
                      </td>
                    </tr>
                  )}
                  {pageItems.map((mod) => (
                    <tr key={mod.id} className={selectedIds.has(mod.id) ? "is-selected" : undefined}>
                      <td className="tb-table-col tb-table-col-name">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="tb-name-check"
                            checked={selectedIds.has(mod.id)}
                            onChange={(e) => toggleModule(mod.id, e.target.checked)}
                            aria-label={`Select ${mod.name}`}
                          />
                          <div className="tb-folder-chip grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                            <ModuleIcon />
                          </div>
                          <div className="min-w-0">
                            <Link
                              className="block truncate font-semibold text-[var(--accent)] hover:underline"
                              to={`/projects/${projectId}/modules/${mod.id}`}
                            >
                              {mod.name}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="tb-table-col tb-table-col-ado text-[var(--ink)]">
                        <span className="line-clamp-2">{mod.description || "—"}</span>
                      </td>
                      <td className="tb-table-col-date">
                        <div className="tb-table-date-cell text-[var(--muted)]">
                          <CalendarIcon /> {formatDate(mod.createdAt)}
                        </div>
                      </td>
                      <td className="tb-table-actions-col">
                        <div className="tb-table-actions-cell">
                          <KebabMenu
                            module={mod}
                            projectId={projectId}
                            canManage={canManage}
                            deleting={!!deleting}
                            onEdit={() => openEdit(mod)}
                            onExport={() => setExportModule(mod)}
                            onDelete={() => setDeleteTarget(mod)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4">
                {pageItems.length > 0 && (
                  <div className="tb-mod-grid-head">
                    <label className="tb-mod-grid-select-all">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={allPageSelected}
                        onChange={(e) => toggleAllOnPage(e.target.checked)}
                        aria-label="Select all modules on this page"
                      />
                      Select all on this page
                    </label>
                    <span className="tb-mod-grid-head-count">{pageItems.length} shown</span>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageItems.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-[var(--muted)]">
                    No modules yet.
                  </p>
                )}
                {pageItems.map((mod) => (
                  <div
                    key={mod.id}
                    className={`tb-project-card ${selectedIds.has(mod.id) ? "is-selected" : ""}`}
                  >
                    <div className="absolute right-2 top-2">
                      <KebabMenu
                        module={mod}
                        projectId={projectId}
                        canManage={canManage}
                        deleting={!!deleting}
                        onEdit={() => openEdit(mod)}
                        onExport={() => setExportModule(mod)}
                        onDelete={() => setDeleteTarget(mod)}
                      />
                    </div>
                    <div className="mb-3 flex items-center gap-2.5 pr-8">
                      <input
                        type="checkbox"
                        className="tb-name-check"
                        checked={selectedIds.has(mod.id)}
                        onChange={(e) => toggleModule(mod.id, e.target.checked)}
                        aria-label={`Select ${mod.name}`}
                      />
                      <div className="tb-folder-chip grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                        <ModuleIcon />
                      </div>
                      <Link
                        to={`/projects/${projectId}/modules/${mod.id}`}
                        className="min-w-0 flex-1 truncate font-semibold text-[var(--accent)] hover:underline"
                        title={mod.name}
                      >
                        {mod.name}
                      </Link>
                    </div>
                    <p className="line-clamp-2 text-xs text-[var(--muted)]">
                      {mod.description || "No description"}
                    </p>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white px-4 py-2.5 sm:px-5">
            <p className="text-sm text-[var(--muted)]">
              {total === 0
                ? "Showing 0 modules"
                : `Showing ${startIdx + 1} to ${endIdx} of ${total} modules`}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="tb-page-btn"
                disabled={safePage <= 1}
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {pageNumbers(safePage, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e-${i}`} className="px-1 text-sm text-[var(--muted)]">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`tb-page-btn ${p === safePage ? "tb-page-btn-active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                className="tb-page-btn"
                disabled={safePage >= totalPages}
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
            <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            </div>
          </div>
        </div>
      )}

      {createOpen && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreate();
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="add-module-title"
            className="tb-card tb-modal-panel max-w-lg p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="add-module-title" className="text-lg font-semibold text-[var(--ink)]">
                Add module
              </h2>
              <button
                type="button"
                className="tb-btn-icon h-9 w-9"
                aria-label="Close"
                disabled={creating}
                onClick={closeCreate}
              >
                ×
              </button>
            </div>
            <form className="mt-4" onSubmit={submitCreate}>
              <div className="grid gap-3">
                <label className="tb-label">
                  Name <span className="tb-req">*</span>
                  <input
                    className="tb-input"
                    value={moduleName}
                    onChange={(e) => onModuleNameChange(e.target.value)}
                    placeholder="e.g. Login"
                    autoFocus
                    required
                    minLength={2}
                  />
                </label>
                <label className="tb-label">
                  Description
                  <textarea
                    className="tb-textarea"
                    rows={3}
                    value={moduleDescription}
                    onChange={(e) => onModuleDescriptionChange(e.target.value)}
                    placeholder="e.g, Describe the module details"
                  />
                </label>
              </div>
              {error ? <p className="tb-alert-error mt-3">{error}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="tb-btn-ghost" disabled={creating} onClick={closeCreate}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tb-btn-primary"
                  disabled={!moduleName.trim() || creating}
                >
                  {creating ? "Adding…" : "Add module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModule && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !renaming) setEditModule(null);
          }}
        >
          <div
            role="dialog"
            aria-modal
            aria-labelledby="edit-module-title"
            className="tb-card tb-modal-panel max-w-lg p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="edit-module-title" className="text-lg font-semibold text-[var(--ink)]">
                Edit module
              </h2>
              <button
                type="button"
                className="tb-btn-icon h-9 w-9"
                aria-label="Close"
                disabled={renaming}
                onClick={() => setEditModule(null)}
              >
                ×
              </button>
            </div>
            <form className="mt-4" onSubmit={submitEdit}>
              <div className="grid gap-3">
                <label className="tb-label">
                  Name <span className="tb-req">*</span>
                  <input
                    className="tb-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Login"
                    required
                    minLength={2}
                  />
                </label>
                <label className="tb-label">
                  Description
                  <textarea
                    className="tb-textarea"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="e.g, Describe the module details"
                  />
                </label>
              </div>
              {error ? <p className="tb-alert-error mt-3">{error}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="tb-btn-ghost"
                  disabled={renaming}
                  onClick={() => setEditModule(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tb-btn-primary"
                  disabled={!editName.trim() || renaming}
                >
                  {renaming ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && canManage && (
        <div
          className="tb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteTarget(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal
            aria-labelledby="delete-module-title"
            className="tb-card tb-modal-panel max-w-md p-5"
          >
            <h2 id="delete-module-title" className="text-lg font-semibold text-[var(--ink)]">
              Delete module?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Delete <strong className="text-[var(--ink)]">{deleteTarget.name}</strong>? This cannot be
              undone.
            </p>
            {error ? <p className="tb-alert-error mt-3">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="tb-btn-ghost"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-55"
                onClick={() => onDelete(deleteTarget.id, deleteTarget.name)}
              >
                {deleting ? "Deleting…" : "Delete module"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
