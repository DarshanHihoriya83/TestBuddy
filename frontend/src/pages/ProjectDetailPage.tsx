import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { fetchCycles, fetchProject } from "../api";
import { Shell } from "../components/Shell";

export function ProjectDetailPage() {
  const { id = "" } = useParams();
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

  const project = projectQuery.data;

  return (
    <Shell title="Project detail">
      <Link to="/projects" className="text-sm text-[var(--accent)] hover:underline">
        ← Back to projects
      </Link>

      {projectQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {projectQuery.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {(projectQuery.error as Error).message}
        </p>
      )}

      {project && (
        <article className="mt-4 space-y-6">
          <header className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">{project.name}</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">ID: {project.id}</p>
              </div>
              <Link
                to={`/projects/${project.id}/edit`}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              >
                Edit project
              </Link>
            </div>
            <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Jira key</dt>
                <dd className="mt-1 font-medium">{project.jiraProjectKey || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">ADO project</dt>
                <dd className="mt-1 font-medium">{project.adoProject || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">ADO org URL</dt>
                <dd className="mt-1 break-all font-medium">{project.adoOrgUrl || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">Counts</dt>
                <dd className="mt-1 font-medium">
                  {project.cycleCount} cycle(s) · {project.bugCount} bug(s)
                </dd>
              </div>
            </dl>
          </header>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
            <h3 className="text-lg font-semibold">Cycles</h3>
            {cyclesQuery.isLoading && (
              <p className="mt-3 text-sm text-[var(--muted)]">Loading cycles…</p>
            )}
            <ul className="mt-4 space-y-2">
              {cyclesQuery.data?.map((cycle) => (
                <li
                  key={cycle.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3 text-sm"
                >
                  <span className="font-medium">{cycle.name}</span>
                  {cycle.isDefault && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
                      Default
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </article>
      )}
    </Shell>
  );
}
