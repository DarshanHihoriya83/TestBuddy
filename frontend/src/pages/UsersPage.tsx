import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  adminCreateUser,
  adminDeleteUser,
  adminHardDeleteUser,
  adminUpdateUser,
  fetchAdminUsers,
  fetchProjects,
} from "../api";
import { useAuth } from "../auth";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { UserFiltersBar, type StatusFilter } from "../components/users/UserFiltersBar";
import { ChangeRoleForm, CreateUserForm, EditUserForm } from "../components/users/UserForms";
import { queryKeys } from "../queryKeys";
import type { User, UserRole } from "../types";
import {
  assignableRoles,
  canChangeUserRole,
  canTransferRoles,
  isAdmin,
  isSuperAdmin,
  roleLabel,
} from "../utils/roles";
import { validateEmail, validateName } from "../utils/validation";

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
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("TESTER");
  const [createProjectIds, setCreateProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
  const [roleChangeValue, setRoleChangeValue] = useState<UserRole>("TESTER");

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

  const allUsers = usersQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const roleCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: allUsers.length };
    for (const u of allUsers) {
      map[u.role] = (map[u.role] || 0) + 1;
    }
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

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    await queryClient.invalidateQueries({ queryKey: ["project-members"] });
  };

  const createMutation = useMutation({
    mutationFn: adminCreateUser,
    onSuccess: async () => {
      setName("");
      setEmail("");
      setPassword("");
      setRole(roles.includes("TESTER") ? "TESTER" : roles[0] || "TESTER");
      setCreateProjectIds(projectFilter ? [projectFilter] : []);
      setShowCreate(false);
      setMessage("User created");
      setError(null);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof adminUpdateUser>[1] }) =>
      adminUpdateUser(id, body),
    onSuccess: async () => {
      setEditing(null);
      setEditPassword("");
      setMessage("User updated");
      setError(null);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminDeleteUser,
    onSuccess: async () => {
      setMessage("User deactivated");
      setError(null);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      setError(err.message);
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
      setMessage(`Role updated for ${vars.userName} → ${roleLabel(vars.role)}`);
      setError(null);
      await invalidateUsers();
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
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

  function onCreate(e: FormEvent) {
    e.preventDefault();
    const nameErr = validateName(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      projectIds: createProjectIds,
    });
  }

  function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const nameErr = validateName(editing.name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    const emailErr = validateEmail(editing.email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (editPassword && editPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      body: {
        name: editing.name.trim(),
        email: editing.email.trim(),
        role: editing.role,
        active: editing.active !== false,
        ...(editPassword ? { newPassword: editPassword } : {}),
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
      <PageHeader
        description={
          canFullUserAdmin
            ? "Create users, change roles, and manage account status."
            : "Browse users in your organizations."
        }
        actions={
          canFullUserAdmin ? (
            <button
              type="button"
              className="tb-btn-primary text-sm"
              onClick={() => {
                setShowCreate((v) => !v);
                setError(null);
                if (!showCreate && projectFilter) {
                  setCreateProjectIds([projectFilter]);
                }
              }}
            >
              {showCreate ? "Close form" : "Create user"}
            </button>
          ) : null
        }
      />

      <FlashAlert error={error} message={message} />

      {canFullUserAdmin && showCreate && (
        <CreateUserForm
          name={name}
          email={email}
          password={password}
          role={role}
          roles={roles}
          projects={projects}
          createProjectIds={createProjectIds}
          busy={createMutation.isPending}
          onName={setName}
          onEmail={setEmail}
          onPassword={setPassword}
          onRole={setRole}
          onToggleProject={(id) =>
            setCreateProjectIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          onSubmit={onCreate}
        />
      )}

      {canFullUserAdmin && editing && (
        <EditUserForm
          editing={editing}
          meId={me?.id}
          roles={roles}
          editPassword={editPassword}
          busy={updateMutation.isPending}
          onChange={setEditing}
          onPassword={setEditPassword}
          onCancel={() => setEditing(null)}
          onSubmit={onSaveEdit}
        />
      )}

      {roleChangeUser && (
        <ChangeRoleForm
          user={roleChangeUser}
          roles={roles}
          value={roleChangeValue}
          busy={changeRoleMutation.isPending}
          onValue={setRoleChangeValue}
          onCancel={() => setRoleChangeUser(null)}
          onSubmit={(e) => {
            e.preventDefault();
            if (roleChangeValue === roleChangeUser.role) {
              setRoleChangeUser(null);
              return;
            }
            if (
              !window.confirm(
                `Change ${roleChangeUser.name}'s role from ${roleLabel(roleChangeUser.role)} to ${roleLabel(roleChangeValue)}?`,
              )
            ) {
              return;
            }
            changeRoleMutation.mutate({
              id: roleChangeUser.id,
              role: roleChangeValue,
              userName: roleChangeUser.name,
            });
          }}
        />
      )}

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
      />

      <div className="tb-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--ink)]">
            {projectFilter ? "Project members" : "Users"}
            <span className="ml-2 font-semibold text-[var(--muted)]">
              ({filtered.length}
              {filtered.length !== allUsers.length ? ` of ${allUsers.length}` : ""})
            </span>
          </h3>
        </div>

        <QueryStatus
          isLoading={usersQuery.isLoading}
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
          loadingText="Loading users…"
          className="m-4"
        />

        {!usersQuery.isLoading && filtered.length === 0 && (
          <div className="p-8 text-center">
            <p className="font-medium text-[var(--ink)]">
              {projectFilter ? "No members in this project" : "No users match these filters"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {projectFilter
                ? "Add members from the project page, or create a user assigned to this project."
                : "Try another role/status, or clear search."}
            </p>
            {filtersDirty && (
              <button type="button" className="tb-btn-ghost mt-4 text-xs" onClick={clearFilters}>
                Reset filters
              </button>
            )}
          </div>
        )}

        <div className="divide-y divide-[var(--line)]">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">
                  {u.name}
                  {u.id === me?.id ? (
                    <span className="ml-2 text-xs font-medium text-[var(--accent)]">(you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {roleLabel(u.role)}
              </span>
              <span
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  u.active === false
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {u.active === false ? "Inactive" : "Active"}
              </span>
              <div className="flex gap-2">
                {canChangeUserRole(me, u) && (
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs"
                    onClick={() => {
                      setRoleChangeUser(u);
                      setRoleChangeValue(roles.includes(u.role) ? u.role : roles[0] || "TESTER");
                      setEditing(null);
                      setShowCreate(false);
                      setError(null);
                    }}
                  >
                    Change role
                  </button>
                )}
                {canFullUserAdmin && (
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs"
                    onClick={() => {
                      setEditing(u);
                      setEditPassword("");
                      setError(null);
                      setShowCreate(false);
                      setRoleChangeUser(null);
                    }}
                  >
                    Edit
                  </button>
                )}
                {canFullUserAdmin && u.id !== me?.id && u.active !== false && (
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs text-rose-600"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Deactivate ${u.name}? They will no longer be able to sign in.`,
                        )
                      ) {
                        deleteMutation.mutate(u.id);
                      }
                    }}
                  >
                    Deactivate
                  </button>
                )}
                {isSuperAdmin(me) && u.id !== me?.id && u.active === false && (
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs text-rose-700"
                    disabled={hardDeleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete ${u.name}? This cannot be undone. Bug history will keep their name as an ID only.`,
                        )
                      ) {
                        hardDeleteMutation.mutate(u.id);
                      }
                    }}
                  >
                    Delete forever
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
