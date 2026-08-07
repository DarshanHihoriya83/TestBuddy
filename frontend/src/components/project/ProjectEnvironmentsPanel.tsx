import { useState, type FormEvent } from "react";
import type { Environment } from "../../types";

export function ProjectEnvironmentsPanel({
  projectId,
  environments,
  loading,
  error,
  envName,
  onEnvNameChange,
  onCreate,
  creating,
  onSetDefault,
  onToggleActive,
  onRename,
  onDelete,
  busyId,
}: {
  projectId: string;
  environments: Environment[];
  loading: boolean;
  error: string | null;
  envName: string;
  onEnvNameChange: (value: string) => void;
  onCreate: () => void;
  creating: boolean;
  onSetDefault: (env: Environment) => void;
  onToggleActive: (env: Environment) => void;
  onRename: (env: Environment, name: string) => void;
  onDelete: (envId: string) => void;
  busyId?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function startEdit(env: Environment) {
    setEditingId(env.id);
    setEditName(env.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  function onSubmitCreate(e: FormEvent) {
    e.preventDefault();
    if (!envName.trim()) return;
    onCreate();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 sm:px-0">
      <div className="mb-4 shrink-0 rounded-xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-sm font-bold text-[var(--ink)]">Add environment</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Testers pick an environment in the extension when filing bugs (e.g. Dev, Staging, Prod).
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={onSubmitCreate}>
          <label className="tb-label min-w-[12rem] flex-1">
            Name
            <input
              className="tb-input"
              value={envName}
              onChange={(e) => onEnvNameChange(e.target.value)}
              placeholder="Staging"
              maxLength={255}
              required
            />
          </label>
          <button
            type="submit"
            className="tb-btn-primary text-sm"
            disabled={creating || !envName.trim()}
          >
            {creating ? "Adding…" : "Add environment"}
          </button>
        </form>
        {error ? <p className="tb-alert-error mt-3 text-sm">{error}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--line)] bg-white">
        {loading ? (
          <p className="p-6 text-sm text-[var(--muted)]">Loading environments…</p>
        ) : environments.length === 0 ? (
          <p className="p-6 text-sm text-[var(--muted)]">
            No environments yet. Add at least one for project {projectId.slice(0, 8)}…
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {environments.map((env) => {
              const isEditing = editingId === env.id;
              const busy = busyId === env.id;
              return (
                <li
                  key={env.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                    env.active ? "bg-white" : "bg-slate-50/80"
                  }`}
                >
                  {isEditing ? (
                    <form
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const next = editName.trim();
                        if (!next || next === env.name) {
                          cancelEdit();
                          return;
                        }
                        onRename(env, next);
                        cancelEdit();
                      }}
                    >
                      <input
                        className="tb-input min-w-[10rem] flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        maxLength={255}
                        required
                      />
                      <button type="submit" className="tb-btn-primary text-xs" disabled={busy}>
                        Save
                      </button>
                      <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              env.active ? "text-[var(--ink)]" : "text-[var(--muted)] line-through"
                            }`}
                          >
                            {env.name}
                          </span>
                          {env.isDefault ? (
                            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                              Default
                            </span>
                          ) : null}
                          {!env.active ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!env.isDefault && env.active ? (
                          <button
                            type="button"
                            className="tb-btn-ghost text-xs"
                            disabled={busy}
                            onClick={() => onSetDefault(env)}
                          >
                            Set default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs"
                          disabled={busy}
                          onClick={() => startEdit(env)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs"
                          disabled={busy}
                          onClick={() => onToggleActive(env)}
                        >
                          {env.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs text-[var(--danger)]"
                          disabled={busy}
                          onClick={() => onDelete(env.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
