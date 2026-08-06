import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { Bug, BugPriority, BugStatus, User } from "../../types";
import {
  defaultBugPrefs,
  tableDensityClass,
  type ModuleViewPrefs,
} from "../../utils/moduleViewPrefs";
import { assignableUsers } from "../../utils/roles";
import { ModuleBulkBar } from "./ModuleBulkBar";
import { ModuleFilterChips, type FilterChip } from "./ModuleFilterChips";
import { ModuleStatLine, type StatItem } from "./ModuleStatLine";
import { useAuth } from "../../auth";

type MenuPos = { top: number; left: number };

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

function bugDisplayId(id: string) {
  const n = parseInt(id.replace(/-/g, "").slice(0, 6), 16) % 900;
  return `BUG-${100 + (Number.isFinite(n) ? n : 0)}`;
}

function formatDate(value?: string) {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Map domain status → mock display groups */
function displayStatus(status: BugStatus): "Open" | "In Progress" | "Resolved" | "Closed" {
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "FIXED" || status === "VERIFIED") return "Resolved";
  if (status === "CLOSED") return "Closed";
  return "Open";
}

function statusPillClass(label: ReturnType<typeof displayStatus>) {
  switch (label) {
    case "Open":
      return "tb-bug-status-open";
    case "In Progress":
      return "tb-bug-status-progress";
    case "Resolved":
      return "tb-bug-status-resolved";
    default:
      return "tb-bug-status-closed";
  }
}

function PriorityCell({ priority }: { priority: BugPriority }) {
  if (priority === "HIGH" || priority === "CRITICAL") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--danger)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m12 5 7 12H5L12 5Z" fill="currentColor" />
        </svg>
        {priority === "CRITICAL" ? "Critical" : "High"}
      </span>
    );
  }
  if (priority === "MEDIUM") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Medium
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--success)]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="m12 19 7-12H5l7 12Z" fill="currentColor" />
      </svg>
      Low
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

