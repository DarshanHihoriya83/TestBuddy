import { useEffect, useState } from "react";
import type { User, UserRole } from "../../types";
import { roleLabel } from "../../utils/roles";
import { FlashAlert } from "../FlashAlert";
import { ModalShell } from "../ModalShell";
import { RoleOptionList } from "./RoleOptionList";
import { IconClose } from "./UserPasswordUi";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function ChangeRoleModal({
  user,
  roles,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  user: User | null;
  roles: UserRole[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (role: UserRole) => void;
}) {
  const [value, setValue] = useState<UserRole>("TESTER");
  const userId = user?.id;
  const currentRole = user?.role;

  // Keyed on the id, not the object: the users list refetches after every
  // mutation and would otherwise hand back a new object and reset the picker.
  useEffect(() => {
    if (!userId || !currentRole) return;
    setValue(currentRole);
  }, [userId, currentRole]);

  if (!user) return null;

  const options = Array.from(new Set([...roles, user.role]));
  // The current role always appears, even when the actor cannot assign it, but
  // it stays inert — you can never re-pick it anyway.
  const lockedRoles = options.filter((r) => !roles.includes(r) && r !== user.role);
  const unchanged = value === user.role;

  function close() {
    if (busy) return;
    onClose();
  }

  return (
    <ModalShell open onClose={close} labelledBy="change-role-title" dismissible={!busy}>
      <div className="tb-dialog-header flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent)]">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="change-role-title" className="truncate text-base font-bold text-[var(--ink)]">
            Change role
          </h2>
          <p className="truncate text-sm text-[var(--muted)]">
            {user.name} · {user.email}
          </p>
        </div>
        <button
          type="button"
          className="tb-btn-icon h-9 w-9 shrink-0"
          aria-label="Close"
          onClick={close}
        >
          <IconClose />
        </button>
      </div>

      <div className="px-6 py-5">
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--bg0)] px-3.5 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Current role
          </span>
          <span className="text-sm font-bold text-[var(--ink)]">{roleLabel(user.role)}</span>
        </div>

        <fieldset disabled={busy}>
          <legend className="mb-2 text-sm font-bold text-[var(--ink)]">Change to</legend>
          <RoleOptionList
            name="change-role"
            options={options}
            value={value}
            currentRole={user.role}
            lockedRoles={lockedRoles}
            autoFocusSelected
            onChange={setValue}
          />
        </fieldset>

        {/* Always rendered so picking a role does not shift the buttons. */}
        <p className="mt-4 min-h-[2.5rem] text-xs leading-relaxed text-[var(--muted)]">
          {unchanged ? (
            "Pick a different role to continue. Permissions and project visibility apply as soon as you save."
          ) : (
            <>
              <strong className="font-semibold text-[var(--ink)]">{user.name}</strong> becomes a{" "}
              <strong className="font-semibold text-[var(--ink)]">{roleLabel(value)}</strong> when
              you save. Projects they can no longer see disappear from their dashboard right away.
            </>
          )}
        </p>

        <FlashAlert error={error ?? null} message={null} className="mt-3" />
      </div>

      <div className="tb-dialog-footer">
        <button type="button" className="tb-btn-ghost text-sm" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="tb-btn-primary text-sm"
          disabled={busy || unchanged}
          onClick={() => onSubmit(value)}
        >
          {busy ? "Saving…" : "Save role"}
        </button>
      </div>
    </ModalShell>
  );
}
