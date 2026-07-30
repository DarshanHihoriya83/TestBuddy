import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { createProject, deleteProject, fetchProjects } from "../api";
import { Shell } from "../components/Shell";
import { validateName, validateOptionalUrl } from "../utils/validation";
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
      <p className="mb-6 text-sm text-[var(--muted)]">
        Create, view, edit, and delete TestBuddy projects.
      </p>

      <form
        className="tb-card tb-card-accent mb-8 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const nameErr = validateName(name);
          if (nameErr) {
            setError(nameErr);
            setMessage(null);
            return;
          }
          const urlErr = validateOptionalUrl(adoOrgUrl, "Azure DevOps org URL");
          if (urlErr) {
            setError(urlErr);
            setMessage(null);
            return;
          }
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
          <label className="tb-label">
            Name *
            <input
              className="tb-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="tb-label">
            Jira project key
            <input
              className="tb-input"
              value={jiraProjectKey}
              onChange={(e) => setJiraProjectKey(e.target.value)}
              placeholder="e.g. TB"
            />
          </label>
          <label className="tb-label">
            Azure DevOps org URL
            <input
              className="tb-input"
              value={adoOrgUrl}
              onChange={(e) => setAdoOrgUrl(e.target.value)}
              placeholder="https://dev.azure.com/org"
            />
          </label>
          <label className="tb-label">
            Azure DevOps project
            <input
              className="tb-input"
              value={adoProject}
              onChange={(e) => setAdoProject(e.target.value)}
            />
          </label>
        </div>
        {(error || message) && (
          <p className={`mt-4 ${error ? "tb-alert-error" : "tb-alert-success"}`}>
            {error || message}
          </p>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending || !name.trim()}
          className="tb-btn-primary mt-4"
        >
          {createMutation.isPending ? "Creating…" : "Create project"}
        </button>
      </form>

      {projectsQuery.isLoading && <p className="text-sm text-[var(--muted)]">Loading projects…</p>}
      {projectsQuery.error && (
        <p className="tb-alert-error mb-4">{(projectsQuery.error as Error).message}</p>
      )}

      <div className="tb-table-wrap">
        <table className="tb-table">
          <thead>
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
              <tr key={project.id}>
                <td className="px-4 py-3 font-medium">
                  <Link className="tb-link" to={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{project.jiraProjectKey || "—"}</td>
                <td className="px-4 py-3">{project.adoProject || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/projects/${project.id}`} className="tb-btn-ghost px-2.5 py-1 text-xs">
                      View
                    </Link>
                    <Link
                      to={`/projects/${project.id}/edit`}
                      className="tb-btn-ghost px-2.5 py-1 text-xs"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg border border-red-900/50 px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
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
