import { Link } from "react-router-dom";
import type { Project, UserRole } from "../../types";

const ROLE_FILTERS: Array<{ id: "ALL" | UserRole; label: string }> = [
  { id: "ALL", label: "All roles" },
  { id: "SUPERADMIN", label: "Super Admin" },
  { id: "ADMIN", label: "Admin" },
  { id: "MANAGER", label: "Manager" },
  { id: "DEVELOPER", label: "Developer" },
  { id: "TESTER", label: "Tester" },
];

export type StatusFilter = "active" | "inactive" | "all";

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
  const selectedProject = projects.find((p) => p.id === projectFilter);

  return (
    <section className="tb-card mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[var(--ink)]">Filters</h3>
        {filtersDirty && (
          <button type="button" className="tb-link text-xs" onClick={onClear}>
            Reset filters
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="tb-label">
          Project
          <select
            className="tb-select"
            value={projectFilter}
            onChange={(e) => onProjectFilter(e.target.value)}
          >
            <option value="">All projects (every user)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tb-label">
          Search
          <input
            className="tb-input"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Name, email, or role…"
          />
        </label>
      </div>

      {projectFilter && selectedProject && (
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent)]">
          Showing members of <strong>{selectedProject.name}</strong>
          {" · "}
          <Link className="underline" to={`/projects/${selectedProject.id}`}>
            Open project →
          </Link>
        </p>
      )}

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Status
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            { id: "active" as const, label: "Active", count: statusCounts.active },
            { id: "inactive" as const, label: "Inactive", count: statusCounts.inactive },
            { id: "all" as const, label: "All", count: statusCounts.all },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStatusFilter(s.id)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === s.id
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--line)] bg-[var(--input-bg)] text-[var(--ink)] hover:border-[var(--accent)]/40"
            }`}
          >
            {s.label}
            <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
              {s.count}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Role
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((r) => {
          const count = roleCounts[r.id] || 0;
          if (r.id !== "ALL" && count === 0 && roleFilter !== r.id) return null;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onRoleFilter(r.id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                roleFilter === r.id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--input-bg)] text-[var(--ink)] hover:border-[var(--accent)]/40"
              }`}
            >
              {r.label}
              <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
