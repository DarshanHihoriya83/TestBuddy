import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchProject, updateProject } from "../api";
import { Shell } from "../components/Shell";
import { validateName, validateOptionalUrl } from "../utils/validation";
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
    const nameErr = validateName(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const urlErr = validateOptionalUrl(adoOrgUrl, "Azure DevOps org URL");
    if (urlErr) {
      setError(urlErr);
      return;
    }
    saveMutation.mutate();
  }
  return (
    <Shell title="Edit project">
      <Link to={`/projects/${id}`} className="tb-link text-sm">
        ← Back to project
      </Link>

      {projectQuery.isLoading && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {projectQuery.error && (
        <p className="tb-alert-error mt-4">{(projectQuery.error as Error).message}</p>
      )}

      {projectQuery.data && (
        <form onSubmit={onSubmit} className="tb-card tb-card-accent mt-4 max-w-2xl space-y-4 p-6">
          <h2 className="text-2xl font-bold text-[var(--ink)]">Edit project</h2>
          <label className="tb-label">
            Name *
            <input className="tb-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="tb-label">
            Jira project key
            <input className="tb-input" value={jiraProjectKey} onChange={(e) => setJiraProjectKey(e.target.value)} />
          </label>
          <label className="tb-label">
            Azure DevOps org URL
            <input className="tb-input" value={adoOrgUrl} onChange={(e) => setAdoOrgUrl(e.target.value)} />
          </label>
          <label className="tb-label">
            Azure DevOps project
            <input className="tb-input" value={adoProject} onChange={(e) => setAdoProject(e.target.value)} />
          </label>

          {error && <p className="tb-alert-error">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={saveMutation.isPending || !name.trim()} className="tb-btn-primary">
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </button>
            <Link to={`/projects/${id}`} className="tb-btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </Shell>
  );
}
