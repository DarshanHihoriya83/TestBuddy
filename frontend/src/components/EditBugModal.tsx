import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEnvironments, fetchModules, fetchSprints, updateBug } from "../api";
import { useAuth } from "../auth";
import { queryKeys } from "../queryKeys";
import type { Bug, BugPriority, BugSeverity, BugStatus, User } from "../types";
import { notifyError, notifySuccess } from "../utils/notify";
import { assignableUsers } from "../utils/roles";
import { FlashAlert } from "./FlashAlert";

const STATUSES: BugStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "FIXED",
  "VERIFIED",
  "CLOSED",
  "REOPENED",
];
const PRIORITIES: BugPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SEVERITIES: BugSeverity[] = ["MINOR", "MAJOR", "CRITICAL", "BLOCKER"];

type FieldsForm = {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  status: BugStatus;
  assigneeId: string;
  sprintId: string;
  moduleId: string;
  environmentId: string;
};

function fieldsFromBug(bug: Bug): FieldsForm {
  return {
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    status: bug.status,
    assigneeId: bug.assigneeId,
    sprintId: bug.sprintId,
    moduleId: bug.moduleId ?? "",
    environmentId: bug.environmentId ?? "",
  };
}

/**
 * Edit-bug form in a modal — opened from the bugs list kebab menu.
 */
export function EditBugModal({
  open,
  bug,
  users,
  onClose,
}: {
  open: boolean;
  bug: Bug | null;
  users: User[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FieldsForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectId = bug?.projectId ?? "";

  const sprintsQuery = useQuery({
    queryKey: queryKeys.sprints(projectId),
    queryFn: () => fetchSprints(projectId),
    enabled: open && !!projectId,
  });

  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(projectId),
    queryFn: () => fetchModules(projectId),
    enabled: open && !!projectId,
  });

  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => fetchEnvironments(projectId),
    enabled: open && !!projectId,
  });

  useEffect(() => {
    if (!open || !bug) return;
    setForm(fieldsFromBug(bug));
    setError(null);
  }, [open, bug]);

  const saveMutation = useMutation({
    mutationFn: (payload: FieldsForm) => {
      if (!bug) throw new Error("No bug selected");
      return updateBug(bug.id, {
        title: payload.title.trim(),
        description: payload.description,
        priority: payload.priority,
        severity: payload.severity,
        assigneeId: payload.assigneeId,
        sprintId: payload.sprintId,
        projectId: bug.projectId,
        moduleId: payload.moduleId || null,
        environmentId: payload.environmentId || null,
        status: payload.status,
      });
    },
    onSuccess: async () => {
      notifySuccess("Bug saved");
      setError(null);
      if (bug) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.bug(bug.id) });
        await queryClient.invalidateQueries({ queryKey: ["bugs"] });
      }
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || "Could not save bug");
      notifyError(err.message || "Could not save bug");
    },
  });

  const busy = saveMutation.isPending;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !bug || !form) return null;

  const sprints = sprintsQuery.data ?? [];
  const modules = modulesQuery.data ?? [];
  const environments = environmentsQuery.data ?? [];
  const assignees = assignableUsers(user, users);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.assigneeId || !form.sprintId) {
      setError("Assignee and sprint are required");
      return;
    }
    saveMutation.mutate(form);
  }

  return createPortal(
    <div
      className="tb-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="edit-bug-title"
        className="tb-card tb-modal-panel tb-edit-bug-modal w-full max-w-3xl"
      >
        <form onSubmit={onSubmit} className="flex max-h-[min(92vh,44rem)] flex-col">
          <div className="tb-xport-head shrink-0">
            <div className="min-w-0">
              <h2 id="edit-bug-title" className="tb-xport-title">
                Edit bug
              </h2>
              <p className="tb-xport-sub truncate">{bug.title}</p>
            </div>
            <button
              type="button"
              className="tb-xport-close"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto px-0.5 py-1">
            <FlashAlert error={error} message={null} className="" />

            <label className="tb-label">
              Title
              <input
                className="tb-input"
                value={form.title}
                disabled={busy}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>

            <label className="tb-label">
              Description
              <textarea
                className="tb-input min-h-[120px]"
                value={form.description}
                disabled={busy}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="tb-label">
                Priority
                <select
                  className="tb-select"
                  value={form.priority}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as BugPriority })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tb-label">
                Severity
                <select
                  className="tb-select"
                  value={form.severity}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, severity: e.target.value as BugSeverity })}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tb-label">
                Status
                <select
                  className="tb-select"
                  value={form.status}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, status: e.target.value as BugStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="tb-label">
                Assignee
                <select
                  className="tb-select"
                  value={form.assigneeId}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                  required
                >
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id} title={`${u.name} (${u.role})`}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="tb-label">
                Sprint
                <select
                  className="tb-select"
                  value={form.sprintId}
                  disabled={busy || sprintsQuery.isLoading}
                  onChange={(e) => setForm({ ...form, sprintId: e.target.value })}
                  required
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tb-label">
                Module
                <select
                  className="tb-select"
                  value={form.moduleId}
                  disabled={busy || modulesQuery.isLoading}
                  onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
                >
                  <option value="">None</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tb-label">
                Environment
                <select
                  className="tb-select"
                  value={form.environmentId}
                  disabled={busy || environmentsQuery.isLoading}
                  onChange={(e) => setForm({ ...form, environmentId: e.target.value })}
                >
                  <option value="">None</option>
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="tb-xport-foot shrink-0">
            <button type="button" className="tb-btn-ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="tb-btn-primary" disabled={busy}>
              {busy ? "Saving\u2026" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
