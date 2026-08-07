import { useState, type FormEvent } from "react";
import type { Project, Sprint } from "../../types";

type AdoIteration = {
  id: string;
  name: string;
  path: string;
  startDate?: string | null;
  finishDate?: string | null;
  timeFrame?: string | null;
  team?: string;
};

export function ProjectSprintsPanel({
  project,
  sprints,
  loading,
  error,
  sprintName,
  onSprintNameChange,
  onCreate,
  creating,
  onSetDefault,
  onToggleActive,
  onRename,
  onDelete,
  busyId,
  adoOrgUrl,
  adoProject,
  adoTeam,
  adoPat,
  adoPatConfigured,
  onAdoOrgUrlChange,
  onAdoProjectChange,
  onAdoTeamChange,
  onAdoPatChange,
  onSaveAdo,
  savingAdo,
  onTestAdo,
  testingAdo,
  onLoadIterations,
  loadingIterations,
  iterations,
  selectedIterationIds,
  onToggleIteration,
  onImportAdo,
  importingAdo,
}: {
  project: Project;
  sprints: Sprint[];
  loading: boolean;
  error: string | null;
  sprintName: string;
  onSprintNameChange: (value: string) => void;
  onCreate: () => void;
  creating: boolean;
  onSetDefault: (sprint: Sprint) => void;
  onToggleActive: (sprint: Sprint) => void;
  onRename: (sprint: Sprint, name: string) => void;
  onDelete: (sprintId: string) => void;
  busyId?: string | null;
  adoOrgUrl: string;
  adoProject: string;
  adoTeam: string;
  adoPat: string;
  adoPatConfigured: boolean;
  onAdoOrgUrlChange: (v: string) => void;
  onAdoProjectChange: (v: string) => void;
  onAdoTeamChange: (v: string) => void;
  onAdoPatChange: (v: string) => void;
  onSaveAdo: () => void;
  savingAdo: boolean;
  onTestAdo: () => void;
  testingAdo: boolean;
  onLoadIterations: () => void;
  loadingIterations: boolean;
  iterations: AdoIteration[];
  selectedIterationIds: Set<string>;
  onToggleIteration: (id: string) => void;
  onImportAdo: () => void;
  importingAdo: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function onSubmitCreate(e: FormEvent) {
    e.preventDefault();
    if (!sprintName.trim()) return;
    onCreate();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1 sm:px-0">
      <div className="shrink-0 rounded-xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-sm font-bold text-[var(--ink)]">Azure DevOps</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Link this project to ADO, then import team iterations as sprints. PAT is stored encrypted and
          never shown again.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="tb-label">
            Org URL
            <input
              className="tb-input"
              value={adoOrgUrl}
              onChange={(e) => onAdoOrgUrlChange(e.target.value)}
              placeholder="https://dev.azure.com/your-org"
            />
          </label>
          <label className="tb-label">
            Project name
            <input
              className="tb-input"
              value={adoProject}
              onChange={(e) => onAdoProjectChange(e.target.value)}
              placeholder="MyProject"
            />
          </label>
          <label className="tb-label">
            Team (optional)
            <input
              className="tb-input"
              value={adoTeam}
              onChange={(e) => onAdoTeamChange(e.target.value)}
              placeholder="Defaults to first team"
            />
          </label>
          <label className="tb-label">
            Personal Access Token
            <input
              className="tb-input"
              type="password"
              value={adoPat}
              onChange={(e) => onAdoPatChange(e.target.value)}
              placeholder={adoPatConfigured ? "•••• configured — enter to replace" : "PAT with Work read"}
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="tb-btn-primary text-sm" disabled={savingAdo} onClick={onSaveAdo}>
            {savingAdo ? "Saving…" : "Save ADO settings"}
          </button>
          <button
            type="button"
            className="tb-btn-ghost text-sm"
            disabled={testingAdo || !adoPatConfigured}
            onClick={onTestAdo}
          >
            {testingAdo ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            className="tb-btn-ghost text-sm"
            disabled={loadingIterations || !adoPatConfigured}
            onClick={onLoadIterations}
          >
            {loadingIterations ? "Syncing…" : "Sync"}
          </button>
        </div>
        {iterations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Select iterations to import
            </p>
            <ul className="max-h-40 space-y-1 overflow-auto rounded-lg border border-[var(--line)] p-2">
              {iterations.map((it) => (
                <li key={it.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIterationIds.has(it.id)}
                      onChange={() => onToggleIteration(it.id)}
                    />
                    <span className="font-medium">{it.name}</span>
                    {it.timeFrame ? (
                      <span className="text-[10px] uppercase text-[var(--muted)]">{it.timeFrame}</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="tb-btn-primary text-sm"
              disabled={importingAdo || selectedIterationIds.size === 0}
              onClick={onImportAdo}
            >
              {importingAdo ? "Importing…" : `Import ${selectedIterationIds.size} sprint(s)`}
            </button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 rounded-xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-sm font-bold text-[var(--ink)]">Add sprint</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Manual sprints work without ADO. Testers pick a sprint when filing bugs.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={onSubmitCreate}>
          <label className="tb-label min-w-[12rem] flex-1">
            Name
            <input
              className="tb-input"
              value={sprintName}
              onChange={(e) => onSprintNameChange(e.target.value)}
              placeholder="Sprint 3"
              maxLength={255}
              required
            />
          </label>
          <button
            type="submit"
            className="tb-btn-primary text-sm"
            disabled={creating || !sprintName.trim()}
          >
            {creating ? "Adding…" : "Add sprint"}
          </button>
        </form>
      </div>

      {error ? <p className="tb-alert-error text-sm">{error}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--line)] bg-white">
        {loading ? (
          <p className="p-6 text-sm text-[var(--muted)]">Loading sprints…</p>
        ) : sprints.length === 0 ? (
          <p className="p-6 text-sm text-[var(--muted)]">
            No sprints yet for {project.name}. Add one or import from Azure DevOps.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {sprints.map((sprint) => {
              const isEditing = editingId === sprint.id;
              const busy = busyId === sprint.id;
              return (
                <li
                  key={sprint.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                    sprint.active === false ? "bg-slate-50/80" : "bg-white"
                  }`}
                >
                  {isEditing ? (
                    <form
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const next = editName.trim();
                        if (!next || next === sprint.name) {
                          setEditingId(null);
                          return;
                        }
                        onRename(sprint, next);
                        setEditingId(null);
                      }}
                    >
                      <input
                        className="tb-input min-w-[10rem] flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        required
                      />
                      <button type="submit" className="tb-btn-primary text-xs" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="tb-btn-ghost text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              sprint.active === false
                                ? "text-[var(--muted)] line-through"
                                : "text-[var(--ink)]"
                            }`}
                          >
                            {sprint.name}
                          </span>
                          {sprint.isDefault ? (
                            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                              Default
                            </span>
                          ) : null}
                          {sprint.source === "ADO" ? (
                            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                              ADO
                            </span>
                          ) : null}
                          {sprint.active === false ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                              Inactive
                            </span>
                          ) : null}
                        </div>
                        {sprint.adoIterationPath ? (
                          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                            {sprint.adoIterationPath}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!sprint.isDefault && sprint.active !== false ? (
                          <button
                            type="button"
                            className="tb-btn-ghost text-xs"
                            disabled={busy}
                            onClick={() => onSetDefault(sprint)}
                          >
                            Set default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(sprint.id);
                            setEditName(sprint.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs"
                          disabled={busy}
                          onClick={() => onToggleActive(sprint)}
                        >
                          {sprint.active === false ? "Activate" : "Deactivate"}
                        </button>
                        <button
                          type="button"
                          className="tb-btn-ghost text-xs text-[var(--danger)]"
                          disabled={busy}
                          onClick={() => onDelete(sprint.id)}
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
