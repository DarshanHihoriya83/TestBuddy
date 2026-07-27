import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { createProject, deleteProject, fetchProjects } from "../api";
import { Shell } from "../components/Shell";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const [name, setName] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setName("");
      setJiraProjectKey("");
      setAdoOrgUrl("");
      setAdoProject("");
      setMessage("Project created (Cycle 1 added as default)");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      setMessage("Project deleted");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  return (
    <Shell title="Projects">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Create, view, edit, and delete TestBuddy projects.
          </p>
        </div>
      </div>

      <form
        className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate({
            name: name.trim(),
            jiraProjectKey: jiraProjectKey.trim() || undefined,
            adoOrgUrl: adoOrgUrl.trim() || undefined,
            adoProject: adoProject.trim() || undefined,
          });
        }}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
          Create project
        </h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Name *
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Jira project key
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={jiraProjectKey}
              onChange={(e) => setJiraProjectKey(e.target.value)}
              placeholder="e.g. TB"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Azure DevOps org URL
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={adoOrgUrl}
              onChange={(e) => setAdoOrgUrl(e.target.value)}
              placeholder="https://dev.azure.com/org"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Azure DevOps project
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={adoProject}
              onChange={(e) => setAdoProject(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending || !name.trim()}
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {createMutation.isPending ? "Creating…" : "Create project"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="mb-4 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
          {message}
        </p>
      )}

      {projectsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading projects…</p>}

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--accent-soft)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Jira key</th>
              <th className="px-4 py-3">ADO project</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projectsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No projects yet. Create one above.
                </td>
              </tr>
            )}
            {projectsQuery.data?.map((project) => (
              <tr key={project.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3 font-medium">
                  <Link
                    className="text-[var(--accent)] hover:underline"
                    to={`/projects/${project.id}`}
                  >
                    {project.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{project.jiraProjectKey || "—"}</td>
                <td className="px-4 py-3">{project.adoProject || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/projects/${project.id}`}
                      className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-slate-50"
                    >
                      View
                    </Link>
                    <Link
                      to={`/projects/${project.id}/edit`}
                      className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-slate-50"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete project "${project.name}"? This only works if it has no bugs.`,
                          )
                        ) {
                          deleteMutation.mutate(project.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
