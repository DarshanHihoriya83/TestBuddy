import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { fetchProject, updateProject } from "../api";
import { useAuth } from "../auth";
import { Shell } from "../components/Shell";
import { notifyError, notifySuccess } from "../utils/notify";
import { canCreateProject } from "../utils/roles";
import { validateOptionalUrl, normalizeProjectName, validateProjectName, PROJECT_NAME_MAX_LENGTH } from "../utils/validation";

export function ProjectEditPage() {
  const { user } = useAuth();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = canCreateProject(user);

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProject(id),
    enabled: !!id && canManage,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");

  useEffect(() => {
    if (!projectQuery.data) return;
    setName(projectQuery.data.name);
    setDescription(projectQuery.data.description ?? "");
    setJiraProjectKey(projectQuery.data.jiraProjectKey ?? "");
    setAdoOrgUrl(projectQuery.data.adoOrgUrl ?? "");
    setAdoProject(projectQuery.data.adoProject ?? "");
  }, [projectQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProject(id, {
        name: normalizeProjectName(name),
        description: description.trim() || undefined,
        jiraProjectKey: jiraProjectKey.trim() || undefined,
        adoOrgUrl: adoOrgUrl.trim() || undefined,
        adoProject: adoProject.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      notifySuccess("Project updated");
      navigate(`/projects/${id}`);
    },
    onError: (err: Error) => notifyError(err.message),
  });

  if (!canManage) {
    return <Navigate to={`/projects/${id}`} replace />;
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeProjectName(name);
    setName(normalized);
    const nameErr = validateProjectName(normalized);
    if (nameErr) {
      setNameHint(nameErr);
      notifyError(nameErr);
      return;
    }
    const urlErr = validateOptionalUrl(adoOrgUrl, "Azure DevOps org URL");
    if (urlErr) {
      notifyError(urlErr);
      return;
    }
    saveMutation.mutate();
  }
  return (
    <Shell title="Edit project" crumbRoot={{ label: "Projects", to: "/projects" }}>
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
            <input
              className="tb-input"
              value={name}
              onChange={(e) => {
                const raw = e.target.value;
                const next =
                  raw.length > PROJECT_NAME_MAX_LENGTH
                    ? raw.slice(0, PROJECT_NAME_MAX_LENGTH)
                    : raw;
                setName(next);
                setNameHint(next.trim() ? validateProjectName(next) : null);
              }}
              onBlur={() => {
                const normalized = normalizeProjectName(name);
                setName(normalized);
                setNameHint(normalized ? validateProjectName(normalized) : null);
              }}
              required
              minLength={2}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              placeholder="Letters and spaces only"
            />
            <span className="mt-1 flex justify-between gap-2 text-[11px] font-normal normal-case tracking-normal">
              <span className={nameHint ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                {nameHint || "Alphabetical characters only · max 100 characters"}
              </span>
              <span className="shrink-0 text-[var(--muted)]">
                {normalizeProjectName(name).length}/{PROJECT_NAME_MAX_LENGTH}
              </span>
            </span>
          </label>
          <label className="tb-label">
            Description
            <textarea
              className="tb-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g, Describe the project details"
            />
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
