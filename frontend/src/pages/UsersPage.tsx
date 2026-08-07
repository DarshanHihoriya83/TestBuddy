import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  adminDeleteUser,
  adminHardDeleteUser,
  adminUpdateUser,
  fetchAdminUsers,
  fetchOrganizations,
  fetchProjects,
} from "../api";
import { useAuth } from "../auth";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { UserFiltersBar, type StatusFilter } from "../components/users/UserFiltersBar";
import { CreateUserModal } from "../components/users/CreateUserModal";
import { ResetPasswordModal } from "../components/users/ResetPasswordModal";
import { ChangeRoleModal } from "../components/users/ChangeRoleModal";
import { EditUserModal, type EditUserAccess } from "../components/users/EditUserModal";
import { UserActionsMenu } from "../components/users/UserActionsMenu";
import { queryKeys } from "../queryKeys";
import type { User, UserRole, UserWithTemporaryPassword } from "../types";
import {
  assignableRoles,
  canChangeUserRole,
  canManageRole,
  canTransferRoles,
  isAdmin,
  isSuperAdmin,
  roleLabel,
} from "../utils/roles";
import { notifyError, notifySuccess } from "../utils/notify";
import { paginate } from "../utils/pagination";
import { validateEmail, validateName } from "../utils/validation";

