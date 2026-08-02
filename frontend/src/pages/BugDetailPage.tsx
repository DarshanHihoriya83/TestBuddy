import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { deleteBug, fetchBug, fetchCycles, fetchProjects, fetchUsers } from "../api";
import { BugScreenshots, BugStepsTable } from "../components/BugFullCard";
import { ExportFormatModal } from "../components/ExportFormatModal";
import { Shell } from "../components/Shell";
import { exportBug, type ExportFormat } from "../utils/bugExport";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusTone(status: string) {
  switch (status) {
    case "FIXED":
    case "VERIFIED":
    case "CLOSED":
      return "bg-[var(--success-soft)] text-[var(--success)]";
    case "IN_PROGRESS":
    case "OPEN":
      return "bg-[var(--accent-soft)] text-[var(--accent)]";
    case "REOPENED":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function priorityTone(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "bg-[var(--danger-soft)] text-[var(--danger)]";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function BugDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fromProjectId = (location.state as { fromProjectId?: string } | null)?.fromProjectId;
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);

  const bugQuery = useQuery({ queryKey: ["bug", id], queryFn: () => fetchBug(id), enabled: !!id });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const projectId = bugQuery.data?.projectId ?? projectsQuery.data?.[0]?.id;
  const cyclesQuery = useQuery({
    queryKey: ["cycles", projectId],
    queryFn: () => fetchCycles(projectId!),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBug,
    onSuccess: async () => {
      const projectBack = fromProjectId || bugQuery.data?.projectId;
      await queryClient.invalidateQueries({ queryKey: ["bugs"] });
      navigate(projectBack ? `/projects/${projectBack}` : "/bugs");
    },
    onError: (err: Error) => {
      setExportError(true);
      setExportMsg(err.message);
    },
  });

  const bug = bugQuery.data;
  const nameOf = (uid: string) => usersQuery.data?.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const cycleName = cyclesQuery.data?.find((c) => c.id === bug?.cycleId)?.name ?? "—";
  const projectName = projectsQuery.data?.find((p) => p.id === bug?.projectId)?.name ?? "—";
  const backToProject = fromProjectId || bug?.projectId;

  async function onExportFormat(format: ExportFormat) {
    if (!bug) return;
    setExportBusy(true);
    setExportMsg(null);
    setExportError(false);
    try {
      await exportBug(format, {
        bug,
        projectName,
        cycleName,
        assigneeName: nameOf(bug.assigneeId),
        reporterName: nameOf(bug.reporterId),
      });
      const label = format === "excel" ? "Excel" : format.toUpperCase();
      setExportMsg(`${label} downloaded — open it to review the full bug`);
      setExportOpen(false);
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  const pageTitle = bug?.title
    ? bug.title.length > 40
      ? `${bug.title.slice(0, 40)}…`
      : bug.title
    : "Bug detail";

  return (
    <Shell title={pageTitle}>
      <div className="flex flex-wrap gap-3 text-sm">
        {backToProject ? (
          <Link to={`/projects/${backToProject}`} className="tb-link">
            ← Back to project
          </Link>
        ) : (
          <Link to="/bugs" className="tb-link">
            ← Back to bugs
          </Link>
        )}
      </div>

      {bugQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {bugQuery.error && (
        <p className="tb-alert-error mt-4">{(bugQuery.error as Error).message}</p>
      )}

      {bug && (
        <article className="mt-4 space-y-5">
          <header className="tb-card tb-card-accent overflow-hidden">
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone(bug.status)}`}
                  >
                    {bug.status}
                  </span>
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
                  <button
                    type="button"
                    onClick={() => setExportOpen(true)}
                    className="tb-btn-primary text-xs"
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete bug "${bug.title}"?`)) {
                        deleteMutation.mutate(id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

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

            <dl className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-5">
              <MetaTile label="Assignee" value={nameOf(bug.assigneeId)} />
              <MetaTile label="Reporter" value={nameOf(bug.reporterId)} />
              <MetaTile label="Project" value={projectName} />
              <MetaTile label="Cycle" value={cycleName} />
              <MetaTile label="Filed" value={formatWhen(bug.createdAt)} />
            </dl>
          </header>

          <section className="tb-card p-6">
            <h3 className="text-lg font-bold text-[var(--ink)]">Reproduction steps</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Step + Actual Result on every row. Expected Result only on the defect step.
            </p>
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
