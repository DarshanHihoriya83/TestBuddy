import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import {
  createOrganization,
  deleteOrganization,
  fetchOrganizations,
} from "../api";
import { useAuth } from "../auth";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canCreateOrganization } from "../utils/roles";
import { validateName } from "../utils/validation";

export function OrganizationsPage() {
  const { user } = useAuth();
  const canCreate = canCreateOrganization(user);
  const queryClient = useQueryClient();
  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
  });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async () => {
      setName("");
      setMessage("Organization created");
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
      setMessage("Organization deleted");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const nameErr = validateName(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    createMutation.mutate({ name: name.trim() });
  }

  return (
    <Shell title="Organizations">
      <p className="mb-6 text-sm text-[var(--muted)]">
        {canCreate
          ? "Create organizations and open one to see its projects."
          : "Organizations you belong to. Ask a SuperAdmin to create a new one."}
      </p>

      {error && <p className="tb-alert-error mb-4">{error}</p>}
      {message && <p className="tb-alert-success mb-4">{message}</p>}

      {canCreate && (
        <form className="tb-card tb-card-accent mb-8 p-5" onSubmit={onCreate}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">
            Create organization
          </h3>
          <label className="tb-label mt-4 max-w-md">
            Name *
            <input
              className="tb-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <button
            type="submit"
            className="tb-btn-primary mt-4"
            disabled={createMutation.isPending || !name.trim()}
          >
            {createMutation.isPending ? "Creating…" : "Create organization"}
          </button>
        </form>
      )}

      <QueryStatus
        isLoading={orgsQuery.isLoading}
        error={orgsQuery.error}
        onRetry={() => void orgsQuery.refetch()}
        loadingText="Loading…"
      />

      <div className="tb-table-wrap">
        <table className="tb-table">
          <thead>
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgsQuery.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                  No organizations yet.
                </td>
              </tr>
            )}
            {orgsQuery.data?.map((org) => (
              <tr key={org.id}>
                <td className="px-4 py-3 font-medium">
                  <Link className="tb-link" to={`/organizations/${org.id}`}>
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{org.projectCount ?? 0}</td>
                <td className="px-4 py-3">{org.memberCount ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/organizations/${org.id}`}
                      className="tb-btn-ghost px-2.5 py-1 text-xs"
                    >
                      Open
                    </Link>
                    {canCreate && (
                      <button
                        type="button"
                        className="rounded-lg border border-red-900/50 px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete organization "${org.name}"? This also deletes its projects and bugs.`,
                            )
                          ) {
                            deleteMutation.mutate(org.id);
                          }
                        }}
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
      </div>
    </Shell>
  );
}
