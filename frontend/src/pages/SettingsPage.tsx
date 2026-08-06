import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectMember,
  fetchAdminUsers,
  fetchMe,
  fetchProjectMembers,
  fetchProjects,
  fetchUsers,
  removeProjectMember,
  updateProfile,
} from "../api";
import { useAuth } from "../auth";
import { FlashAlert } from "../components/FlashAlert";
import { PageHeader } from "../components/PageHeader";
import { ProjectMembersPanel } from "../components/project/ProjectMembersPanel";
import { QueryStatus } from "../components/QueryStatus";
import { Shell } from "../components/Shell";
import { ResetPasswordModal } from "../components/users/ResetPasswordModal";
import {
  FieldWithIcon,
  IconLock,
  IconMail,
  IconRefresh,
  IconShield,
  IconUser,
  PasswordField,
  PasswordStrengthMeter,
} from "../components/users/UserPasswordUi";
import { queryKeys } from "../queryKeys";
import type { User, UserRole } from "../types";
import {
  addableMemberUsers,
  canManageProjectMembers,
  canManageRole,
  canTransferRoles,
  roleLabel,
} from "../utils/roles";
import {
  validateName,
  validatePasswordStrength,
  validateRequiredPasswordChange,
} from "../utils/validation";

type Section = "profile" | "password" | "members" | "reset";

const ROLE_CHIP: Record<UserRole, string> = {
  SUPERADMIN: "is-superadmin",
  MANAGER: "is-manager",
  DEVELOPER: "is-developer",
  TESTER: "is-tester",
};