const ROLE_CHIP_CLASS: Partial<Record<UserRole, string>> = {
  SUPERADMIN: "is-superadmin",
  MANAGER: "is-manager",
  DEVELOPER: "is-developer",
  TESTER: "is-tester",
};

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const roles = useMemo(() => assignableRoles(me), [me]);
  const canFullUserAdmin = isAdmin(me);
  const canRoles = canTransferRoles(me);

  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showCreate, setShowCreate] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
    enabled: canRoles,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.usersAdmin(projectFilter || undefined),
    queryFn: () => fetchAdminUsers(projectFilter || undefined),
    enabled: canRoles,
  });

  // SuperAdmin picks the target org when creating a user; nobody else needs the list.
  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: fetchOrganizations,
    enabled: canFullUserAdmin && isSuperAdmin(me),
  });

  const allUsers = usersQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  const createProjectDefaults = useMemo(
    () => (projectFilter ? [projectFilter] : []),
    [projectFilter],
  );

  const roleCounts = useMemo(() => {
    // SuperAdmin is reserved — leave it out of every role-filter count,
    // including "All roles".
    let all = 0;
    const map: Record<string, number> = {};
    for (const u of allUsers) {
      if (u.role === "SUPERADMIN") continue;
      all += 1;
      map[u.role] = (map[u.role] || 0) + 1;
    }
    map.ALL = all;
    return map;
  }, [allUsers]);

  const statusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const u of allUsers) {
      if (u.active === false) inactive += 1;
      else active += 1;
    }
    return { active, inactive, all: allUsers.length };
  }, [allUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && u.active === false) return false;
      if (statusFilter === "inactive" && u.active !== false) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [allUsers, roleFilter, statusFilter, search]);

  const { totalPages, safePage, startIdx, endIdx, pageItems } = paginate(filtered, page, pageSize);

  // A narrowed result set should start from the top, not from whatever page
  // number happened to be selected for the previous one.
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, projectFilter, pageSize]);

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    await queryClient.invalidateQueries({ queryKey: ["project-members"] });
    await queryClient.invalidateQueries({ queryKey: ["user-memberships"] });
    await queryClient.invalidateQueries({ queryKey: ["organization-members"] });
  };

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Parameters<typeof adminUpdateUser>[1];
      userName: string;
    }) => adminUpdateUser(id, body),
    onSuccess: async (_data, vars) => {
      setEditing(null);
      setEditError(null);
      setMessage(null);
      setError(null);
      notifySuccess(`${vars.userName} updated`);
      await invalidateUsers();
    },
    // Keep the failure inside the dialog so the edits are not lost.
    onError: (err: Error) => setEditError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string; userName: string }) => adminDeleteUser(id),
    onSuccess: async (_data, vars) => {
      setMessage(null);
      setError(null);
      notifySuccess(`${vars.userName} deactivated. Sign-in access has been blocked.`);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      notifyError(err.message);
      setError(null);
      setMessage(null);
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({ id }: { id: string; userName: string }) => adminUpdateUser(id, { active: true }),
    onSuccess: async (_data, vars) => {
      setMessage(null);
      setError(null);
      notifySuccess(`${vars.userName} activated. They can sign in again.`);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      notifyError(err.message);
      setError(null);
      setMessage(null);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: adminHardDeleteUser,
    onSuccess: async () => {
      setMessage("User permanently deleted");
      setError(null);
      setEditing(null);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole; userName: string }) =>
      adminUpdateUser(id, { role }),
    onSuccess: async (_data, vars) => {
      setRoleChangeUser(null);
      setRoleChangeError(null);
      setError(null);
      notifySuccess(`${vars.userName} is now ${roleLabel(vars.role)}`);
      await invalidateUsers();
    },
    // Keep the failure inside the modal so the admin can retry without reopening.
    onError: (err: Error) => setRoleChangeError(err.message),
  });

  if (!canRoles) {
    return <Navigate to="/projects" replace />;
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("ALL");
    setStatusFilter("active");
    setProjectFilter("");
  }

  function onCreateSuccess(user: UserWithTemporaryPassword) {
    setMessage(null);
    setError(null);
    notifySuccess(`${user.name} created successfully`);
    void invalidateUsers();
  }

  function onSaveEdit(e: FormEvent, access?: EditUserAccess) {
    e.preventDefault();
    if (!editing) return;
    const nameErr = validateName(editing.name);
    if (nameErr) {
      setEditError(nameErr);
      return;
    }
    const emailErr = validateEmail(editing.email);
    if (emailErr) {
      setEditError(emailErr);
      return;
    }
    if (isSuperAdmin(me) && access && !access.organizationId) {
      setEditError("Select an organization to save access changes");
      return;
    }
    setEditError(null);
    updateMutation.mutate({
      id: editing.id,
      userName: editing.name.trim(),
      body: {
        name: editing.name.trim(),
        email: editing.email.trim(),
        role: editing.role,
        active: editing.active !== false,
        ...(access ? { organizationId: access.organizationId, projectIds: access.projectIds } : {}),
      },
    });
  }

  const filtersDirty =
    search.trim() !== "" ||
    roleFilter !== "ALL" ||
    statusFilter !== "active" ||
    projectFilter !== "";

  return (
    <Shell title="Users">
      {/* Fill the Shell viewport: filters + column header stay put;
          user rows and pagination scroll together inside the card. */}
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden pb-1">
        <div className="shrink-0 space-y-3">
          <PageHeader
            description={
              canFullUserAdmin
                ? "Create users, change roles, and manage account status."
                : "Browse users in your organizations."
            }
          />

          <FlashAlert error={error} message={message} />

          <CreateUserModal
            open={showCreate && canFullUserAdmin}
            onClose={() => setShowCreate(false)}
            roles={roles}
            projects={projects}
            organizations={organizations}
            requireOrganization={isSuperAdmin(me)}
            initialProjectIds={createProjectDefaults}
            onCreated={onCreateSuccess}
          />

          <ResetPasswordModal
            user={resetUser}
            onClose={() => setResetUser(null)}
            onReset={(u) => {
              setMessage(`Temporary password generated for ${u.name} — copy it before closing.`);
              setError(null);
              void invalidateUsers();
            }}
          />

          {canFullUserAdmin && (
            <EditUserModal
              editing={editing}
              meId={me?.id}
              roles={roles}
              projects={projects}
              organizations={organizations}
              requireOrganization={isSuperAdmin(me)}
              busy={updateMutation.isPending}
              error={editError}
              onChange={setEditing}
              onCancel={() => {
                setEditing(null);
                setEditError(null);
              }}
              onSubmit={onSaveEdit}
            />
          )}

          <ChangeRoleModal
            user={roleChangeUser}
            roles={roles}
            busy={changeRoleMutation.isPending}
            error={roleChangeError}
            onClose={() => {
              setRoleChangeUser(null);
              setRoleChangeError(null);
            }}
            onSubmit={(role) => {
              if (!roleChangeUser) return;
              changeRoleMutation.mutate({
                id: roleChangeUser.id,
                role,
                userName: roleChangeUser.name,
              });
            }}
          />

          <UserFiltersBar
            projects={projects}
            projectFilter={projectFilter}
            onProjectFilter={(id) => {
              setProjectFilter(id);
              setRoleFilter("ALL");
            }}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            roleFilter={roleFilter}
            onRoleFilter={setRoleFilter}
            statusCounts={statusCounts}
            roleCounts={roleCounts}
            filtersDirty={filtersDirty}
            onClear={clearFilters}
            actions={
              canFullUserAdmin ? (
                <button
                  type="button"
                  className="tb-btn-primary text-sm"
                  onClick={() => {
                    setShowCreate(true);
                    setError(null);
                  }}
                >
                  Create user
                </button>
              ) : null
            }
          />
        </div>

        <div className="tb-card tb-user-table flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--bg0)] px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold tracking-tight text-[var(--ink)]">
                {projectFilter ? "Project members" : "Directory"}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {filtered.length} user{filtered.length === 1 ? "" : "s"}
                {filtered.length !== allUsers.length ? ` · filtered from ${allUsers.length}` : ""}
              </p>
            </div>
          </div>

          <QueryStatus
            isLoading={usersQuery.isLoading}
            error={usersQuery.error}
            onRetry={() => void usersQuery.refetch()}
            loadingText="Loading users…"
            className="m-4 shrink-0"
          />

          {!usersQuery.isLoading && filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className="font-medium text-[var(--ink)]">
                {projectFilter ? "No members in this project" : "No users match these filters"}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {projectFilter
                  ? "Add members from Settings → Members, or create a user assigned to this project."
                  : "Try another role/status, or clear search."}
              </p>
              {filtersDirty && (
                <button type="button" className="tb-btn-ghost mt-4 text-xs" onClick={clearFilters}>
                  Reset filters
                </button>
              )}
            </div>
          )}

          {!usersQuery.isLoading && filtered.length > 0 && (
            <>
              <div className="tb-user-head shrink-0">
                <span>User</span>
                <span>Designation</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div>
                  {pageItems.map((u) => {
                    const roleChip = ROLE_CHIP_CLASS[u.role] ?? "";
                    const isYou = u.id === me?.id;
                    const inactive = u.active === false;
                    return (
                      <div
                        key={u.id}
                        className={`tb-user-row ${isYou ? "is-you" : ""} ${
                          inactive ? "is-inactive" : ""
                        }`}
                      >
                        <div className="tb-user-identity">
                          <span className={`tb-user-avatar ${roleChip}`} aria-hidden>
                            {userInitials(u.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--ink)]">
                              {u.name}
                              {isYou ? <span className="tb-user-you">You</span> : null}
                            </p>
                            <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
                          </div>
                        </div>
                        <div className="tb-user-col-role">
                          <span className={`tb-role-chip ${roleChip}`}>{roleLabel(u.role)}</span>
                        </div>
                        <div className="tb-user-col-status">
                          <span
                            className={`tb-status-pill ${inactive ? "is-inactive" : "is-active"}`}
                          >
                            <span className="tb-status-dot" aria-hidden />
                            {inactive ? "Inactive" : "Active"}
                          </span>
                        </div>
                        <div className="tb-user-col-actions">
                          {canChangeUserRole(me, u) && (
                            <button
                              type="button"
                              className="tb-btn-ghost tb-user-action-btn text-xs"
                              onClick={() => {
                                setRoleChangeUser(u);
                                setRoleChangeError(null);
                                setEditing(null);
                                setShowCreate(false);
                                setError(null);
                              }}
                            >
                              Change role
                            </button>
                          )}
                          {canFullUserAdmin && (
                            <UserActionsMenu
                              user={u}
                              canEdit
                              canResetPassword={!isYou && !inactive && canManageRole(me, u.role)}
                              canChangeStatus={!isYou && canManageRole(me, u.role)}
                              canDeleteForever={isSuperAdmin(me) && !isYou && inactive}
                              busy={
                                deleteMutation.isPending ||
                                activateMutation.isPending ||
                                hardDeleteMutation.isPending
                              }
                              onEdit={() => {
                                setEditing(u);
                                setError(null);
                                setShowCreate(false);
                                setRoleChangeUser(null);
                              }}
                              onResetPassword={() => {
                                setResetUser(u);
                                setError(null);
                                setMessage(null);
                                setShowCreate(false);
                                setEditing(null);
                                setRoleChangeUser(null);
                              }}
                              onActivate={() => {
                                activateMutation.mutate({ id: u.id, userName: u.name });
                              }}
                              onDeactivate={() => {
                                if (
                                  window.confirm(
                                    `Deactivate ${u.name}? Their existing sessions will stop working and they will no longer be able to sign in.`,
                                  )
                                ) {
                                  deleteMutation.mutate({ id: u.id, userName: u.name });
                                }
                              }}
                              onDeleteForever={() => {
                                if (
                                  window.confirm(
                                    `Permanently delete ${u.name}? This cannot be undone. Bug history will keep their name as an ID only.`,
                                  )
                                ) {
                                  hardDeleteMutation.mutate(u.id);
                                }
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Pagination
                  page={safePage}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  startIdx={startIdx}
                  endIdx={endIdx}
                  totalPages={totalPages}
                  itemLabel="users"
                  onPage={setPage}
                  onPageSize={setPageSize}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
