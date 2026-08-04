import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import {
  createBugComment,
  deleteBug,
  deleteBugComment,
  fetchBugComments,
  updateBug,
  updateBugStatus,
} from "../api";
import { useAuth } from "../auth";
import { queryKeys } from "../queryKeys";
import type { Bug, BugPriority, BugSeverity, BugStatus, Cycle, Module, Step, User } from "../types";
import { exportBug, type ExportFormat } from "../utils/bugExport";
import { priorityTone, statusTone } from "../utils/bugUi";
import { BugScreenshots, BugStepsTable } from "./BugFullCard";
import { ExportFormatModal } from "./ExportFormatModal";
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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type FieldsForm = {
  title: string;
  description: string;
  priority: BugPriority;
  severity: BugSeverity;
  status: BugStatus;
  assigneeId: string;
  cycleId: string;
  moduleId: string;
};

function fieldsFromBug(bug: Bug): FieldsForm {
  return {
    title: bug.title,
    description: bug.description,
    priority: bug.priority,
    severity: bug.severity,
    status: bug.status,
    assigneeId: bug.assigneeId,
    cycleId: bug.cycleId,
    moduleId: bug.moduleId ?? "",
  };
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--panel)] px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

/**
 * Full bug detail layout (same as Bug Detail page) — inline on the module page.
 */
