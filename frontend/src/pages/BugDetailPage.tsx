import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import {
  createBugComment,
  deleteBug,
  deleteBugComment,
  fetchBug,
  fetchBugComments,
  fetchSprints,
  fetchEnvironments,
  fetchModules,
  fetchProjects,
  fetchUsers,
  pushBugToAdo,
  syncBugFromAdo,
  updateBug,
  updateBugStatus,
} from "../api";
import { useAuth } from "../auth";
import { BugScreenshots, BugStepsTable } from "../components/BugFullCard";
import { ExportFormatModal } from "../components/ExportFormatModal";
import { FlashAlert } from "../components/FlashAlert";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Bug, BugPriority, BugSeverity, BugStatus, Step } from "../types";
import { exportBug, type ExportFormat } from "../utils/bugExport";
import { priorityTone, statusTone } from "../utils/bugUi";
import {
  assignableUsers,
  canCommentOnBug,
  canDeleteBug,
  canFullEditBug,
  canUpdateBugStatus,
} from "../utils/roles";

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

type EditForm = {
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

function formFromBug(bug: Bug): EditForm {
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

export function BugDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fromProjectId = (location.state as { fromProjectId?: string; fromModuleId?: string } | null)
    ?.fromProjectId;
  const fromModuleId = (location.state as { fromProjectId?: string; fromModuleId?: string } | null)
    ?.fromModuleId;
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"fields" | "steps" | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [stepsDraft, setStepsDraft] = useState<Step[]>([]);
  const [adoBusy, setAdoBusy] = useState(false);

  const canEdit = canFullEditBug(user);
  const canStatus = canUpdateBugStatus(user);
  const canComment = canCommentOnBug(user);
  const canDelete = canDeleteBug(user);

  const bugQuery = useQuery({
    queryKey: queryKeys.bug(id),
    queryFn: () => fetchBug(id),
    enabled: !!id,
  });
  const commentsQuery = useQuery({
    queryKey: queryKeys.bugComments(id),
    queryFn: () => fetchBugComments(id),
    enabled: !!id,
  });
  const usersQuery = useQuery({ queryKey: queryKeys.users(), queryFn: () => fetchUsers() });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });

  const projectId = bugQuery.data?.projectId ?? projectsQuery.data?.[0]?.id;
  const sprintsQuery = useQuery({
    queryKey: queryKeys.sprints(projectId || "_"),
    queryFn: () => fetchSprints(projectId!),
    enabled: !!projectId,
  });
  const modulesQuery = useQuery({
    queryKey: queryKeys.modules(projectId || "_"),
    queryFn: () => fetchModules(projectId!),
    enabled: !!projectId,
  });
  const environmentsQuery = useQuery({
    queryKey: queryKeys.environments(projectId || "_"),
    queryFn: () => fetchEnvironments(projectId!),
    enabled: !!projectId,
  });

  const statusMutation = useMutation({
    mutationFn: (status: BugStatus) => updateBugStatus(id, status),
    onSuccess: async () => {
      setActionMsg("Status updated");
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bug(id) });
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
      setActionMsg(null);
    },
  });

  const saveFieldsMutation = useMutation({
    mutationFn: (payload: EditForm) =>
      updateBug(id, {
        title: payload.title.trim(),
        description: payload.description,
        priority: payload.priority,
        severity: payload.severity,
        assigneeId: payload.assigneeId,
        sprintId: payload.sprintId,
        projectId: bugQuery.data!.projectId,
        moduleId: payload.moduleId || null,
        environmentId: payload.environmentId || null,
        status: payload.status,
      }),
    onSuccess: async () => {
      setActionMsg("Bug updated");
      setActionError(null);
      setEditMode(null);
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bug(id) });
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
      setActionMsg(null);
    },
  });

  const saveStepsMutation = useMutation({
    mutationFn: (steps: Step[]) => {
      const b = bugQuery.data!;
      return updateBug(id, {
        title: b.title,
        description: b.description,
        priority: b.priority,
        severity: b.severity,
        assigneeId: b.assigneeId,
        sprintId: b.sprintId,
        projectId: b.projectId,
        moduleId: b.moduleId ?? null,
        status: b.status,
        steps: steps.map((s, i) => ({
          ...s,
          order: i + 1,
          expectedResult: s.expectedResult?.trim() ? s.expectedResult : undefined,
        })),
      });
    },
    onSuccess: async () => {
      setActionMsg("Steps updated");
      setActionError(null);
      setEditMode(null);
      setStepsDraft([]);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bug(id) });
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    },
    onError: (err: Error) => {
      setActionError(err.message);
      setActionMsg(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBug(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
      navigate(
        fromModuleId && fromProjectId
          ? `/projects/${fromProjectId}/modules/${fromModuleId}`
          : fromProjectId
            ? `/projects/${fromProjectId}`
            : "/bugs",
      );
    },
    onError: (err: Error) => {
      setActionError(err.message);
      setActionMsg(null);
    },
  });

  async function onPushAdo() {
    setAdoBusy(true);
    setActionError(null);
    try {
      const result = await pushBugToAdo(id);
      setActionMsg(
        result.created
          ? `Created Azure DevOps work item #${result.adoWorkItemId}`
          : `Updated Azure DevOps work item #${result.adoWorkItemId}`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.bug(id) });
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "ADO push failed");
      setActionMsg(null);
    } finally {
      setAdoBusy(false);
    }
  }

  async function onSyncAdo() {
    setAdoBusy(true);
    setActionError(null);
    try {
      const result = await syncBugFromAdo(id);
      setActionMsg(
        `Synced from ADO #${result.adoWorkItemId}` +
          (result.adoState ? ` (${result.adoState})` : "") +
          (result.commentsImported ? ` · ${result.commentsImported} comment(s)` : ""),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.bug(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(id) });
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "ADO sync failed");
      setActionMsg(null);
    } finally {
      setAdoBusy(false);
    }
  }

  const commentMutation = useMutation({
    mutationFn: (body: string) => createBugComment(id, body),
    onSuccess: async () => {
      setCommentBody("");
      setCommentError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(id) });
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: deleteBugComment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bugComments(id) });
    },
  });

  useEffect(() => {
    if (editMode === "fields" && bugQuery.data && !form) {
      setForm(formFromBug(bugQuery.data));
    }
  }, [editMode, bugQuery.data, form]);

  const bug = bugQuery.data;
  const nameOf = (uid: string) => usersQuery.data?.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const sprintName = sprintsQuery.data?.find((c) => c.id === bug?.sprintId)?.name ?? "—";
  const moduleName =
    modulesQuery.data?.find((m) => m.id === bug?.moduleId)?.name ??
    (bug?.moduleId ? bug.moduleId.slice(0, 8) : "—");
  const projectName = projectsQuery.data?.find((p) => p.id === bug?.projectId)?.name ?? "—";
  const backToProject = fromProjectId || bug?.projectId;
  const backToModule =
    fromModuleId && backToProject
      ? `/projects/${backToProject}/modules/${fromModuleId}`
      : null;

  async function onExportFormat(format: ExportFormat) {
    if (!bug) return;
    setExportBusy(true);
    setExportMsg(null);
    setExportError(false);
    try {
      await exportBug(format, {
        bug,
        projectName,
        sprintName,
        assigneeName: nameOf(bug.assigneeId),
        reporterName: nameOf(bug.reporterId),
      });
      const label = format === "excel" ? "Excel" : format.toUpperCase();
      setExportMsg(`${label} downloaded � full bug info + screenshots`);
      setExportOpen(false);
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
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

  function startEditFields() {
    if (!bug) return;
    setForm(formFromBug(bug));
    setEditMode("fields");
    setActionMsg(null);
    setActionError(null);
  }

  function startEditSteps() {
    if (!bug) return;
    setStepsDraft((bug.steps ?? []).map((s) => ({ ...s })));
    setEditMode("steps");
    setActionMsg(null);
    setActionError(null);
  }

  function cancelEdit() {
    setEditMode(null);
    setForm(null);
    setStepsDraft([]);
  }

  function onSaveFields(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.title.trim()) {
      setActionError("Title is required");
      return;
    }
    if (!form.assigneeId || !form.sprintId) {
      setActionError("Assignee and sprint are required");
      return;
    }
    saveFieldsMutation.mutate(form);
  }

  function onSaveSteps(e: FormEvent) {
    e.preventDefault();
    saveStepsMutation.mutate(stepsDraft);
  }

  function updateStep(index: number, patch: Partial<Step>) {
    setStepsDraft((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const pageTitle = bug?.title
    ? bug.title.length > 40
      ? `${bug.title.slice(0, 40)}�`
      : bug.title
    : "Bug detail";

  const viewing = bug && editMode === null;
  return (
    <Shell title={pageTitle}>
      <div className="flex flex-wrap gap-3 text-sm">
        {backToModule ? (
          <Link to={backToModule} className="tb-link">
            ? Back to module
          </Link>
        ) : backToProject ? (
          <Link to={`/projects/${backToProject}`} className="tb-link">
            ? Back to project
          </Link>
        ) : (
          <Link to="/bugs" className="tb-link">
            ? Back to bugs
          </Link>
        )}
      </div>

      <QueryStatus
        isLoading={bugQuery.isLoading}
        error={bugQuery.error}
        onRetry={() => void bugQuery.refetch()}
        loadingText="Loading�"
        className="mt-4"
      />

      {bug && editMode === "fields" && form ? (
        <form onSubmit={onSaveFields} className="mt-4 space-y-5">
          <header className="tb-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[var(--ink)]">Edit bug</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="tb-btn-ghost text-xs" onClick={cancelEdit}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tb-btn-primary text-xs"
                  disabled={saveFieldsMutation.isPending}
                >
                  {saveFieldsMutation.isPending ? "Saving�" : "Save changes"}
                </button>
              </div>
            </div>
            <FlashAlert error={actionError} message={actionMsg} className="" />

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
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value as BugPriority })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, severity: e.target.value as BugSeverity })
                  }
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
                  {assignableUsers(user, usersQuery.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
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
                  onChange={(e) => setForm({ ...form, sprintId: e.target.value })}
                  required
                >
                  {(sprintsQuery.data ?? []).map((c) => (
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
                  {(modulesQuery.data ?? []).map((m) => (
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
                  onChange={(e) => setForm({ ...form, environmentId: e.target.value })}
                >
                  <option value="">Not set</option>
                  {(environmentsQuery.data ?? [])
                    .filter((e) => e.active)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </header>
        </form>
      ) : null}

      {bug && editMode === "steps" ? (
        <form onSubmit={onSaveSteps} className="mt-4 space-y-5">
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
                <button
                  type="submit"
                  className="tb-btn-primary text-xs"
                  disabled={saveStepsMutation.isPending}
                >
                  {saveStepsMutation.isPending ? "Saving�" : "Save steps"}
                </button>
              </div>
            </div>
            <FlashAlert error={actionError} message={actionMsg} className="" />
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
      ) : null}

      {viewing && (
        <article className="mt-4 space-y-5">
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
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone(bug.status)}`}
                    >
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
                    <button
                      type="button"
                      onClick={startEditFields}
                      className="tb-btn-primary text-xs"
                    >
                      Edit bug
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onPushAdo()}
                    className="tb-btn-ghost text-xs"
                    disabled={adoBusy}
                    title="Create or update this bug on Azure DevOps"
                  >
                    {adoBusy
                      ? "ADO…"
                      : bug.externalRefs?.adoWorkItemId
                        ? "Update on ADO"
                        : "Push to ADO"}
                  </button>
                  {bug.externalRefs?.adoWorkItemId ? (
                    <button
                      type="button"
                      onClick={() => void onSyncAdo()}
                      className="tb-btn-ghost text-xs"
                      disabled={adoBusy}
                      title="Pull title, status, and comments from Azure DevOps"
                    >
                      Sync from ADO
                    </button>
                  ) : null}
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

              <FlashAlert error={actionError} message={actionMsg} className="" />
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
              <MetaTile label="Assignee" value={nameOf(bug.assigneeId)} />
              <MetaTile label="Reporter" value={nameOf(bug.reporterId)} />
              <MetaTile label="Project" value={projectName} />
              <MetaTile label="Module" value={moduleName} />
              <MetaTile label="Sprint" value={sprintName} />
              <MetaTile
                label="Environment"
                value={
                  bug.environmentName
                    ? `${bug.environmentName}${bug.environmentSnapshot ? ` · ${bug.environmentSnapshot}` : ""}`
                    : bug.environmentSnapshot || "—"
                }
              />
              <MetaTile
                label="ADO work item"
                value={
                  bug.externalRefs?.adoWorkItemId
                    ? `#${bug.externalRefs.adoWorkItemId}`
                    : "Not synced"
                }
              />
              <MetaTile label="Filed" value={formatWhen(bug.createdAt)} />
            </dl>
            {bug.externalRefs?.adoWorkItemUrl ? (
              <div className="border-t border-[var(--line)] px-6 py-3 text-sm">
                <a
                  className="tb-link font-medium"
                  href={bug.externalRefs.adoWorkItemUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Azure DevOps →
                </a>
              </div>
            ) : null}
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
                <button type="button" onClick={startEditSteps} className="tb-btn-primary text-xs">
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
            <h3 className="text-lg font-bold text-[var(--ink)]">
              Comments ({commentsQuery.data?.length ?? 0})
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Testers can edit bug fields and comment. Developers can update status and comment.
            </p>
            {commentError && <p className="tb-alert-error mt-3">{commentError}</p>}
            <div className="mt-4 space-y-3">
              {(commentsQuery.data ?? []).map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--input-bg)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {c.authorName || nameOf(c.authorId)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--muted)]">
                        {formatWhen(c.createdAt)}
                      </span>
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
              {!commentsQuery.isLoading && (commentsQuery.data?.length ?? 0) === 0 && (
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
                    placeholder="Write a comment�"
                  />
                </label>
                <button
                  type="submit"
                  className="tb-btn-primary mt-3 text-sm"
                  disabled={commentMutation.isPending || !commentBody.trim()}
                >
                  {commentMutation.isPending ? "Posting�" : "Post comment"}
                </button>
              </form>
            ) : (
              <p className="mt-4 text-xs text-[var(--muted)]">You can read comments only.</p>
            )}
          </section>
        </article>
      )}

      <ExportFormatModal
        open={exportOpen}
        busy={exportBusy}
        bugTitle={bug?.title ?? "Bug"}
        onClose={() => {
          if (!exportBusy) setExportOpen(false);
        }}
        onSelect={(format) => void onExportFormat(format)}
      />
    </Shell>
  );
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
