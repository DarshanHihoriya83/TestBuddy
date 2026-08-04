import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProjectMember,
  adminResetPassword,
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
import { queryKeys } from "../queryKeys";
import type { User } from "../types";
import {
  canManageProjectMembers,
  canManageRole,
  canTransferRoles,
  roleLabel,
} from "../utils/roles";
import {
  validateName,
  validateNewPassword,
  validateRequiredPasswordChange,
} from "../utils/validation";

type Section = "profile" | "password" | "members" | "reset";

export function SettingsPage() {
  const { user, updateUser, token } = useAuth();
  const canReset = canTransferRoles(user);
  const canMembers = canManageProjectMembers(user);

  const [section, setSection] = useState<Section>("profile");

  const sections = useMemo(() => {
    const items: { id: Section; label: string }[] = [
      { id: "profile", label: "Profile" },
      { id: "password", label: "Change password" },
      { id: "members", label: "Members" },
    ];
    if (canReset) items.push({ id: "reset", label: "Reset password" });
    return items;
  }, [canReset]);

  useEffect(() => {
    if (section === "reset" && !canReset) setSection("profile");
  }, [section, canReset]);

  return (
    <Shell title="Settings">
      <PageHeader description="Manage your account, project members, and team passwords." />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:gap-1"
          aria-label="Settings sections"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                section === s.id
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--input-bg)] hover:text-[var(--ink)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "profile" && <ProfileSection token={!!token} updateUser={updateUser} user={user} />}
          {section === "password" && <ChangePasswordSection updateUser={updateUser} user={user} />}
          {section === "members" && (
            <MembersSection canManage={canMembers} currentUserId={user?.id} />
          )}
          {section === "reset" && canReset && <ResetPasswordSection me={user} />}
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
  const initials =
    profile?.name
      ?.split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nameErr = validateName(name);
      if (nameErr) throw new Error(nameErr);
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
      <header className="flex items-center gap-4">
        <div
          className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)] text-lg font-semibold text-white"
          aria-hidden
        >
          {initials}
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">{profile?.name ?? "…"}</h2>
          <p className="text-sm text-[var(--muted)]">{profile?.email}</p>
        </div>
      </header>

      <QueryStatus
        isLoading={meQuery.isLoading}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        loadingText="Loading profile…"
      />

      <form onSubmit={onSave} className="tb-card space-y-4 p-5">
        <label className="tb-label">
          Display name
          <input
            className="tb-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="tb-label">
          Email
          <input
            className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
            value={profile?.email ?? ""}
            disabled
            readOnly
          />
        </label>
        <label className="tb-label">
          Role
          <input
            className="tb-input bg-[var(--bg0)] text-[var(--muted)]"
            value={profile?.role ? roleLabel(profile.role) : ""}
            disabled
            readOnly
          />
        </label>
        <FlashAlert error={error} message={message} className="" />
        <button type="submit" disabled={busy || !name.trim()} className="tb-btn-primary">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      );
      if (passwordErr) throw new Error(passwordErr);
      const updated = await updateProfile({
        name: user?.name?.trim() || "User",
        currentPassword,
        newPassword,
      });
      updateUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="tb-card max-w-lg space-y-4 p-5">
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">Change password</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter your current password, then choose a new one (min 8 characters).
        </p>
      </div>
      <label className="tb-label">
        Current password
        <input
          type="password"
          className="tb-input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label className="tb-label">
        New password
        <input
          type="password"
          className="tb-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="tb-label">
        Confirm new password
        <input
          type="password"
          className="tb-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <FlashAlert error={error} message={message} className="" />
      <button type="submit" disabled={busy} className="tb-btn-primary">
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
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

  const projects = projectsQuery.data ?? [];

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
  const addableUsers = (usersQuery.data ?? []).filter(
    (u) => u.active !== false && !memberIds.has(u.id),
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
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">Members</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Select a project to view
          {canManage ? " and manage" : ""} its members.
        </p>
      </div>

      <QueryStatus
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => void projectsQuery.refetch()}
        loadingText="Loading projects…"
      />

      {!projectsQuery.isLoading && projects.length === 0 && (
        <div className="tb-card border-dashed p-6 text-center text-sm text-[var(--muted)]">
          No projects yet. Ask a Manager to assign you, or create one if your role allows.
        </div>
      )}

      {projects.length > 0 && (
        <ul className="tb-card divide-y divide-[var(--line)] overflow-hidden">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  selectedProjectId === p.id
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--input-bg)]"
                }`}
                onClick={() => {
                  setSelectedProjectId(p.id);
                  setAddUserId("");
                  setError(null);
                  setMessage(null);
                }}
              >
                <span className="font-semibold text-[var(--ink)]">{p.name}</span>
                <Link
                  to={`/projects/${p.id}`}
                  className="tb-link text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open →
                </Link>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedProjectId && selectedProject && (
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
      )}
    </div>
  );
}

function ResetPasswordSection({ me }: { me: User | null }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const selected = targets.find((u) => u.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !targets.some((u) => u.id === selectedId)) setSelectedId("");
  }, [targets, selectedId]);

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const pwErr = validateNewPassword(newPassword, confirmPassword);
      if (pwErr) throw new Error(pwErr);
      await adminResetPassword(selected.id, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setMessage(`Password reset for ${selected.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">Reset password</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set a temporary password for users you manage
          {me?.role === "MANAGER"
            ? " (Manager, Developer, Tester)."
            : " (any role)."}
        </p>
      </div>

      <QueryStatus
        isLoading={usersQuery.isLoading}
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
        loadingText="Loading users…"
      />

      <label className="tb-label max-w-md">
        Search users
        <input
          className="tb-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email, or role"
        />
      </label>

      <div className="tb-card max-h-56 overflow-y-auto divide-y divide-[var(--line)]">
        {targets.length === 0 && !usersQuery.isLoading ? (
          <p className="p-4 text-sm text-[var(--muted)]">No manageable users found.</p>
        ) : (
          targets.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                selectedId === u.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--input-bg)]"
              }`}
              onClick={() => {
                setSelectedId(u.id);
                setError(null);
                setMessage(null);
              }}
            >
              <span>
                <span className="font-semibold text-[var(--ink)]">{u.name}</span>
                <span className="ml-2 text-[var(--muted)]">{u.email}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-[var(--muted)]">
                {roleLabel(u.role)}
              </span>
            </button>
          ))
        )}
      </div>

      {selected && (
        <form onSubmit={onReset} className="tb-card max-w-lg space-y-4 p-5">
          <p className="text-sm text-[var(--ink)]">
            Reset password for <strong>{selected.name}</strong> ({roleLabel(selected.role)})
          </p>
          <label className="tb-label">
            New temporary password
            <input
              type="password"
              className="tb-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="tb-label">
            Confirm password
            <input
              type="password"
              className="tb-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <FlashAlert error={error} message={message} className="" />
          <button type="submit" disabled={busy} className="tb-btn-primary">
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}
