import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { Project, UserRole } from "../../types";

const ROLE_FILTERS: Array<{ id: "ALL" | UserRole; label: string }> = [
  { id: "ALL", label: "All roles" },
  { id: "SUPERADMIN", label: "Super Admin" },
  { id: "MANAGER", label: "Manager" },
  { id: "DEVELOPER", label: "Developer" },
  { id: "TESTER", label: "Tester" },
];

export type StatusFilter = "active" | "inactive" | "all";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "all", label: "All" },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** True while the user is typing somewhere, so "/" stays a literal slash. */
function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function UserFiltersBar({
  projects,
  projectFilter,
  onProjectFilter,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  roleFilter,
  onRoleFilter,
  statusCounts,
  roleCounts,
  filtersDirty,
  onClear,
}: {
  projects: Project[];
  projectFilter: string;
  onProjectFilter: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  roleFilter: "ALL" | UserRole;
  onRoleFilter: (r: "ALL" | UserRole) => void;
  statusCounts: { active: number; inactive: number; all: number };
  roleCounts: Record<string, number>;
  filtersDirty: boolean;
  onClear: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedProject = projects.find((p) => p.id === projectFilter);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const statusCountOf = (id: StatusFilter) =>
    id === "active"
      ? statusCounts.active
      : id === "inactive"
        ? statusCounts.inactive
        : statusCounts.all;

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (search.trim()) {
    chips.push({
      key: "search",
      label: `Search: “${search.trim()}”`,
      onRemove: () => onSearch(""),
    });
  }
  if (projectFilter && selectedProject) {
    chips.push({
      key: "project",
      label: `Project: ${selectedProject.name}`,
      onRemove: () => onProjectFilter(""),
    });
  }
  if (roleFilter !== "ALL") {
    chips.push({
      key: "role",
      label: `Role: ${ROLE_FILTERS.find((r) => r.id === roleFilter)?.label ?? roleFilter}`,
      onRemove: () => onRoleFilter("ALL"),
    });
  }
  if (statusFilter !== "active") {
    chips.push({
      key: "status",
      label: `Status: ${STATUS_FILTERS.find((s) => s.id === statusFilter)?.label ?? statusFilter}`,
      onRemove: () => onStatusFilter("active"),
    });
  }

  return (
    <section className="tb-card overflow-hidden">
      <div className="tb-filter-toolbar">
        <div className="tb-filter-search">
          <span className="tb-filter-search-icon">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.preventDefault();
                onSearch("");
              }
            }}
            placeholder="Search by name, email, or role…"
            aria-label="Search users"
            className="tb-search-input"
          />
          {search ? (
            <button
              type="button"
              className="tb-filter-search-clear"
              aria-label="Clear search"
              onClick={() => {
                onSearch("");
                searchRef.current?.focus();
              }}
            >
              <CloseIcon />
            </button>
          ) : (
            <kbd className="tb-kbd">/</kbd>
          )}
        </div>

        <div className="tb-segment" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={statusFilter === s.id}
              className={`tb-segment-btn ${statusFilter === s.id ? "is-active" : ""}`}
              onClick={() => onStatusFilter(s.id)}
            >
              {s.label}
              <span className="tb-count-pill">{statusCountOf(s.id)}</span>
            </button>
          ))}
        </div>

        <select
          className="tb-filter-select"
          value={roleFilter}
          aria-label="Filter by role"
          onChange={(e) => onRoleFilter(e.target.value as "ALL" | UserRole)}
        >
          {ROLE_FILTERS.map((r) => {
            const count = roleCounts[r.id] || 0;
            if (r.id !== "ALL" && count === 0 && roleFilter !== r.id) return null;
            return (
              <option key={r.id} value={r.id}>
                {r.label} ({count})
              </option>
            );
          })}
        </select>

        <select
          className="tb-filter-select"
          value={projectFilter}
          aria-label="Filter by project"
          onChange={(e) => onProjectFilter(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {filtersDirty && (
          <button type="button" className="tb-btn-ghost text-xs" onClick={onClear}>
            Reset
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="tb-filter-chips">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Applied
          </span>
          {chips.map((chip) => (
            <span key={chip.key} className="tb-filter-chip">
              <span className="tb-filter-chip-label">{chip.label}</span>
              <button
                type="button"
                className="tb-chip-remove"
                aria-label={`Remove filter ${chip.label}`}
                onClick={chip.onRemove}
              >
                <CloseIcon />
              </button>
            </span>
          ))}
          <button type="button" className="tb-link ml-auto text-xs" onClick={onClear}>
            Clear all
          </button>
        </div>
      )}

      {projectFilter && selectedProject && (
        <div className="border-t border-[var(--line)] bg-[var(--accent-soft)] px-4 py-2 text-xs text-[var(--accent)]">
          Showing members of <strong>{selectedProject.name}</strong>
          {" · "}
          <Link className="underline" to={`/projects/${selectedProject.id}`}>
            Open project →
          </Link>
        </div>
      )}
    </section>
  );
}
