import { useState } from "react";
import { Link } from "react-router-dom";
import type { Module } from "../../types";

export function ProjectModulesPanel({
  projectId,
  modules,
  loading,
  canManage,
  moduleName,
  onModuleNameChange,
  onCreate,
  creating,
  onRename,
  renaming,
  onDelete,
  deleting,
  error,
}: {
  projectId: string;
  modules: Module[];
  loading?: boolean;
  canManage: boolean;
  moduleName: string;
  onModuleNameChange: (name: string) => void;
  onCreate: () => void;
  creating?: boolean;
  onRename: (id: string, name: string) => void;
  renaming?: boolean;
  onDelete: (id: string, name: string) => void;
  deleting?: boolean;
  error?: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function startEdit(mod: Module) {
    setEditingId(mod.id);
    setEditName(mod.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    onRename(editingId, editName.trim());
    cancelEdit();
  }

  return (
    <section className="tb-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)]">
            Modules
            <span className="ml-2 text-sm font-semibold text-[var(--muted)]">({modules.length})</span>
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Open a module to see and edit its bugs.
          </p>
        </div>
      </div>
      {error ? <p className="tb-alert-error mt-3">{error}</p> : null}
      {canManage && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="tb-label min-w-[200px] flex-1">
            New module
            <input
              className="tb-input"
              value={moduleName}
              onChange={(e) => onModuleNameChange(e.target.value)}
              placeholder="e.g. Login"
            />
          </label>
          <button
            type="button"
            className="tb-btn-primary text-sm"
            disabled={!moduleName.trim() || creating}
            onClick={onCreate}
          >
            {creating ? "Adding…" : "Add module"}
          </button>
        </div>
      )}
      {loading && <p className="mt-3 text-sm text-[var(--muted)]">Loading modules…</p>}
      {!loading && modules.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">No modules yet.</p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          if (editingId === mod.id) {
            return (
              <div
                key={mod.id}
                className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4"
              >
                <label className="tb-label">
                  Module name
                  <input
                    className="tb-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="tb-btn-primary text-xs"
                    disabled={renaming || !editName.trim()}
                    onClick={saveEdit}
                  >
                    Save
                  </button>
                  <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          }
          return (
            <article
              key={mod.id}
              className="group rounded-xl border border-[var(--line)] bg-[var(--input-bg)] p-4 transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/40"
            >
              <Link
                to={`/projects/${projectId}/modules/${mod.id}`}
                className="block min-w-0"
              >
                <h4 className="truncate text-base font-bold text-[var(--ink)] group-hover:text-[var(--accent)]">
                  {mod.name}
                </h4>
                <p className="mt-1 text-xs text-[var(--muted)]">Open module → bugs</p>
              </Link>
              {canManage && (
                <div className="mt-3 flex gap-2 border-t border-[var(--line)] pt-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)]"
                    onClick={() => startEdit(mod)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-600"
                    disabled={deleting}
                    onClick={() => {
                      if (window.confirm(`Delete module "${mod.name}"?`)) {
                        onDelete(mod.id, mod.name);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
