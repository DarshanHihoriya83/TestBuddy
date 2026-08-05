import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createOrganization, deleteOrganization, fetchOrganizations } from "../api";
import { useAuth } from "../auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import type { Organization } from "../types";
import { paginate } from "../utils/pagination";
import { canCreateOrganization } from "../utils/roles";
import {
  ALPHA_NAME_MAX_LENGTH,
  normalizeOrganizationName,
  ORG_MAX_PROJECTS_DEFAULT,
  validateOrgMaxProjects,
  validateOrganizationName,
} from "../utils/validation";

type ViewMode = "table" | "card";

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-[var(--muted)]"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function orgInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Projects used out of the org cap, as a 0–100 bar width. */
function usagePercent(org: Organization) {
  const limit = org.maxProjects ?? 0;
  if (!limit) return 0;
  return Math.min(100, Math.round(((org.projectCount ?? 0) / limit) * 100));
}

function UsageMeter({ org }: { org: Organization }) {
  const percent = usagePercent(org);
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-[var(--ink)]">
        {org.projectCount ?? 0}
        <span className="text-xs font-semibold text-[var(--muted)]">/{org.maxProjects ?? "—"}</span>
      </span>
      <span className="tb-usage-track" aria-hidden>
        <span
          className={`tb-usage-fill ${percent >= 100 ? "is-full" : percent >= 80 ? "is-high" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </span>
    </div>
  );
}

export function OrganizationsPage() {
  const { user } = useAuth();
  const canCreate = canCreateOrganization(user);
  const queryClient = useQueryClient();
  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [maxProjects, setMaxProjects] = useState(String(ORG_MAX_PROJECTS_DEFAULT));
  const [maxProjectsHint, setMaxProjectsHint] = useState<string | null>(null);
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (org) => {
      setName("");
      setMaxProjects(String(ORG_MAX_PROJECTS_DEFAULT));
      setMaxProjectsHint(null);
      setNameHint(null);
      setShowCreateForm(false);
      setMessage(`Organization "${org.name}" created successfully.`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: async () => {
      const deletedName = deleteTarget?.name;
      setDeleteTarget(null);
      setMessage(
        deletedName
          ? `Organization "${deletedName}" deleted successfully.`
          : "Organization deleted successfully.",
      );
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
      setDeleteTarget(null);
    },
  });

  function onNameChange(raw: string) {
    const next = raw.length > ALPHA_NAME_MAX_LENGTH ? raw.slice(0, ALPHA_NAME_MAX_LENGTH) : raw;
    setName(next);
    if (error) setError(null);
    if (!next.trim()) {
      setNameHint(null);
      return;
    }
    setNameHint(validateOrganizationName(next));
  }

  function onNameBlur() {
    const normalized = normalizeOrganizationName(name);
    if (normalized !== name) setName(normalized);
    setNameHint(normalized ? validateOrganizationName(normalized) : null);
  }

  function onMaxProjectsChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setMaxProjects(digits);
    if (error) setError(null);
    setMaxProjectsHint(digits ? validateOrgMaxProjects(digits) : null);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeOrganizationName(name);
    setName(normalized);
    const nameErr = validateOrganizationName(normalized);
    const limitErr = validateOrgMaxProjects(maxProjects);
    if (nameErr) {
      setNameHint(nameErr);
      setError(nameErr);
      setMessage(null);
      return;
    }
    if (limitErr) {
      setMaxProjectsHint(limitErr);
      setError(limitErr);
      setMessage(null);
      return;
    }
    setError(null);
    createMutation.mutate({ name: normalized, maxProjects: Number(maxProjects) });
  }

  function openCreateForm() {
    setShowCreateForm(true);
    setName("");
    setMaxProjects(String(ORG_MAX_PROJECTS_DEFAULT));
    setMaxProjectsHint(null);
    setNameHint(null);
    setError(null);
    setMessage(null);
  }

  function cancelCreateForm() {
    setShowCreateForm(false);
    setName("");
    setMaxProjects(String(ORG_MAX_PROJECTS_DEFAULT));
    setMaxProjectsHint(null);
    setNameHint(null);
    setError(null);
  }

  const orgs = useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);
  const nameInvalid = !!validateOrganizationName(name);
  const limitInvalid = !!validateOrgMaxProjects(maxProjects);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q));
  }, [orgs, search]);

  const { totalPages, safePage, startIdx, endIdx, pageItems } = paginate(filtered, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  // The directory fills the viewport and scrolls its own list, so the toolbar
  // and pager stay put. While the create form is open the page scrolls instead,
  // so the taller content never gets squeezed into a second scroll region.
  const fillMode = !showCreateForm;

  return (
    <Shell title="Organizations">
      <div
        className={
          fillMode
            ? "flex h-full min-h-0 flex-col gap-4 overflow-hidden pb-1"
            : "flex min-h-0 flex-col gap-4 pb-4"
        }
      >
        <div className="shrink-0">
          <PageHeader
            description={
              canCreate
                ? "Manage organizations. Create one to group projects and members."
                : "Organizations you belong to. Ask a SuperAdmin to create a new one."
            }
            actions={
              canCreate && !showCreateForm ? (
                <button type="button" className="tb-btn-primary text-sm" onClick={openCreateForm}>
                  Create Organization
                </button>
              ) : null
            }
          />

          <FlashAlert error={error} message={message} />
        </div>

        {canCreate && showCreateForm && (
          <form className="tb-card tb-card-accent shrink-0 space-y-4 p-6" onSubmit={onCreate}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Create Organization
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Name must use letters and spaces only (max {ALPHA_NAME_MAX_LENGTH} characters).
                </p>
              </div>
              <button
                type="button"
                className="tb-btn-ghost text-xs"
                onClick={cancelCreateForm}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
            </div>

            <label className="tb-label max-w-xl">
              Organization name *
              <input
                className={`tb-input ${nameHint ? "border-[var(--danger)] focus:border-[var(--danger)]" : ""}`}
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={onNameBlur}
                placeholder="e.g. Demo Organization"
                required
                minLength={2}
                maxLength={ALPHA_NAME_MAX_LENGTH}
                autoFocus
                aria-invalid={!!nameHint}
                aria-describedby="org-name-hint"
              />
              <span
                id="org-name-hint"
                className="mt-1.5 flex justify-between gap-2 text-[11px] font-normal normal-case tracking-normal"
              >
                <span className={nameHint ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
                  {nameHint || "Alphabetical characters only · whitespace is trimmed on blur"}
                </span>
                <span className="shrink-0 text-[var(--muted)]">
                  {normalizeOrganizationName(name).length}/{ALPHA_NAME_MAX_LENGTH}
                </span>
              </span>
            </label>

            <label className="tb-label max-w-xs">
              Project limit *
              <input
                className={`tb-input ${maxProjectsHint ? "border-[var(--danger)] focus:border-[var(--danger)]" : ""}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={maxProjects}
                onChange={(e) => onMaxProjectsChange(e.target.value)}
                onBlur={() => setMaxProjectsHint(validateOrgMaxProjects(maxProjects))}
                required
                aria-invalid={!!maxProjectsHint}
                aria-describedby="org-max-projects-hint"
              />
              <span
                id="org-max-projects-hint"
                className={`mt-1.5 text-[11px] font-normal normal-case tracking-normal ${
                  maxProjectsHint ? "text-[var(--danger)]" : "text-[var(--muted)]"
                }`}
              >
                {maxProjectsHint ||
                  "Managers can create at most this many projects in the organization."}
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="tb-btn-primary"
                disabled={
                  createMutation.isPending ||
                  !normalizeOrganizationName(name) ||
                  nameInvalid ||
                  limitInvalid
                }
              >
                {createMutation.isPending ? "Creating…" : "Create organization"}
              </button>
              <button
                type="button"
                className="tb-btn-ghost"
                onClick={cancelCreateForm}
                disabled={createMutation.isPending}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <QueryStatus
          isLoading={orgsQuery.isLoading}
          error={orgsQuery.error}
          onRetry={() => void orgsQuery.refetch()}
          loadingText="Loading organizations…"
        />

        {!orgsQuery.isLoading && orgs.length === 0 && (
          <div className="tb-card shrink-0 border-dashed p-10 text-center">
            <p className="text-lg font-semibold text-[var(--ink)]">No organizations yet</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {canCreate
                ? "Click Create Organization to add your first organization."
                : "You are not a member of any organization yet."}
            </p>
            {canCreate && !showCreateForm && (
              <button
                type="button"
                className="tb-btn-primary mt-5 text-sm"
                onClick={openCreateForm}
              >
                Create Organization
              </button>
            )}
          </div>
        )}

        {orgs.length > 0 && (
          <div
            className={`tb-card flex flex-col overflow-hidden ${
              fillMode ? "min-h-0 flex-1" : "shrink-0"
            }`}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div className="relative w-full max-w-[18rem]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search organizations…"
                  className="tb-search-input"
                  aria-label="Search organizations"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-[var(--muted)]">
                  {filtered.length} of {orgs.length}
                </span>
                <div className="tb-view-toggle" role="group" aria-label="View mode">
                  <button
                    type="button"
                    aria-label="Table view"
                    aria-pressed={viewMode === "table"}
                    className={`tb-view-toggle-btn ${
                      viewMode === "table" ? "is-active" : "bg-white text-[var(--muted)]"
                    }`}
                    onClick={() => setViewMode("table")}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Card view"
                    aria-pressed={viewMode === "card"}
                    className={`tb-view-toggle-btn border-l border-[var(--line)] ${
                      viewMode === "card" ? "is-active" : "bg-white text-[var(--muted)]"
                    }`}
                    onClick={() => setViewMode("card")}
                  >
                    <GridIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className={fillMode ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto"}>
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  No organizations match “{search.trim()}”.
                </p>
              ) : viewMode === "table" ? (
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th className="tb-table-col tb-table-col-name">
                        <span className="tb-table-name-head">Organization</span>
                      </th>
                      <th className="tb-table-col tb-table-col-jira">Projects</th>
                      <th className="tb-table-col tb-table-col-ado">Members</th>
                      <th className="tb-table-actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((org) => (
                      <tr key={org.id}>
                        <td className="tb-table-col tb-table-col-name">
                          <div className="flex items-center gap-3">
                            <span className="tb-org-avatar" aria-hidden>
                              {orgInitials(org.name)}
                            </span>
                            <Link
                              className="min-w-0 truncate font-semibold text-[var(--accent)] hover:underline"
                              to={`/organizations/${org.id}`}
                            >
                              {org.name}
                            </Link>
                          </div>
                        </td>
                        <td className="tb-table-col tb-table-col-jira">
                          <div className="flex justify-center">
                            <UsageMeter org={org} />
                          </div>
                        </td>
                        <td className="tb-table-col tb-table-col-ado">
                          <span className="tb-count-pill">{org.memberCount ?? 0}</span>
                        </td>
                        <td className="tb-table-actions-col">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              to={`/organizations/${org.id}`}
                              className="tb-btn-primary px-3 py-1.5 text-xs"
                            >
                              View
                            </Link>
                            {canCreate && (
                              <button
                                type="button"
                                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                                disabled={deleteMutation.isPending}
                                onClick={() => setDeleteTarget({ id: org.id, name: org.name })}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((org) => (
                    <article key={org.id} className="tb-org-card">
                      <div className="flex items-center gap-3">
                        <span className="tb-org-avatar" aria-hidden>
                          {orgInitials(org.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                            Organization
                          </p>
                          <h3 className="truncate text-lg font-bold tracking-tight text-[var(--ink)]">
                            <Link
                              className="hover:text-[var(--accent)]"
                              to={`/organizations/${org.id}`}
                            >
                              {org.name}
                            </Link>
                          </h3>
                        </div>
                      </div>

                      <dl className="mt-4 space-y-3">
                        <div className="rounded-xl bg-[var(--panel-elevated)] px-3 py-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            Projects
                          </dt>
                          <dd className="mt-1">
                            <UsageMeter org={org} />
                          </dd>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-[var(--panel-elevated)] px-3 py-2">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                            Members
                          </dt>
                          <dd className="text-lg font-bold text-[var(--ink)]">
                            {org.memberCount ?? 0}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <Link
                          to={`/organizations/${org.id}`}
                          className="tb-btn-primary px-3 py-1.5 text-xs"
                        >
                          View
                        </Link>
                        {canCreate && (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeleteTarget({ id: org.id, name: org.name })}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {filtered.length > 0 && (
              <div className="shrink-0">
                <Pagination
                  page={safePage}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  startIdx={startIdx}
                  endIdx={endIdx}
                  totalPages={totalPages}
                  itemLabel="organizations"
                  onPage={setPage}
                  onPageSize={setPageSize}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete organization"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This also deletes its projects and bugs. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete organization"
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
