import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { exportBugJson, fetchBug, fetchCycles, fetchProjects, fetchUsers } from "../api";
import { Shell } from "../components/Shell";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BugDetailPage() {
  const { id = "" } = useParams();
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

  const bug = bugQuery.data;
  const nameOf = (uid: string) => usersQuery.data?.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const cycleName = cyclesQuery.data?.find((c) => c.id === bug?.cycleId)?.name ?? "—";
  const projectName = projectsQuery.data?.find((p) => p.id === bug?.projectId)?.name ?? "—";

  async function onExport() {
    setExportMsg(null);
    setExportError(false);
    try {
      const data = await exportBugJson(id);
      downloadJson(`testbuddy-bug-${id}.json`, data);
      setExportMsg("Exported JSON downloaded");
    } catch (err) {
      setExportError(true);
      setExportMsg(err instanceof Error ? err.message : "Export failed");
    }
  }

  const pageTitle = bug?.title ? (bug.title.length > 40 ? `${bug.title.slice(0, 40)}…` : bug.title) : "Bug detail";

  return (
    <Shell title={pageTitle}>
      <Link to="/bugs" className="tb-link text-sm">
        ← Back to bugs
      </Link>

      {bugQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {bugQuery.error && (
        <p className="tb-alert-error mt-4">{(bugQuery.error as Error).message}</p>
      )}

      {bug && (
        <article className="mt-4 space-y-6">
          <header className="tb-card tb-card-accent p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="tb-badge">
                {bug.status} · {bug.priority} · {bug.severity}
              </span>
              <button type="button" onClick={() => void onExport()} className="tb-btn-ghost text-xs">
                Export JSON
              </button>
            </div>
            {exportMsg && (
              <p className={`mt-2 text-xs ${exportError ? "tb-alert-error" : "text-[var(--success)]"}`}>
                {exportMsg}
              </p>
            )}
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-[var(--ink)]">{bug.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-[var(--muted)]">{bug.description}</p>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Assignee</dt>
                <dd className="mt-1 font-medium">{nameOf(bug.assigneeId)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Reporter</dt>
                <dd className="mt-1 font-medium">{nameOf(bug.reporterId)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Project</dt>
                <dd className="mt-1 font-medium">{projectName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Cycle</dt>
                <dd className="mt-1 font-medium">{cycleName}</dd>
              </div>
            </dl>
          </header>

          <section className="tb-card p-6">
            <h3 className="text-lg font-bold text-[var(--ink)]">Actual steps</h3>
            {bug.steps.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No steps recorded yet.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {bug.steps.map((step) => (
                  <li
                    key={`${step.order}-${step.description}`}
                    className="rounded-xl border border-[var(--line)] bg-[var(--input-bg)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                      <span>
                        Step {step.order}
                        <span className="mx-1.5">·</span>
                        {step.actionType}
                      </span>
                      <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--accent-hover)]">
                        Actual step
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{step.description}</p>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-xs text-[var(--muted)]">
              Video / annotated screenshots arrive in Phase 2.
            </p>
          </section>
        </article>
      )}
    </Shell>
  );
}
