import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchOrganizations,
  fetchProjectQuota,
  fetchProjects,
} from "../api";
import { useAuth } from "../auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FlashAlert } from "../components/FlashAlert";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canCreateProject, isManager } from "../utils/roles";
import {
  normalizeProjectName,
  PROJECT_NAME_MAX_LENGTH,
  validateOptionalUrl,
  validateProjectName,
} from "../utils/validation";

export function ProjectsPage() {
  const { user } = useAuth();
  const canManage = canCreateProject(user);
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });
  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
    enabled: canManage,
  });
  const quotaQuery = useQuery({
    queryKey: queryKeys.projectQuota,
    queryFn: fetchProjectQuota,
    enabled: canManage,
  });
  const [name, setName] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [adoOrgUrl, setAdoOrgUrl] = useState("");
  const [adoProject, setAdoProject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const orgs = orgsQuery.data ?? [];
  const defaultOrgId = organizationId || orgs[0]?.id || "";
  const quota = quotaQuery.data;
  const atLimit =
    isManager(user) &&
    quota?.limit != null &&
    typeof quota.remaining === "number" &&
    quota.remaining <= 0;

  useEffect(() => {
    const fromQuery = searchParams.get("organizationId")?.trim();
    if (fromQuery) setOrganizationId(fromQuery);
  }, [searchParams]);

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      setName("");
      setNameHint(null);
      setJiraProjectKey("");
      setAdoOrgUrl("");
      setAdoProject("");
      setMessage("Project created successfully. Cycle 1 was added as the default cycle.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectQuota });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      setDeleteTarget(null);
      setMessage("Project deleted successfully.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectQuota });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
      setDeleteTarget(null);
    },
  });

  function onNameChange(raw: string) {
    const next = raw.length > PROJECT_NAME_MAX_LENGTH ? raw.slice(0, PROJECT_NAME_MAX_LENGTH) : raw;
    setName(next);
    if (!next.trim()) {
      setNameHint(null);
      return;
    }
    setNameHint(validateProjectName(next));
  }

  function onNameBlur() {
    const normalized = normalizeProjectName(name);
    if (normalized !== name) setName(normalized);
    setNameHint(normalized ? validateProjectName(normalized) : null);
  }

  return (
    <Shell title="Projects">
      <p className="mb-6 text-sm text-[var(--muted)]">
        {canManage
          ? "Create projects under an organization (Manager or SuperAdmin). Developers and Testers cannot create projects."
          : "Browse projects you have been granted access to. Only a Manager can create projects."}
      </p>

      <FlashAlert error={error} message={message} className="mb-4" />

      {canManage && (
        <form
          className="tb-card tb-card-accent mb-8 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (atLimit) {
              setError(
                `Project limit reached: Managers can create at most ${quota?.limit} projects.`,
              );
              setMessage(null);
              return;
            }
            const normalized = normalizeProjectName(name);
            setName(normalized);
            const nameErr = validateProjectName(normalized);
            if (nameErr) {
              setNameHint(nameErr);
              setError(nameErr);
              setMessage(null);
              return;
            }
            const orgId = organizationId || orgs[0]?.id;
            if (!orgId) {
              setError("Select an organization");
              setMessage(null);
              return;
            }
            const urlErr = validateOptionalUrl(adoOrgUrl, "Azure DevOps org URL");
            if (urlErr) {
              setError(urlErr);
              setMessage(null);
              return;
            }
            setError(null);
            createMutation.mutate({
              name: normalized,
              organizationId: orgId,
              jiraProjectKey: jiraProjectKey.trim() || undefined,
              adoOrgUrl: adoOrgUrl.trim() || undefined,
              adoProject: adoProject.trim() || undefined,
            });
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
              Create project
            </h3>
            {isManager(user) && quota?.limit != null && (
              <p
                className={`text-xs font-medium ${
                  atLimit ? "text-[var(--danger)]" : "text-[var(--muted)]"
                }`}
              >
                Your quota: {quota.used}/{quota.limit} projects
                {typeof quota.remaining === "number" ? ` · ${quota.remaining} left` : ""}
              </p>
            )}
          </div>
          {atLimit && (
            <p className="mt-2 text-sm text-[var(--danger)]">
              You have reached the maximum number of projects you can create. Delete an existing
              project or ask a SuperAdmin for help.
            </p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="tb-label">
              Organization *
              <select
                className="tb-select"
                value={defaultOrgId}
                onChange={(e) => setOrganizationId(e.target.value)}
                required
                disabled={atLimit}
              >
                {orgs.length === 0 && <option value="">No organizations</option>}
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="tb-label">
              Name *
              <input
                className="tb-input"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={onNameBlur}
                required
                minLength={2}
                maxLength={PROJECT_NAME_MAX_LENGTH}
                placeholder="Letters and spaces only"
                aria-invalid={!!nameHint}
                disabled={atLimit}
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
              Jira project key
              <input
                className="tb-input"
                value={jiraProjectKey}
                onChange={(e) => setJiraProjectKey(e.target.value)}
                placeholder="e.g. TB"
                disabled={atLimit}
              />
            </label>
            <label className="tb-label">
              Azure DevOps org URL
              <input
                className="tb-input"
                value={adoOrgUrl}
                onChange={(e) => setAdoOrgUrl(e.target.value)}
                placeholder="https://dev.azure.com/org"
                disabled={atLimit}
              />
            </label>
            <label className="tb-label md:col-span-2">
              Azure DevOps project
              <input
                className="tb-input"
                value={adoProject}
                onChange={(e) => setAdoProject(e.target.value)}
                disabled={atLimit}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={
              createMutation.isPending ||
              atLimit ||
              !normalizeProjectName(name) ||
              !!validateProjectName(name) ||
              !orgs.length
            }
            className="tb-btn-primary mt-4"
          >
            {createMutation.isPending ? "Creating…" : "Create project"}
          </button>
        </form>
      )}

      <QueryStatus
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        loadingText="Loading projects…"
      />

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
                  No projects yet.
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
                <td className="px-4 py-3">{project.jiraProjectKey || "-"}</td>
                <td className="px-4 py-3">{project.adoProject || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/projects/${project.id}`} className="tb-btn-ghost px-2.5 py-1 text-xs">
                      View
                    </Link>
                    {canManage && (
                      <>
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
                          onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This also deletes all bugs in the project. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete project"
        danger
        busy={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </Shell>
  );
}
