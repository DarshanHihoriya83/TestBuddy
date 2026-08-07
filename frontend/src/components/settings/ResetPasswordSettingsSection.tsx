import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminUsers } from "../../api";
import { FlashAlert } from "../FlashAlert";
import { QueryStatus } from "../QueryStatus";
import { ResetPasswordModal } from "../users/ResetPasswordModal";
import { queryKeys } from "../../queryKeys";
import type { User } from "../../types";
import { canManageRole, roleLabel } from "../../utils/roles";
import { SettingsSectionCard } from "./SettingsSectionCard";
import { initialsOf, ROLE_CHIP_CLASS } from "./settingsTypes";

/**
 * Manager-only Settings tab. SuperAdmin resets passwords from Manage Users
 * instead, so this section is never mounted for that role.
 */
export function ResetPasswordSettingsSection({ me }: { me: User | null }) {
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
      if (u.role === "SUPERADMIN") return false;
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
    <SettingsSectionCard
      title="Reset password"
      description="Generate a temporary password for Managers, Developers, and Testers you manage. They must change it on next login, and all their existing sessions are signed out."
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
                  <span className={`tb-user-avatar ${ROLE_CHIP_CLASS[u.role]}`} aria-hidden>
                    {initialsOf(u.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{u.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{u.email}</p>
                  </div>
                </div>
                <span className={`tb-role-chip ${ROLE_CHIP_CLASS[u.role]}`}>
                  {roleLabel(u.role)}
                </span>
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
    </SettingsSectionCard>
  );
}
