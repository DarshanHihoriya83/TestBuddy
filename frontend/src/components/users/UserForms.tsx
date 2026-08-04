import type { FormEvent } from "react";
import type { Project, User, UserRole } from "../../types";
import { roleLabel } from "../../utils/roles";

export function CreateUserForm({
  name,
  email,
  password,
  role,
  roles,
  projects,
  createProjectIds,
  busy,
  onName,
  onEmail,
  onPassword,
  onRole,
  onToggleProject,
  onSubmit,
}: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  roles: UserRole[];
  projects: Project[];
  createProjectIds: string[];
  busy?: boolean;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onRole: (v: UserRole) => void;
  onToggleProject: (id: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form className="tb-card tb-card-accent mb-6 p-5" onSubmit={onSubmit}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
        Create user
      </h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="tb-label">
          Full name *
          <input
            className="tb-input"
            value={name}
            onChange={(e) => onName(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="tb-label">
          Email *
          <input
            className="tb-input"
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            required
          />
        </label>
        <label className="tb-label">
          Temporary password *
          <input
            className="tb-input"
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="tb-label">
          Role *
          <select
            className="tb-select"
            value={role}
            onChange={(e) => onRole(e.target.value as UserRole)}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {projects.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Assign to projects
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {projects.map((p) => {
              const on = createProjectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleProject(p.id)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line)] bg-[var(--input-bg)] text-[var(--ink)]"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button type="submit" className="tb-btn-primary mt-4 text-sm" disabled={busy}>
        {busy ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

export function EditUserForm({
  editing,
  meId,
  roles,
  editPassword,
  busy,
  onChange,
  onPassword,
  onCancel,
  onSubmit,
}: {
  editing: User;
  meId?: string;
  roles: UserRole[];
  editPassword: string;
  busy?: boolean;
  onChange: (next: User) => void;
  onPassword: (v: string) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form className="tb-card mb-6 border-[var(--accent)] p-5" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
          Edit user
        </h3>
        <button type="button" className="tb-btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="tb-label">
          Name
          <input
            className="tb-input"
            value={editing.name}
            onChange={(e) => onChange({ ...editing, name: e.target.value })}
            required
          />
        </label>
        <label className="tb-label">
          Email
          <input
            className="tb-input"
            type="email"
            value={editing.email}
            onChange={(e) => onChange({ ...editing, email: e.target.value })}
            required
          />
        </label>
        <label className="tb-label">
          Role
          <select
            className="tb-select"
            value={editing.role}
            onChange={(e) => onChange({ ...editing, role: e.target.value as UserRole })}
            disabled={editing.id === meId}
          >
            {Array.from(new Set([...roles, editing.role])).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          {editing.id === meId && (
            <span className="mt-1 text-[11px] text-[var(--muted)]">
              You cannot change your own role.
            </span>
          )}
        </label>
        <label className="tb-label">
          Status
          <select
            className="tb-select"
            value={editing.active === false ? "inactive" : "active"}
            onChange={(e) => onChange({ ...editing, active: e.target.value === "active" })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="tb-label md:col-span-2">
          Reset password (optional)
          <input
            className="tb-input"
            type="password"
            value={editPassword}
            onChange={(e) => onPassword(e.target.value)}
            minLength={8}
            placeholder="Leave blank to keep current password"
          />
        </label>
      </div>
      <button type="submit" className="tb-btn-primary mt-4 text-sm" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

export function ChangeRoleForm({
  user,
  roles,
  value,
  busy,
  onValue,
  onCancel,
  onSubmit,
}: {
  user: User;
  roles: UserRole[];
  value: UserRole;
  busy?: boolean;
  onValue: (r: UserRole) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form className="tb-card mb-6 border-[var(--accent)] p-5" onSubmit={onSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
          Change role — {user.name}
        </h3>
        <button type="button" className="tb-btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Current role: <strong>{roleLabel(user.role)}</strong>
        {" · "}
        {user.email}
      </p>
      <label className="tb-label mt-4 max-w-sm">
        New role *
        <select
          className="tb-select"
          value={value}
          onChange={(e) => onValue(e.target.value as UserRole)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="tb-btn-primary mt-4 text-sm"
        disabled={busy || value === user.role}
      >
        {busy ? "Updating…" : "Save role"}
      </button>
    </form>
  );
}