function initialsOf(name?: string | null) {
  return (
    name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function NavIcon({ name }: { name: Section }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (name) {
    case "profile":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M5 20c0-3 3.1-5.5 7-5.5s7 2.5 7 5.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "password":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M8 11V8a4 4 0 1 1 8 0v3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "members":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M16 11h5M18.5 8.5v5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M17 3v4h-4M7 21v-4h4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`tb-card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-[var(--ink)]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { user, updateUser, token } = useAuth();
  const canReset = canTransferRoles(user);
  const canMembers = canManageProjectMembers(user);

  const [section, setSection] = useState<Section>("profile");

  const sections = useMemo(() => {
    const items: { id: Section; label: string; hint: string }[] = [
      { id: "profile", label: "Profile", hint: "Name & account" },
      { id: "password", label: "Password", hint: "Update credentials" },
      { id: "members", label: "Members", hint: "Project access" },
    ];
    if (canReset) {
      items.push({ id: "reset", label: "Reset password", hint: "Temporary passwords" });
    }
    return items;
  }, [canReset]);

  useEffect(() => {
    if (section === "reset" && !canReset) setSection("profile");
  }, [section, canReset]);

  return (
    <Shell title="Settings">
      <div className="space-y-4 pb-4">
        <PageHeader description="Manage your account, project members, and team passwords." />

        <div className="tb-settings-layout">
          <nav className="tb-settings-nav" aria-label="Settings sections">
            <p className="tb-settings-nav-title">Account</p>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={`tb-settings-nav-btn ${section === s.id ? "is-active" : ""}`}
              >
                <span className="tb-settings-nav-icon">
                  <NavIcon name={s.id} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--muted)]">
                    {s.hint}
                  </span>
                </span>
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1">
            {section === "profile" && (
              <ProfileSection token={!!token} updateUser={updateUser} user={user} />
            )}
            {section === "password" && (
              <ChangePasswordSection updateUser={updateUser} user={user} />
            )}
            {section === "members" && (
              <MembersSection canManage={canMembers} currentUserId={user?.id} />
            )}
            {section === "reset" && canReset && <ResetPasswordSection me={user} />}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ProfileSection({
  token,
  user,
  updateUser,
}: {
  token: boolean;
  user: User | null;
  updateUser: (u: User) => void;
}) {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: token,
  });
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meQuery.data) return;
    setName(meQuery.data.name);
    updateUser(meQuery.data);
  }, [meQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps -- sync once from server

  const profile = meQuery.data ?? user;
  const initials = initialsOf(profile?.name);
  const dirty = name.trim() !== (profile?.name ?? "").trim();
  const nameErr = name.trim() ? validateName(name) : null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const err = validateName(name);
      if (err) throw new Error(err);
      const updated = await updateProfile({ name: name.trim() });
      updateUser(updated);
      setMessage("Profile saved");
      await meQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <QueryStatus
        isLoading={meQuery.isLoading}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        loadingText="Loading profile…"
      />

      <section className="tb-card overflow-hidden">
        <div className="tb-settings-hero">
          <div className="tb-settings-hero-avatar" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              Your account
            </p>
            <h2 className="truncate text-xl font-extrabold tracking-tight text-[var(--ink)]">
              {profile?.name ?? "…"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-[var(--muted)]">{profile?.email}</p>
          </div>
          {profile?.role ? (
            <span className={`tb-role-chip ml-auto ${ROLE_CHIP[profile.role]}`}>
              {roleLabel(profile.role)}
            </span>
          ) : null}
        </div>

        <form onSubmit={onSave} className="space-y-4 p-5">
          <FieldWithIcon
            label="Display name"
            required
            icon={<IconUser />}
            hint="Shown across the dashboard"
            error={nameErr}
          >
            <input
              className={`tb-input ${nameErr ? "tb-input-invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </FieldWithIcon>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWithIcon label="Email" icon={<IconMail />} hint="Cannot be changed here">
              <input
                className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
                value={profile?.email ?? ""}
                disabled
                readOnly
              />
            </FieldWithIcon>
            <FieldWithIcon
              label="Designation"
              icon={<IconShield />}
              hint="Assigned by an administrator"
            >
              <input
                className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
                value={profile?.role ? roleLabel(profile.role) : ""}
                disabled
                readOnly
              />
            </FieldWithIcon>
          </div>

          <FlashAlert error={error} message={message} className="" />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
            <button
              type="button"
              className="tb-btn-ghost text-sm"
              disabled={busy || !dirty}
              onClick={() => {
                setName(profile?.name ?? "");
                setError(null);
                setMessage(null);
              }}
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={busy || !dirty || !!nameErr || !name.trim()}
              className="tb-btn-primary text-sm"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ChangePasswordSection({
  user,
  updateUser,
}: {
  user: User | null;
  updateUser: (u: User) => void;
}) {
  const { setSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo(
    () => ({ name: user?.name, email: user?.email }),
    [user?.name, user?.email],
  );
  const strengthError = newPassword ? validatePasswordStrength(newPassword, context) : null;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const passwordErr = validateRequiredPasswordChange(
        currentPassword,
        newPassword,
        confirmPassword,
        context,
      );
      if (passwordErr) throw new Error(passwordErr);
      const updated = await updateProfile({
        name: user?.name?.trim() || "User",
        currentPassword,
        newPassword,
      });
      // Old tokens are revoked on password change — adopt the reissued one.
      if (updated.token) setSession(updated.token, updated);
      else updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated — other sessions have been signed out");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Change password"
      description="Enter your current password, then choose a new one that meets the policy below. Updating signs out every other session."
    >
      <form onSubmit={onSave} noValidate className="mx-auto max-w-xl space-y-4">
        <PasswordField
          label="Current password"
          required
          icon={<IconLock />}
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          required
          icon={<IconRefresh />}
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          error={strengthError}
        />
        <PasswordField
          label="Confirm new password"
          required
          icon={<IconRefresh />}
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={mismatch ? "New passwords do not match" : null}
        />
        <PasswordStrengthMeter password={newPassword} context={context} />
        <FlashAlert error={error} message={message} className="" />
        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <button
            type="submit"
            disabled={busy || !currentPassword || !!strengthError || mismatch || !confirmPassword}
            className="tb-btn-primary text-sm"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function MembersSection({
  canManage,
  currentUserId,
}: {
  canManage: boolean;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => fetchProjects(),
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(selectedProjectId || "_"),
    queryFn: () => fetchProjectMembers(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => fetchUsers(),
    enabled: canManage,
  });

  const members = membersQuery.data ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const addableUsers = addableMemberUsers(user, usersQuery.data ?? []).filter(
    (u) => !memberIds.has(u.id),
  );

  const addMutation = useMutation({
    mutationFn: (userId: string) => addProjectMember(selectedProjectId, userId),
    onSuccess: async () => {
      setAddUserId("");
      setMessage("Member added");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(selectedProjectId, userId),
    onSuccess: async () => {
      setMessage("Member removed");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-members"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["users-admin"] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="space-y-4">
      <QueryStatus
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        loadingText="Loading projects…"
      />

      {!projectsQuery.isLoading && projects.length === 0 && (
        <div className="tb-card border-dashed p-10 text-center">
          <p className="text-lg font-semibold text-[var(--ink)]">No projects yet</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ask a Manager to assign you, or create one if your role allows.
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="tb-settings-members">
          <aside className="tb-card flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--ink)]">Projects</h2>
              <p className="text-xs text-[var(--muted)]">
                Select a project to {canManage ? "manage" : "view"} its members
              </p>
            </div>
            <ul className="tb-settings-project-list min-h-0 flex-1 overflow-y-auto">
              {projects.map((p) => {
                const active = selectedProjectId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`tb-settings-project-row ${active ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setAddUserId("");
                        setError(null);
                        setMessage(null);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <Link
                        to={`/projects/${p.id}`}
                        className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </Link>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0">
            {selectedProjectId && selectedProject ? (
              <ProjectMembersPanel
                members={members}
                addableUsers={addableUsers}
                currentUserId={currentUserId}
                canManage={canManage}
                showUsersLink={canTransferRoles(user)}
                addUserId={addUserId}
                onAddUserIdChange={setAddUserId}
                onAdd={() => addMutation.mutate(addUserId)}
                adding={addMutation.isPending}
                onRemove={(userId) => removeMutation.mutate(userId)}
                removing={removeMutation.isPending}
                loading={membersQuery.isLoading}
                error={error}
                message={message}
                listError={membersQuery.error as Error | null}
              />
            ) : (
              <div className="tb-card grid place-items-center p-10 text-sm text-[var(--muted)]">
                Select a project to see its members.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResetPasswordSection({ me }: { me: User | null }) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.usersAdmin(),
    queryFn: () => fetchAdminUsers(),
  });

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((u) => {
      if (u.id === me?.id) return false;
      if (u.active === false) return false;
      if (!canManageRole(me, u.role)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [usersQuery.data, me, search]);

  return (
    <SectionCard
      title="Admin reset password"
      description={
        <>
          Generate a temporary password for users you manage
          {me?.role === "MANAGER" ? " (Manager, Developer, Tester)." : "."} They must change it on
          next login, and all their existing sessions are signed out.
        </>
      }
    >
      <QueryStatus
        isLoading={usersQuery.isLoading}
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
        loadingText="Loading users…"
      />

      <div className="relative mb-4 max-w-md">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          className="tb-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role…"
          aria-label="Search users"
        />
      </div>

      <FlashAlert error={null} message={message} className="mb-3" />

      <div className="overflow-hidden rounded-xl border border-[var(--line)]">
        <div className="tb-settings-reset-head">
          <span>User</span>
          <span>Designation</span>
          <span className="text-right">Action</span>
        </div>
        <ul className="tb-settings-reset-list">
          {targets.length === 0 && !usersQuery.isLoading ? (
            <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              No manageable users found.
            </li>
          ) : (
            targets.map((u) => (
              <li key={u.id} className="tb-settings-reset-row">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="tb-user-avatar" aria-hidden>
                    {initialsOf(u.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{u.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
                  </div>
                </div>
                <span className={`tb-role-chip ${ROLE_CHIP[u.role]}`}>{roleLabel(u.role)}</span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="tb-btn-ghost text-xs"
                    onClick={() => {
                      setTarget(u);
                      setMessage(null);
                    }}
                  >
                    Reset password
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <ResetPasswordModal
        user={target}
        onClose={() => setTarget(null)}
        onReset={(u) => setMessage(`Temporary password generated for ${u.name}.`)}
      />
    </SectionCard>
  );
}
