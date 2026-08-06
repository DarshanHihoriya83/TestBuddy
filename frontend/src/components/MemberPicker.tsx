import type { User, UserRole } from "../types";
import { roleLabel } from "../utils/roles";

const ROLE_CHIP: Record<UserRole, string> = {
  SUPERADMIN: "is-superadmin",
  MANAGER: "is-manager",
  DEVELOPER: "is-developer",
  TESTER: "is-tester",
};

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** Shared add-member control for org / project panels. */
export function MemberPicker({
  addableUsers,
  value,
  onChange,
  onAdd,
  busy,
  label = "Add member",
}: {
  addableUsers: User[];
  value: string;
  onChange: (userId: string) => void;
  onAdd: () => void;
  busy?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="tb-label min-w-[220px] flex-1">
        {label}
        <select className="tb-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select a user…</option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({roleLabel(u.role)})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tb-btn-primary text-sm"
        disabled={!value || busy}
        onClick={onAdd}
      >
        {busy ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

export function MemberList({
  members,
  currentUserId,
  canRemove,
  removing,
  onRemove,
  emptyText,
  /** When false, parent owns confirmation UI (e.g. ConfirmDialog). Default true. */
  confirmBeforeRemove = true,
}: {
  members: User[];
  currentUserId?: string;
  canRemove?: boolean;
  removing?: boolean;
  onRemove?: (userId: string, name: string) => void;
  emptyText?: string;
  confirmBeforeRemove?: boolean;
}) {
  if (members.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">{emptyText ?? "No members yet."}</p>;
  }
  return (
    <div className="mt-3 divide-y divide-[var(--line)]">
      {members.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
          <span className="tb-user-avatar" aria-hidden>
            {initialsOf(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {m.name}
              {m.id === currentUserId ? (
                <span className="ml-2 text-xs font-medium text-[var(--accent)]">(you)</span>
              ) : null}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{m.email}</p>
          </div>
          <span className={`tb-role-chip ${ROLE_CHIP[m.role]}`}>{roleLabel(m.role)}</span>
          {canRemove && onRemove ? (
            <button
              type="button"
              className="tb-btn-ghost text-xs text-rose-600"
              disabled={removing}
              onClick={() => {
                if (confirmBeforeRemove && !window.confirm(`Remove ${m.name}?`)) return;
                onRemove(m.id, m.name);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
