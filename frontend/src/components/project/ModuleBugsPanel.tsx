import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { Bug, BugPriority, BugStatus, User } from "../../types";

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
  exportBusy,
  search,
  onSearchChange,
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
  exportBusy?: boolean;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<"" | "Open" | "In Progress" | "Resolved" | "Closed">("");
  const [filterPriority, setFilterPriority] = useState<BugPriority | "">("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bugs.filter((b) => {
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
  }, [bugs, search, filterStatus, filterPriority, filterAssignee, users]);

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

  if (loading) {
    return <p className="px-4 py-6 text-sm text-[var(--muted)]">Loading bugs…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 xl:grid-cols-5">
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
              <path d="M12 3v3M12 21v-3M3 12h3M21 12h-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Total Bugs</p>
            <p className="tb-mod-stat-value">{stats.total}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-amber">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1" fill="currentColor" />
              <path d="M10.2 4.8 3.4 17.2A2 2 0 0 0 5.2 20h13.6a2 2 0 0 0 1.8-2.8L13.8 4.8a2 2 0 0 0-3.6 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Open</p>
            <p className="tb-mod-stat-value">{stats.open}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-violet">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <path d="M18 4v4h-4M6 20v-4h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">In Progress</p>
            <p className="tb-mod-stat-value">{stats.inProgress}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-green">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Resolved</p>
            <p className="tb-mod-stat-value">{stats.resolved}</p>
          </div>
        </div>
        <div className="tb-bug-stat">
          <div className="tb-bug-stat-icon tb-bug-stat-icon-slate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="tb-mod-stat-label">Closed</p>
            <p className="tb-mod-stat-value">{stats.closed}</p>
          </div>
        </div>
      </div>

      <div className="tb-mod-toolbar">
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
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="button" className="tb-link text-sm" onClick={clearFilters}>
          Clear
        </button>
        <Link
          to={`/bugs?projectId=${encodeURIComponent(projectId)}&moduleId=${encodeURIComponent(moduleId)}`}
          className="tb-btn-primary ml-auto shrink-0 text-sm"
        >
          + Report Bug
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
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
          </div>
        ) : (
          <table className="tb-table">
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
                <th>Bug ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Updated On</th>
                <th className="tb-table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((bug) => {
                const label = displayStatus(bug.status);
                const assignee = nameOf(bug.assigneeId);
                return (
                  <tr key={bug.id}>
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        checked={selectedIds.has(bug.id)}
                        onChange={(e) => onToggleOne(bug.id, e.target.checked)}
                        aria-label={`Select ${bug.title}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="font-mono text-xs font-semibold text-[var(--accent)] hover:underline"
                        onClick={() => onOpenBug(bug.id)}
                      >
                        {bugDisplayId(bug.id)}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="max-w-[18rem] truncate text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                        onClick={() => onOpenBug(bug.id)}
                      >
                        {bug.title}
                      </button>
                    </td>
                    <td>
                      <span className={`tb-bug-status-pill ${statusPillClass(label)}`}>{label}</span>
                    </td>
                    <td>
                      <PriorityCell priority={bug.priority} />
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span className="tb-avatar-sm" aria-hidden>
                          {initials(assignee)}
                        </span>
                        <span className="truncate text-sm text-[var(--ink)]">{assignee}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-sm text-[var(--muted)]">
                      {formatDate(bug.updatedAt)}
                    </td>
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
