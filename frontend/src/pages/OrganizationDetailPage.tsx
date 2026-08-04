import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  addOrganizationMember,
  fetchOrganization,
  fetchOrganizationMembers,
  fetchUsers,
  removeOrganizationMember,
} from "../api";
import { useAuth } from "../auth";
import { FlashAlert } from "../components/FlashAlert";
import { MemberList, MemberPicker } from "../components/MemberPicker";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { queryKeys } from "../queryKeys";
import { canManageOrgMembers } from "../utils/roles";

export function OrganizationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const canManage = canManageOrgMembers(user);
  const queryClient = useQueryClient();
  const [addUserId, setAddUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    () => (usersQuery.data ?? []).filter((u) => u.active !== false && !memberIds.has(u.id)),
    [usersQuery.data, memberIds],
  );

  const addMutation = useMutation({
    mutationFn: (userId: string) => addOrganizationMember(id, userId),
    onSuccess: async () => {
      setAddUserId("");
      setMessage("Member added");
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
      setMessage("Member removed");
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

  const org = orgQuery.data;
  const projects = org?.projects ?? [];

  return (
    <Shell title="Organization">
      <Link to="/organizations" className="tb-link text-sm">
        ← Back to organizations
      </Link>

      <QueryStatus
        isLoading={orgQuery.isLoading}
        error={orgQuery.error}
        onRetry={() => void orgQuery.refetch()}
        loadingText="Loading…"
        className="mt-4"
      />

      {org && (
        <div className="mt-4 space-y-6">
          <header className="tb-card tb-card-accent p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Organization
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-[var(--ink)]">
              {org.name}
            </h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              {org.projectCount ?? projects.length} projects · {org.memberCount ?? members.length}{" "}
              members
            </p>
          </header>

          <section className="tb-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-[var(--ink)]">
                Projects
                <span className="ml-2 text-sm font-semibold text-[var(--muted)]">
                  ({projects.length})
                </span>
              </h3>
              <Link to="/projects" className="tb-link text-sm">
                All projects →
              </Link>
            </div>
            {projects.length === 0 && (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No projects yet. Admin or Manager can create one under this organization.
              </p>
            )}
            <div className="mt-3 divide-y divide-[var(--line)]">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <Link className="tb-link font-medium" to={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                  <Link
                    to={`/projects/${p.id}`}
                    className="tb-btn-ghost px-2.5 py-1 text-xs"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section className="tb-card p-5">
            <h3 className="text-base font-bold text-[var(--ink)]">
              Members
              <span className="ml-2 text-sm font-semibold text-[var(--muted)]">
                ({members.length})
              </span>
            </h3>

            <FlashAlert error={error} message={message} className="mt-3" />

            {canManage && (
              <div className="mt-4">
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
              onRemove={(userId) => removeMutation.mutate(userId)}
              emptyText="No members yet."
            />
          </section>
        </div>
      )}
    </Shell>
  );
}