function BugKebab({
  onView,
  onExport,
  exportBusy,
}: {
  onView: () => void;
  onExport: () => void;
  exportBusy?: boolean;
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
    const menuH = 96;
    const gap = 4;
    const openUp = rect.bottom + gap + menuH > window.innerHeight - 8;
    const left = Math.min(Math.max(8, rect.right - menuW), window.innerWidth - menuW - 8);
    setPos({ top: openUp ? rect.top - gap - menuH : rect.bottom + gap, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              onClick={() => {
                setOpen(false);
                onView();
              }}
            >
              <MenuViewIcon />
              View
            </button>
            <button
              type="button"
              role="menuitem"
              className="tb-menu-item"
              disabled={exportBusy}
              onClick={() => {
                setOpen(false);
                onExport();
              }}
            >
              <MenuExportIcon />
              Export
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Bug actions"
        aria-expanded={open}
        className={`tb-kebab-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
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

function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (current > 3) pages.push("ellipsis");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function ModuleBugsPanel({
  projectId,
  moduleId,
  bugs,
  loading,
  users,
  selectedIds,
  onToggleOne,
  onToggleAll,
  onOpenBug,
  onExportOne,
  onExportSelected,
  onClearSelection,
  exportBusy,
  search,
  onSearchChange,
  viewPrefs = defaultBugPrefs(),
}: {
  projectId: string;
  moduleId: string;
  bugs: Bug[];
  loading?: boolean;
  users: User[];
  selectedIds: Set<string>;
  onToggleOne: (bugId: string, selected: boolean) => void;
  onToggleAll: (selected: boolean, ids: string[]) => void;
  onOpenBug: (bugId: string) => void;
  onExportOne: (bugId: string) => void;
  onExportSelected?: () => void;
  onClearSelection?: () => void;
  exportBusy?: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  viewPrefs?: ModuleViewPrefs;
}) {
  const [filterStatus, setFilterStatus] = useState<"" | "Open" | "In Progress" | "Resolved" | "Closed">("");
  const [filterPriority, setFilterPriority] = useState<BugPriority | "">("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const col = (key: string) => viewPrefs.columns[key] !== false;
  const isGrid = viewPrefs.viewMode === "grid";
  const { user } = useAuth();
  const assigneeChoices = useMemo(() => assignableUsers(user, users), [user, users]);

  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = bugs.filter((b) => {
      const label = displayStatus(b.status);
      if (filterStatus && label !== filterStatus) return false;
      if (filterPriority && b.priority !== filterPriority) return false;
      if (filterAssignee && b.assigneeId !== filterAssignee) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        bugDisplayId(b.id).toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        nameOf(b.assigneeId).toLowerCase().includes(q)
      );
    });

    const dir = viewPrefs.sortDir === "asc" ? 1 : -1;
    const priorityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (viewPrefs.sortBy) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = displayStatus(a.status).localeCompare(displayStatus(b.status));
          break;
        case "priority":
          cmp = (priorityRank[a.priority] ?? 0) - (priorityRank[b.priority] ?? 0);
          break;
        default: {
          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          cmp = at - bt;
        }
      }
      return cmp * dir;
    });
  }, [bugs, search, filterStatus, filterPriority, filterAssignee, users, viewPrefs.sortBy, viewPrefs.sortDir]);

  const stats = useMemo(() => {
    const total = bugs.length;
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    let closed = 0;
    for (const b of bugs) {
      const d = displayStatus(b.status);
      if (d === "Open") open += 1;
      else if (d === "In Progress") inProgress += 1;
      else if (d === "Resolved") resolved += 1;
      else closed += 1;
    }
    return { total, open, inProgress, resolved, closed };
  }, [bugs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = filtered.length === 0 ? 0 : (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filtered.length);
  const pageItems = filtered.slice(startIdx, endIdx);
  const allSelected = pageItems.length > 0 && pageItems.every((b) => selectedIds.has(b.id));

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterPriority, filterAssignee, pageSize]);

  function clearFilters() {
    setFilterStatus("");
    setFilterPriority("");
    setFilterAssignee("");
    onSearchChange("");
  }

  const filtersActive =
    search.trim().length > 0 || !!filterStatus || !!filterPriority || !!filterAssignee;

  const filterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    if (search.trim()) {
      chips.push({ key: "search", label: `Search: ${search.trim()}`, onRemove: () => onSearchChange("") });
    }
    if (filterStatus) {
      chips.push({ key: "status", label: `Status: ${filterStatus}`, onRemove: () => setFilterStatus("") });
    }
    if (filterPriority) {
      chips.push({ key: "priority", label: `Priority: ${filterPriority}`, onRemove: () => setFilterPriority("") });
    }
    if (filterAssignee) {
      const name = assigneeChoices.find((u) => u.id === filterAssignee)?.name ?? filterAssignee;
      chips.push({ key: "assignee", label: `Assignee: ${name}`, onRemove: () => setFilterAssignee("") });
    }
    return chips;
  }, [search, filterStatus, filterPriority, filterAssignee, assigneeChoices, onSearchChange]);

  const bulkVisible = selectedIds.size > 0;

  if (loading) {
    return (
      <div className="tb-mod-loading">
        <div className="tb-mod-loading-shimmer" aria-hidden />
        <p>Loading bugs…</p>
      </div>
    );
  }

  const statItems: StatItem[] = [
    {
      key: "total",
      label: "Total",
      value: stats.total,
      tone: "blue",
      active: filterStatus === "",
      onSelect: () => setFilterStatus(""),
    },
    ...([
      ["Open", stats.open, "amber"],
      ["In Progress", stats.inProgress, "violet"],
      ["Resolved", stats.resolved, "green"],
      ["Closed", stats.closed, "slate"],
    ] as const).map(([status, value, tone]) => ({
      key: status,
      label: status,
      value,
      tone,
      active: filterStatus === status,
      onSelect: () => setFilterStatus(filterStatus === status ? "" : status),
    })),
  ];

  return (
    <div className={`tb-mod-panel flex min-h-0 flex-1 flex-col ${tableDensityClass(viewPrefs)}`}>
      <div className="tb-mod-toolbar tb-mod-command-toolbar shrink-0">
        <div className="relative min-w-[12rem] flex-1 max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search bugs…"
            className="tb-search-input"
          />
        </div>
        <select
          className="tb-filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
        >
          <option value="">Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
        <select
          className="tb-filter-select"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as BugPriority | "")}
        >
          <option value="">Priority</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select
          className="tb-filter-select"
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
        >
          <option value="">Assignee</option>
          {assigneeChoices.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" className="tb-link text-sm lg:hidden" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className="tb-mod-subbar shrink-0">
        <ModuleFilterChips chips={filterChips} onClearAll={clearFilters} />
        <ModuleStatLine items={statItems} label="Bug summary" />
      </div>

      <ModuleBulkBar
        visible={bulkVisible}
        selectedCount={selectedIds.size}
        pageCount={pageItems.length}
        allSelected={allSelected}
        exportLabel="Export selected"
        exportBusy={exportBusy}
        showSelectAll={!isGrid}
        onToggleAllPage={(checked) => onToggleAll(checked, pageItems.map((b) => b.id))}
        onExport={() => onExportSelected?.()}
        onClear={() => onClearSelection?.()}
      />

      <div className={`tb-mod-content min-h-0 flex-1 overflow-auto ${isGrid ? "is-grid" : "is-list"}`}>
        {pageItems.length === 0 ? (
          <div className="tb-mod-empty">
            <div className="tb-mod-empty-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
                <path d="M12 3v3M12 21v-3M3 12h3M21 12h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-semibold text-[var(--ink)]">No bugs in this module</p>
            <p className="max-w-sm text-sm text-[var(--muted)]">
              File one from the extension, or open the bugs board to review across projects.
            </p>
            <Link
              to={`/bugs?projectId=${encodeURIComponent(projectId)}&moduleId=${encodeURIComponent(moduleId)}`}
              className="tb-btn-primary mt-2 text-sm"
            >
              + Report Bug
            </Link>
          </div>
        ) : isGrid ? (
          <div className="tb-mod-grid p-4">
            <div className="tb-mod-grid-head">
              <label className="tb-mod-grid-select-all">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked, pageItems.map((b) => b.id))}
                  aria-label="Select all on this page"
                />
                Select all on this page
              </label>
              <span className="tb-mod-grid-head-count">{pageItems.length} shown</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((bug, i) => {
              const label = displayStatus(bug.status);
              const assignee = nameOf(bug.assigneeId);
              const selected = selectedIds.has(bug.id);
              return (
                <div
                  key={bug.id}
                  className={`tb-qa-card ${selected ? "is-selected" : ""}`}
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <div className={`tb-qa-card-ribbon ${statusPillClass(label)}`} aria-hidden />
                  <div className="tb-qa-card-top">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      checked={selected}
                      onChange={(e) => onToggleOne(bug.id, e.target.checked)}
                      aria-label={`Select ${bug.title}`}
                    />
                    <BugKebab
                      onView={() => onOpenBug(bug.id)}
                      onExport={() => onExportOne(bug.id)}
                      exportBusy={exportBusy}
                    />
                  </div>
                  <div className="tb-qa-card-body">
                    {col("id") && (
                      <button
                        type="button"
                        className="tb-qa-card-id"
                        onClick={() => onOpenBug(bug.id)}
                      >
                        {bugDisplayId(bug.id)}
                      </button>
                    )}
                    {col("title") && (
                      <button
                        type="button"
                        className="tb-qa-card-title"
                        onClick={() => onOpenBug(bug.id)}
                      >
                        {bug.title}
                      </button>
                    )}
                    <div className="tb-qa-card-tags">
                      {col("status") && (
                        <span className={`tb-bug-status-pill ${statusPillClass(label)}`}>{label}</span>
                      )}
                      {col("priority") && <PriorityCell priority={bug.priority} />}
                    </div>
                  </div>
                  <div className="tb-qa-card-foot">
                    {col("assignee") && (
                      <span className="inline-flex max-w-[60%] items-center gap-2">
                        <span className="tb-avatar-sm shrink-0" aria-hidden>
                          {initials(assignee)}
                        </span>
                        <span className="truncate text-xs text-[var(--ink)]">{assignee}</span>
                      </span>
                    )}
                    {col("updatedAt") && (
                      <span className="text-xs text-[var(--muted)]">{formatDate(bug.updatedAt)}</span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        ) : (
          <table className="tb-table tb-mod-table">
            <colgroup>
              <col className="tb-col-check" />
              {col("id") && <col className="tb-col-id" />}
              {col("title") && <col className="tb-col-title" />}
              {col("status") && <col className="tb-col-status" />}
              {col("priority") && <col className="tb-col-priority" />}
              {col("assignee") && <col className="tb-col-assignee" />}
              {col("updatedAt") && <col className="tb-col-updated" />}
              <col className="tb-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="w-10 px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked, pageItems.map((b) => b.id))}
                    aria-label="Select all"
                  />
                </th>
                {col("id") && <th>Bug ID</th>}
                {col("title") && <th>Title</th>}
                {col("status") && <th>Status</th>}
                {col("priority") && <th>Priority</th>}
                {col("assignee") && <th>Assignee</th>}
                {col("updatedAt") && <th>Updated On</th>}
                <th className="tb-table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((bug) => {
                const label = displayStatus(bug.status);
                const assignee = nameOf(bug.assigneeId);
                return (
                  <tr key={bug.id} className={selectedIds.has(bug.id) ? "is-selected" : undefined}>
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={selectedIds.has(bug.id)}
                        onChange={(e) => onToggleOne(bug.id, e.target.checked)}
                        aria-label={`Select ${bug.title}`}
                      />
                    </td>
                    {col("id") && (
                      <td>
                        <button
                          type="button"
                          className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
                          onClick={() => onOpenBug(bug.id)}
                        >
                          {bugDisplayId(bug.id)}
                        </button>
                      </td>
                    )}
                    {col("title") && (
                      <td>
                        <button
                          type="button"
                          title={bug.title}
                          className="block w-full max-w-full truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                          onClick={() => onOpenBug(bug.id)}
                        >
                          {bug.title}
                        </button>
                      </td>
                    )}
                    {col("status") && (
                      <td>
                        <span className={`tb-bug-status-pill ${statusPillClass(label)}`}>{label}</span>
                      </td>
                    )}
                    {col("priority") && (
                      <td>
                        <PriorityCell priority={bug.priority} />
                      </td>
                    )}
                    {col("assignee") && (
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="tb-avatar-sm" aria-hidden>
                            {initials(assignee)}
                          </span>
                          <span className="truncate text-sm text-[var(--ink)]">{assignee}</span>
                        </span>
                      </td>
                    )}
                    {col("updatedAt") && (
                      <td className="whitespace-nowrap text-sm text-[var(--muted)]">
                        {formatDate(bug.updatedAt)}
                      </td>
                    )}
                    <td className="tb-table-actions-col">
                      <div className="tb-table-actions-cell">
                        <BugKebab
                          onView={() => onOpenBug(bug.id)}
                          onExport={() => onExportOne(bug.id)}
                          exportBusy={exportBusy}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5">
        <p className="text-sm text-[var(--muted)]">
          {filtered.length === 0
            ? "Showing 0 bugs"
            : `Showing ${startIdx + 1} to ${endIdx} of ${filtered.length} bugs`}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="tb-page-btn"
            disabled={safePage <= 1}
            aria-label="Previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {"\u2039"}
          </button>
          {pageNumbers(safePage, totalPages).map((p, i) =>
            p === "ellipsis" ? (
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
            {"\u203A"}
          </button>
        </div>
        <select
          className="tb-filter-select"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Bugs per page"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