export function ModuleBugCard({
  bug,
  assigneeName,
  reporterName,
  cycleName,
  moduleName,
  projectName,
  users,
  cycles,
  modules,
  canEdit,
  canStatus,
  canComment,
  canDelete,
  onSaved,
  onDeleted,
}: {
  bug: Bug;
  assigneeName: string;
  reporterName: string;
  cycleName: string;
  moduleName: string;
  projectName: string;
  users: User[];
  cycles: Cycle[];
  modules: Module[];
  canEdit: boolean;
  canStatus: boolean;
  canComment: boolean;
  canDelete: boolean;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"view" | "fields" | "steps">("view");
  const [form, setForm] = useState<FieldsForm>(() => fieldsFromBug(bug));
  const [stepsDraft, setStepsDraft] = useState<Step[]>(() =>
    (bug.steps ?? []).map((s) => ({ ...s })),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);

  const commentsQuery = useQuery({
    queryKey: queryKeys.bugComments(bug.id),
    queryFn: () => fetchBugComments(bug.id),
  });

  useEffect(() => {
    if (mode === "view") {
      setForm(fieldsFromBug(bug));
      setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    }
  }, [bug, mode]);

  async function invalidateBug() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.bug(bug.id) });
    await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
  }

  const statusMutation = useMutation({
    mutationFn: (status: BugStatus) => updateBugStatus(bug.id, status),
    onSuccess: async () => {
      setMessage("Status updated");
      setError(null);
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const saveFields = useMutation({
    mutationFn: (payload: FieldsForm) =>
      updateBug(bug.id, {
        title: payload.title.trim(),
        description: payload.description,
        priority: payload.priority,
        severity: payload.severity,
        assigneeId: payload.assigneeId,
        cycleId: payload.cycleId,
        projectId: bug.projectId,
        moduleId: payload.moduleId || null,
        status: payload.status,
      }),
    onSuccess: async () => {
      setMessage("Bug saved");
      setError(null);
      setMode("view");
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const saveSteps = useMutation({
    mutationFn: (steps: Step[]) =>
      updateBug(bug.id, {
        title: bug.title,
        description: bug.description,
        priority: bug.priority,
        severity: bug.severity,
        assigneeId: bug.assigneeId,
        cycleId: bug.cycleId,
        projectId: bug.projectId,
        moduleId: bug.moduleId ?? null,
        status: bug.status,
        steps: steps.map((s, i) => ({
          ...s,
          order: i + 1,
          expectedResult: s.expectedResult?.trim() ? s.expectedResult : undefined,
        })),
      }),
    onSuccess: async () => {
      setMessage("Steps saved");
      setError(null);
      setMode("view");
      await invalidateBug();
      onSaved?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBug(bug.id),
    onSuccess: async () => {
      await invalidateBug();
      onDeleted?.();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => createBugComment(bug.id, body),
    onSuccess: async () => {
      setCommentBody("");
      setCommentError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteBugComment(commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(bug.id) });
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  function startFields() {
    setForm(fieldsFromBug(bug));
    setMode("fields");
    setError(null);
    setMessage(null);
  }

  function startSteps() {
    setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    setMode("steps");
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setMode("view");
    setForm(fieldsFromBug(bug));
    setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    setError(null);
  }

  function onSaveFields(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.assigneeId || !form.cycleId) {
      setError("Assignee and cycle are required");
      return;
    }
    saveFields.mutate(form);
  }

  function onSaveSteps(e: FormEvent) {
    e.preventDefault();
    saveSteps.mutate(stepsDraft);
  }

  function updateStep(index: number, patch: Partial<Step>) {
    setStepsDraft((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function onComment(e: FormEvent) {
    e.preventDefault();
    const text = commentBody.trim();
    if (!text) {
      setCommentError("Comment cannot be empty");
      return;
    }
    commentMutation.mutate(text);
  }

  async function onExportFormat(format: ExportFormat) {
    setExportBusy(true);
    setExportMsg(null);
    setExportError(false);
    try {
      await exportBug(format, {
        bug,
        projectName,
        cycleName,
        assigneeName,
        reporterName,
      });
      const label = format === "excel" ? "Excel" : format.toUpperCase();
      setExportMsg(`${label} downloaded — full bug info + screenshots`);
      setExportOpen(false);
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  const nameOf = (uid: string) => users.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const comments = commentsQuery.data ?? [];

  if (mode === "fields") {
    return (
      <form onSubmit={onSaveFields} className="space-y-5">
        <header className="tb-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[var(--ink)]">Edit bug</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                Cancel
              </button>
              <button type="submit" className="tb-btn-primary text-xs" disabled={saveFields.isPending}>
                {saveFields.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
          <FlashAlert error={error} message={message} className="" />
          <label className="tb-label">
            Title
            <input
              className="tb-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="tb-label">
            Description
            <textarea
              className="tb-input min-h-[120px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="tb-label">
              Priority
              <select
                className="tb-select"
                value={form.priority}
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
                onChange={(e) => setForm({ ...form, status: e.target.value as BugStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Assignee
              <select
                className="tb-select"
                value={form.assigneeId}
                onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                required
              >
                {users
                  .filter((u) => u.active !== false)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
              </select>
            </label>
            <label className="tb-label">
              Cycle
              <select
                className="tb-select"
                value={form.cycleId}
                onChange={(e) => setForm({ ...form, cycleId: e.target.value })}
                required
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Module
              <select
                className="tb-select"
                value={form.moduleId}
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
          </div>
        </header>
      </form>
    );
  }

  if (mode === "steps") {
    return (
      <form onSubmit={onSaveSteps} className="space-y-5">
        <section className="tb-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[var(--ink)]">Edit steps</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Update step text, actual result, and expected result (defect step only).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                Cancel
              </button>
              <button type="submit" className="tb-btn-primary text-xs" disabled={saveSteps.isPending}>
                {saveSteps.isPending ? "Saving…" : "Save steps"}
              </button>
            </div>
          </div>
          <FlashAlert error={error} message={message} className="" />
          {stepsDraft.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No steps to edit.</p>
          ) : (
            <div className="space-y-4">
              {stepsDraft.map((step, index) => (
                <div
                  key={`${step.order}-${index}`}
                  className="rounded-xl border border-[var(--line)] bg-[var(--input-bg)] p-4"
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Step {index + 1}
                  </p>
                  <div className="space-y-3">
                    <label className="tb-label">
                      Step
                      <textarea
                        className="tb-input min-h-[60px]"
                        value={step.description}
                        onChange={(e) => updateStep(index, { description: e.target.value })}
                      />
                    </label>
                    <label className="tb-label">
                      Actual result
                      <textarea
                        className="tb-input min-h-[60px]"
                        value={step.actualResult ?? ""}
                        onChange={(e) => updateStep(index, { actualResult: e.target.value })}
                      />
                    </label>
                    <label className="tb-label">
                      Expected result
                      <textarea
                        className="tb-input min-h-[60px]"
                        value={step.expectedResult ?? ""}
                        onChange={(e) => updateStep(index, { expectedResult: e.target.value })}
                        placeholder="Only on the defect step"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    );
  }

  return (
    <article className="space-y-5">
      <header className="tb-card tb-card-accent overflow-hidden">
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {canStatus && !canEdit ? (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                  Status
                  <select
                    className="tb-select py-1 text-xs"
                    value={bug.status}
                    disabled={statusMutation.isPending}
                    onChange={(e) => statusMutation.mutate(e.target.value as BugStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone(bug.status)}`}>
                  {bug.status}
                </span>
              )}
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${priorityTone(bug.priority)}`}
              >
                {bug.priority}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {bug.severity}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <button type="button" onClick={startFields} className="tb-btn-primary text-xs">
                  Edit bug
                </button>
              )}
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="tb-btn-ghost text-xs"
              >
                Export
              </button>
              {canDelete && (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete bug "${bug.title}"?`)) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          <FlashAlert error={error} message={message} className="" />
          {exportMsg && (
            <p className={`text-xs ${exportError ? "tb-alert-error" : "text-[var(--success)]"}`}>
              {exportMsg}
            </p>
          )}

          <h2 className="text-3xl font-bold tracking-tight text-[var(--ink)]">{bug.title}</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
            {bug.description}
          </p>
        </div>

        <dl className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetaTile label="Assignee" value={assigneeName} />
          <MetaTile label="Reporter" value={reporterName} />
          <MetaTile label="Project" value={projectName} />
          <MetaTile label="Module" value={moduleName} />
          <MetaTile label="Cycle" value={cycleName} />
          <MetaTile label="Filed" value={formatWhen(bug.createdAt)} />
        </dl>
      </header>

      <section className="tb-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">Reproduction steps</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Step + Actual Result on every row. Expected Result only on the defect step.
            </p>
          </div>
          {canEdit && (
            <button type="button" onClick={startSteps} className="tb-btn-primary text-xs">
              Edit steps
            </button>
          )}
        </div>
        <BugStepsTable bug={bug} />
      </section>

      <section className="tb-card p-6">
        <h3 className="text-lg font-bold text-[var(--ink)]">
          Screenshots ({bug.screenshots?.length ?? 0})
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Captured and highlighted from the TestBuddy extension.
        </p>
        <BugScreenshots screenshots={bug.screenshots} />
      </section>

      <section className="tb-card p-6">
        <h3 className="text-lg font-bold text-[var(--ink)]">Comments ({comments.length})</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Testers can edit bug fields and comment. Developers can update status and comment.
        </p>
        {commentError && <p className="tb-alert-error mt-3">{commentError}</p>}
        <div className="mt-4 space-y-3">
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--input-bg)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {c.authorName || nameOf(c.authorId)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--muted)]">{formatWhen(c.createdAt)}</span>
                  {(user?.id === c.authorId || canDelete) && (
                    <button
                      type="button"
                      className="text-xs text-rose-600"
                      disabled={deleteCommentMutation.isPending}
                      onClick={() => deleteCommentMutation.mutate(c.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink)]">{c.body}</p>
            </div>
          ))}
          {!commentsQuery.isLoading && comments.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No comments yet.</p>
          )}
        </div>
        {canComment ? (
          <form className="mt-4" onSubmit={onComment}>
            <label className="tb-label">
              Add comment
              <textarea
                className="tb-input min-h-[80px]"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment…"
              />
            </label>
            <button
              type="submit"
              className="tb-btn-primary mt-3 text-sm"
              disabled={commentMutation.isPending || !commentBody.trim()}
            >
              {commentMutation.isPending ? "Posting…" : "Post comment"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-xs text-[var(--muted)]">You can read comments only.</p>
        )}
      </section>

      <ExportFormatModal
        open={exportOpen}
        busy={exportBusy}
        bugTitle={bug.title}
        onClose={() => {
          if (!exportBusy) setExportOpen(false);
        }}
        onSelect={(format) => void onExportFormat(format)}
      />
    </article>
  );
}
