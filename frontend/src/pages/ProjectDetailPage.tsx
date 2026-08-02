import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchBugs, fetchCycles, fetchProject, fetchUsers } from "../api";
import { BugListRow } from "../components/BugListRow";
import { Shell } from "../components/Shell";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const [cycleFilter, setCycleFilter] = useState("");

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
  const cyclesQuery = useQuery({
    queryKey: ["cycles", id],
    queryFn: () => fetchCycles(id),
    enabled: !!id,
  });
  const bugsQuery = useQuery({
    queryKey: ["bugs", { projectId: id }],
    queryFn: () => fetchBugs({ projectId: id }),
    enabled: !!id,
  });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const project = projectQuery.data;
  const nameOf = (uid: string) =>
    usersQuery.data?.find((u) => u.id === uid)?.name ?? uid.slice(0, 8);
  const cycleName = (cycleId: string) =>
    cyclesQuery.data?.find((c) => c.id === cycleId)?.name ?? cycleId.slice(0, 8);

  const bugs = useMemo(() => {
    const list = bugsQuery.data ?? [];
    if (!cycleFilter) return list;
    return list.filter((b) => b.cycleId === cycleFilter);
  }, [bugsQuery.data, cycleFilter]);

  const shotTotal = useMemo(
    () => (bugsQuery.data ?? []).reduce((n, b) => n + (b.screenshots?.length ?? 0), 0),
    [bugsQuery.data],
  );

  return (
    <Shell title="Project detail">
      <Link to="/projects" className="tb-link text-sm">
        ← Back to projects
      </Link>

      {projectQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {projectQuery.error && (
        <p className="tb-alert-error mt-4">{(projectQuery.error as Error).message}</p>
      )}

      {project && (
        <div className="mt-4 space-y-6">
          <header className="tb-card tb-card-accent overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Project
                </p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight text-[var(--ink)]">
                  {project.name}
                </h2>
                <p className="mt-2 font-mono text-xs text-[var(--muted)]">{project.id}</p>
              </div>
              <Link to={`/projects/${project.id}/edit`} className="tb-btn-primary text-sm">
                Edit project
              </Link>
            </div>

            <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Bugs" value={String(bugsQuery.data?.length ?? project.bugCount)} />
              <Stat label="Cycles" value={String(project.cycleCount)} />
              <Stat label="Screenshots" value={String(shotTotal)} />
              <Stat
                label="Integrations"
                value={
                  [project.jiraProjectKey && "Jira", project.adoProject && "ADO"]
                    .filter(Boolean)
                    .join(" · ") || "None"
                }
              />
            </div>

            <dl className="grid gap-4 border-t border-[var(--line)] p-5 text-sm md:grid-cols-3">
              <Meta label="Jira key" value={project.jiraProjectKey || "—"} />
              <Meta label="ADO project" value={project.adoProject || "—"} />
              <Meta label="ADO org URL" value={project.adoOrgUrl || "—"} breakAll />
            </dl>
          </header>

          <section className="tb-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-[var(--ink)]">Cycles</h3>
              <p className="text-xs text-[var(--muted)]">Filter the bug list</p>
            </div>
            {cyclesQuery.isLoading && (
              <p className="mt-3 text-sm text-[var(--muted)]">Loading cycles…</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <CycleChip
                active={cycleFilter === ""}
                onClick={() => setCycleFilter("")}
                label="All cycles"
              />
              {cyclesQuery.data?.map((cycle) => (
                <CycleChip
                  key={cycle.id}
                  active={cycleFilter === cycle.id}
                  onClick={() => setCycleFilter(cycle.id)}
                  label={cycle.name}
                  badge={cycle.isDefault ? "Default" : undefined}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ink)]">
                  Bugs
                  <span className="ml-2 text-base font-semibold text-[var(--muted)]">
                    ({bugs.length})
                  </span>
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Click a bug title to open full details, steps, and screenshots.
                </p>
              </div>
              <Link to="/bugs" className="tb-link text-sm">
                All bugs →
              </Link>
            </div>

            {bugsQuery.isLoading && (
              <p className="text-sm text-[var(--muted)]">Loading bugs…</p>
            )}
            {bugsQuery.error && (
              <p className="tb-alert-error">{(bugsQuery.error as Error).message}</p>
            )}
            {!bugsQuery.isLoading && bugs.length === 0 && (
              <div className="tb-card border-dashed p-8 text-center">
                <p className="font-medium text-[var(--ink)]">No bugs in this view</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {cycleFilter
                    ? "Try another cycle, or clear the cycle filter."
                    : "File a bug from the extension — it will show up in this list."}
                </p>
              </div>
            )}

            {bugs.length > 0 && (
              <div className="tb-card overflow-hidden">
                <div className="hidden border-b border-[var(--line)] bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:grid sm:grid-cols-[1.75rem_3.5rem_1.25rem_minmax(0,1fr)_11rem_6rem_4rem_7rem_8rem] sm:gap-4">
                  <span />
                  <span>ID</span>
                  <span />
                  <span>Title</span>
                  <span>Assignee</span>
                  <span>Status</span>
                  <span>Priority</span>
                  <span>Activity</span>
                  <span className="text-right">Cycle</span>
                </div>
                {bugs.map((bug) => (
                  <BugListRow
                    key={bug.id}
                    bug={bug}
                    assigneeName={nameOf(bug.assigneeId)}
                    cycleName={cycleName(bug.cycleId)}
                    projectName={project.name}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--panel)] px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}

function Meta({
  label,
  value,
  breakAll,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 font-medium ${breakAll ? "break-all" : ""}`}>{value}</dd>
    </div>
  );
}

function CycleChip({
  label,
  badge,
  active,
  onClick,
}: {
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--line)] bg-[var(--input-bg)] text-[var(--ink)] hover:border-[var(--accent)]/40"
      }`}
    >
      {label}
      {badge && (
        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--accent)]">
          {badge}
        </span>
      )}
    </button>
  );
}
