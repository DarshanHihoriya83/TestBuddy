import type { User } from "../types";
import { roleLabel } from "../utils/roles";

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
}: {
  members: User[];
  currentUserId?: string;
  canRemove?: boolean;
  removing?: boolean;
  onRemove?: (userId: string, name: string) => void;
  emptyText?: string;
}) {
  if (members.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">{emptyText ?? "No members yet."}</p>;
  }
  return (
    <div className="mt-3 divide-y divide-[var(--line)]">
      {members.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {m.name}
              {m.id === currentUserId ? (
                <span className="ml-2 text-xs font-medium text-[var(--accent)]">(you)</span>
              ) : null}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{m.email}</p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {roleLabel(m.role)}
          </span>
          {canRemove && onRemove ? (
            <button
              type="button"
              className="tb-btn-ghost text-xs text-rose-600"
              disabled={removing}
              onClick={() => {
                if (window.confirm(`Remove ${m.name}?`)) onRemove(m.id, m.name);
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
