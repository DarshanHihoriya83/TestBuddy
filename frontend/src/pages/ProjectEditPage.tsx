import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchProject, updateProject } from "../api";
import { Shell } from "../components/Shell";

export function ProjectEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectQuery.data) return;
    setName(projectQuery.data.name);
    setJiraProjectKey(projectQuery.data.jiraProjectKey ?? "");
    setAdoOrgUrl(projectQuery.data.adoOrgUrl ?? "");
    setAdoProject(projectQuery.data.adoProject ?? "");
  }, [projectQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProject(id, {
        name: name.trim(),
        jiraProjectKey: jiraProjectKey.trim() || undefined,
        adoOrgUrl: adoOrgUrl.trim() || undefined,
        adoProject: adoProject.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      navigate(`/projects/${id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate();
  }

  return (
    <Shell title="Edit project">
      <Link to={`/projects/${id}`} className="text-sm text-[var(--accent)] hover:underline">
        ← Back to project
      </Link>

      {projectQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {projectQuery.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {(projectQuery.error as Error).message}
        </p>
      )}

      {projectQuery.data && (
        <form
          onSubmit={onSubmit}
          className="mt-4 max-w-2xl space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight">Edit project</h2>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Name *
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Jira project key
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={jiraProjectKey}
              onChange={(e) => setJiraProjectKey(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Azure DevOps org URL
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={adoOrgUrl}
              onChange={(e) => setAdoOrgUrl(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Azure DevOps project
            <input
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              value={adoProject}
              onChange={(e) => setAdoProject(e.target.value)}
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saveMutation.isPending || !name.trim()}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </button>
            <Link
              to={`/projects/${id}`}
              className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </Shell>
  );
}
