import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addOrganizationMember,
  fetchOrganization,
  fetchOrganizationMembers,
  fetchUsers,
  removeOrganizationMember,
  updateOrganization,
} from "../api";
import { useAuth } from "../auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FlashAlert } from "../components/FlashAlert";
import { MemberList, MemberPicker } from "../components/MemberPicker";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import {
  addableMemberUsers,
  canCreateOrganization,
  canCreateProject,
  canManageOrgMembers,
  isSuperAdmin,
} from "../utils/roles";
import {
  ALPHA_NAME_MAX_LENGTH,
  normalizeOrganizationName,
  validateOrgMaxProjects,
  validateOrganizationName,
} from "../utils/validation";

export function OrganizationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const canManage = canManageOrgMembers(user);
  const canEditOrg = canCreateOrganization(user);
  const canCreateProj = canCreateProject(user) && !isSuperAdmin(user);
  const queryClient = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const [limitHint, setLimitHint] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [projectSearch, setProjectSearch] = useState("");

  const orgQuery = useQuery({
    queryKey: queryKeys.organization(id),
    queryFn: () => fetchOrganization(id),
    enabled: !!id,
  });
  const membersQuery = useQuery({
    queryKey: queryKeys.organizationMembers(id),
    queryFn: () => fetchOrganizationMembers(id),
    enabled: !!id,
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: canManage,
  });

  const members = membersQuery.data ?? [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const addable = useMemo(
    () =>
      addableMemberUsers(user, usersQuery.data ?? []).filter((u) => !memberIds.has(u.id)),
    [user, usersQuery.data, memberIds],
  );

  useEffect(() => {
    if (orgQuery.data?.name && !editingName) {
      setNameDraft(orgQuery.data.name);
    }
  }, [orgQuery.data?.name, editingName]);

  useEffect(() => {
    if (orgQuery.data?.maxProjects != null && !editingLimit) {
      setLimitDraft(String(orgQuery.data.maxProjects));
    }
  }, [orgQuery.data?.maxProjects, editingLimit]);

  const addMutation = useMutation({
    mutationFn: (userId: string) => addOrganizationMember(id, userId),
    onSuccess: async () => {
      setAddUserId("");
      setMessage("Member added successfully.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organization-members", id] });
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(id, userId),
    onSuccess: async () => {
      setRemoveTarget(null);
      setMessage("Member removed successfully.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organization-members", id] });
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
      setRemoveTarget(null);
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => updateOrganization(id, { name }),
    onSuccess: async (org) => {
      setEditingName(false);
      setNameHint(null);
      setMessage(`Organization renamed to "${org.name}".`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const limitMutation = useMutation({
    mutationFn: (maxProjects: number) => updateOrganization(id, { maxProjects }),
    onSuccess: async (org) => {
      setEditingLimit(false);
      setLimitHint(null);
      setMessage(`Project limit updated to ${org.maxProjects}.`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organization", id] });
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const org = orgQuery.data;
  const projects = org?.projects ?? [];
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.jiraProjectKey || "").toLowerCase().includes(q) ||
        (p.adoProject || "").toLowerCase().includes(q),
    );
  }, [projects, projectSearch]);

  function startRename() {
    setNameDraft(org?.name ?? "");
    setNameHint(null);
    setEditingName(true);
    setEditingLimit(false);
    setError(null);
  }

  function cancelRename() {
    setEditingName(false);
    setNameDraft(org?.name ?? "");
    setNameHint(null);
  }

  function onRename(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeOrganizationName(nameDraft);
    setNameDraft(normalized);
    const nameErr = validateOrganizationName(normalized);
    if (nameErr) {
      setNameHint(nameErr);
      setError(nameErr);
      setMessage(null);
      return;
    }
    if (normalized === org?.name) {
      setEditingName(false);
      return;
    }
    renameMutation.mutate(normalized);
  }

  function startEditLimit() {
    setLimitDraft(String(org?.maxProjects ?? 10));
    setLimitHint(null);
    setEditingLimit(true);
    setEditingName(false);
    setError(null);
  }

  function cancelEditLimit() {
    setEditingLimit(false);
    setLimitDraft(String(org?.maxProjects ?? 10));
    setLimitHint(null);
  }

  function onSaveLimit(e: FormEvent) {
    e.preventDefault();
    const limitErr = validateOrgMaxProjects(limitDraft);
    if (limitErr) {
      setLimitHint(limitErr);
      setError(limitErr);
      setMessage(null);
      return;
    }
    const next = Number(limitDraft);
    if (next === org?.maxProjects) {
      setEditingLimit(false);
      return;
    }
    limitMutation.mutate(next);
  }

  const projectUsed = org?.projectCount ?? projects.length;
  const projectCap = org?.maxProjects;
  const orgAtLimit =
    typeof projectCap === "number" && projectUsed >= projectCap;

  return (
    <Shell title={org?.name ?? "Organization"}>
      <Link to="/organizations" className="tb-link text-sm">
        ← Back to organizations
      </Link>

      <QueryStatus
        isLoading={orgQuery.isLoading}
        error={orgQuery.error}
        onRetry={() => void orgQuery.refetch()}
        loadingText="Loading organization…"
        className="mt-4"
      />

      {org && (
        <div className="mt-4 space-y-6">
          <FlashAlert error={error} message={message} className="" />

          <header className="tb-card tb-card-accent p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Organization
            </p>

            {editingName ? (
              <form className="mt-3 max-w-xl space-y-3" onSubmit={onRename}>
                <label className="tb-label">
                  Organization name *
                  <input
                    className={`tb-input ${nameHint ? "border-[var(--danger)]" : ""}`}
                    value={nameDraft}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next =
                        raw.length > ALPHA_NAME_MAX_LENGTH
                          ? raw.slice(0, ALPHA_NAME_MAX_LENGTH)
                          : raw;
                      setNameDraft(next);
                      setNameHint(next.trim() ? validateOrganizationName(next) : null);
                    }}
                    onBlur={() => {
                      const normalized = normalizeOrganizationName(nameDraft);
                      setNameDraft(normalized);
                      setNameHint(normalized ? validateOrganizationName(normalized) : null);
                    }}
                    required
                    minLength={2}
                    maxLength={ALPHA_NAME_MAX_LENGTH}
                    autoFocus
                  />
                  <span className="mt-1.5 flex justify-between gap-2 text-[11px] font-normal normal-case tracking-normal">
                    <span className={nameHint ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                      {nameHint || "Alphabetical characters only · max 100 characters"}
                    </span>
                    <span className="shrink-0 text-[var(--muted)]">
                      {normalizeOrganizationName(nameDraft).length}/{ALPHA_NAME_MAX_LENGTH}
                    </span>
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="tb-btn-primary text-xs"
                    disabled={
                      renameMutation.isPending ||
                      !normalizeOrganizationName(nameDraft) ||
                      !!validateOrganizationName(nameDraft)
                    }
                  >
                    {renameMutation.isPending ? "Saving…" : "Save name"}
                  </button>
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs"
                    onClick={cancelRename}
                    disabled={renameMutation.isPending}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : editingLimit ? (
              <form className="mt-3 max-w-xs space-y-3" onSubmit={onSaveLimit}>
                <label className="tb-label">
                  Project limit *
                  <input
                    className={`tb-input ${limitHint ? "border-[var(--danger)]" : ""}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    value={limitDraft}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setLimitDraft(digits);
                      setLimitHint(digits ? validateOrgMaxProjects(digits) : null);
                    }}
                    onBlur={() => setLimitHint(validateOrgMaxProjects(limitDraft))}
                    required
                    autoFocus
                  />
                  <span
                    className={`mt-1.5 text-[11px] font-normal normal-case tracking-normal ${
                      limitHint ? "text-[var(--danger)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {limitHint ||
                      `Managers stop creating when the org reaches this cap (currently ${projectUsed} projects).`}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="tb-btn-primary text-xs"
                    disabled={limitMutation.isPending || !!validateOrgMaxProjects(limitDraft)}
                  >
                    {limitMutation.isPending ? "Saving…" : "Save limit"}
                  </button>
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs"
                    onClick={cancelEditLimit}
                    disabled={limitMutation.isPending}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-[var(--ink)]">{org.name}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-xs font-semibold ring-1 ring-[var(--line)] ${
                        orgAtLimit ? "text-[var(--danger)]" : "text-[var(--ink)]"
                      }`}
                    >
                      {projectUsed}/{projectCap ?? "—"} projects
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--line)]">
                      {org.memberCount ?? members.length} members
                    </span>
                  </div>
                </div>
                {canEditOrg && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="tb-btn-ghost text-xs" onClick={startRename}>
                      Rename
                    </button>
                    <button type="button" className="tb-btn-ghost text-xs" onClick={startEditLimit}>
                      Edit project limit
                    </button>
                  </div>
                )}
              </div>
            )}
          </header>

          <section className="tb-card overflow-hidden p-0">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] bg-gradient-to-br from-[var(--accent-soft)]/40 to-transparent px-5 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Workspace
                </p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-[var(--ink)]">
                  Projects
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {projects.length === 0
                    ? "No projects in this organization yet"
                    : `${filteredProjects.length} of ${projects.length} visible to you`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--line)]">
                  {projects.length} total
                </span>
                {!isSuperAdmin(user) && (
                  <Link to="/projects" className="tb-btn-ghost px-3 py-1.5 text-xs">
                    All projects
                  </Link>
                )}
                {canCreateProj && (
                  orgAtLimit ? (
                    <span
                      className="cursor-not-allowed rounded-lg bg-[var(--panel-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--line)]"
                      title="Organization project limit reached"
                    >
                      Limit reached
                    </span>
                  ) : (
                    <Link
                      to={`/projects?organizationId=${encodeURIComponent(id)}`}
                      className="tb-btn-primary px-3 py-1.5 text-xs"
                    >
                      + Create project
                    </Link>
                  )
                )}
              </div>
            </div>

            {projects.length > 0 && (
              <div className="border-b border-[var(--line)] px-5 py-3.5">
                <label className="relative block max-w-lg">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M20 20l-3.5-3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span className="sr-only">Search projects</span>
                  <input
                    id="org-project-search"
                    className="tb-input !mt-0 pl-10"
                    type="search"
                    placeholder="Filter by name, Jira key, or ADO project…"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                  />
                </label>
              </div>
            )}

            {projects.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="16"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.75"
                    />
                    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.75" />
                    <path d="M8 14h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="mt-4 text-base font-semibold text-[var(--ink)]">No projects yet</p>
                <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                  {canCreateProj
                    ? "Create the first project for this organization to start capturing bugs and modules."
                    : "Ask a Manager to create a project and add you as a member."}
                </p>
                {canCreateProj && (
                  <Link
                    to={`/projects?organizationId=${encodeURIComponent(id)}`}
                    className="tb-btn-primary mt-5 text-sm"
                  >
                    Create first project
                  </Link>
                )}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-[var(--ink)]">No matches</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Nothing matched “{projectSearch.trim()}”. Try another name or clear the filter.
                </p>
                <button
                  type="button"
                  className="tb-btn-ghost mt-4 text-xs"
                  onClick={() => setProjectSearch("")}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="tb-table-wrap !rounded-none !border-0 !shadow-none">
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th className="px-5 py-3">Project</th>
                      <th className="hidden px-5 py-3 sm:table-cell">Integrations</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((p) => {
                      const initials = p.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <tr key={p.id} className="group">
                          <td className="px-5 py-3.5">
                            <Link
                              to={`/projects/${p.id}`}
                              className="flex items-center gap-3 min-w-0"
                            >
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)] ring-1 ring-[var(--accent)]/15 transition group-hover:ring-[var(--accent)]/35">
                                {initials}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">
                                  {p.name}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-[var(--muted)] sm:hidden">
                                  {[p.jiraProjectKey, p.adoProject].filter(Boolean).join(" · ") ||
                                    "No integrations"}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="hidden px-5 py-3.5 sm:table-cell">
                            <div className="flex flex-wrap gap-1.5">
                              {p.jiraProjectKey ? (
                                <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100">
                                  Jira {p.jiraProjectKey}
                                </span>
                              ) : null}
                              {p.adoProject ? (
                                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-800 ring-1 ring-indigo-100">
                                  ADO {p.adoProject}
                                </span>
                              ) : null}
                              {!p.jiraProjectKey && !p.adoProject ? (
                                <span className="text-xs text-[var(--muted)]">None linked</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Link
                                to={`/projects/${p.id}`}
                                className="tb-btn-ghost px-2.5 py-1 text-xs"
                              >
                                Open
                              </Link>
                              {canCreateProj && (
                                <Link
                                  to={`/projects/${p.id}/edit`}
                                  className="tb-btn-ghost px-2.5 py-1 text-xs"
                                >
                                  Edit
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tb-card overflow-hidden p-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-5 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  People
                </p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-[var(--ink)]">
                  Members
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {members.length} {members.length === 1 ? "person" : "people"} in this organization
                </p>
              </div>
              <span className="inline-flex items-center rounded-lg bg-[var(--bg0)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--line)]">
                {members.length} members
              </span>
            </div>

            <div className="p-5">
              {canManage && (
                <div className="mb-4">
                  <MemberPicker
                    addableUsers={addable}
                    value={addUserId}
                    onChange={setAddUserId}
                    onAdd={() => addMutation.mutate(addUserId)}
                    busy={addMutation.isPending}
                  />
                </div>
              )}

              <MemberList
                members={members}
                currentUserId={user?.id}
                canRemove={canManage}
                removing={removeMutation.isPending}
                confirmBeforeRemove={false}
                onRemove={(userId, name) => setRemoveTarget({ id: userId, name })}
                emptyText="No members yet."
              />
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove member"
        message={
          removeTarget
            ? `Remove "${removeTarget.name}" from this organization?`
            : ""
        }
        confirmLabel="Remove member"
        danger
        busy={removeMutation.isPending}
        onCancel={() => {
          if (!removeMutation.isPending) setRemoveTarget(null);
        }}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.id);
        }}
      />
    </Shell>
  );
}
