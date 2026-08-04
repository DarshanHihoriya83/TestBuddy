import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import {
  createOrganization,
  deleteOrganization,
  fetchOrganizations,
} from "../api";
import { useAuth } from "../auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canCreateOrganization } from "../utils/roles";
import {
  ALPHA_NAME_MAX_LENGTH,
  normalizeOrganizationName,
  validateOrganizationName,
} from "../utils/validation";

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
  const [nameHint, setNameHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (org) => {
      setName("");
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

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeOrganizationName(name);
    setName(normalized);
    const nameErr = validateOrganizationName(normalized);
    if (nameErr) {
      setNameHint(nameErr);
      setError(nameErr);
      setMessage(null);
      return;
    }
    setError(null);
    createMutation.mutate({ name: normalized });
  }

  function openCreateForm() {
    setShowCreateForm(true);
    setName("");
    setNameHint(null);
    setError(null);
    setMessage(null);
  }

  function cancelCreateForm() {
    setShowCreateForm(false);
    setName("");
    setNameHint(null);
    setError(null);
  }

  const orgs = orgsQuery.data ?? [];
  const nameInvalid = !!validateOrganizationName(name);

  return (
    <Shell title="Organizations">
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

      <FlashAlert error={error} message={message} className="mb-4" />

      {canCreate && showCreateForm && (
        <form className="tb-card tb-card-accent mb-8 space-y-4 p-6" onSubmit={onCreate}>
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

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="tb-btn-primary"
              disabled={createMutation.isPending || !normalizeOrganizationName(name) || nameInvalid}
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
        <div className="tb-card border-dashed p-10 text-center">
          <p className="text-lg font-semibold text-[var(--ink)]">No organizations yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {canCreate
              ? "Click Create Organization to add your first organization."
              : "You are not a member of any organization yet."}
          </p>
          {canCreate && !showCreateForm && (
            <button type="button" className="tb-btn-primary mt-5 text-sm" onClick={openCreateForm}>
              Create Organization
            </button>
          )}
        </div>
      )}

      {orgs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orgs.map((org) => (
            <article key={org.id} className="tb-card flex flex-col p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                Organization
              </p>
              <h3 className="mt-1 text-xl font-bold tracking-tight text-[var(--ink)]">
                <Link className="hover:text-[var(--accent)]" to={`/organizations/${org.id}`}>
                  {org.name}
                </Link>
              </h3>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[var(--panel-elevated)] px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Projects
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold text-[var(--ink)]">
                    {org.projectCount ?? 0}
                  </dd>
                </div>
                <div className="rounded-xl bg-[var(--panel-elevated)] px-3 py-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Members
                  </dt>
                  <dd className="mt-0.5 text-lg font-bold text-[var(--ink)]">
                    {org.memberCount ?? 0}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Link
                  to={`/organizations/${org.id}`}
                  className="tb-btn-primary px-3 py-1.5 text-xs"
                >
                  Open
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
